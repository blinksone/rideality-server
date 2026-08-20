import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { wsEnv } from './config';
import { extractToken, verifyAccessToken, type SocketUser } from './auth';

const GEO_DRIVERS = 'drivers:online';
const DRIVER_META = (id: string) => `driver:${id}:meta`;

interface AuthedSocket extends Socket {
  data: {
    user: SocketUser;
    role?: 'driver' | 'rider';
    activeRideId?: string;
  };
}

async function main() {
  const httpServer = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          service: 'ws-gateway',
          architecture: 'realtime',
        }),
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const io = new Server(httpServer, {
    cors: { origin: wsEnv.CORS_ORIGIN === '*' ? true : wsEnv.CORS_ORIGIN },
    path: '/socket.io',
  });

  const pubClient = new Redis(wsEnv.REDIS_URL, { maxRetriesPerRequest: 3 });
  const subClient = pubClient.duplicate();
  const domainSub = pubClient.duplicate();
  const redisCmd = pubClient;

  await Promise.all([pubClient.ping(), subClient.ping(), domainSub.ping()]);

  io.adapter(createAdapter(pubClient, subClient));

  io.use((socket, next) => {
    try {
      const token = extractToken(socket.handshake.auth, socket.handshake.headers as Record<string, unknown>);
      if (!token) {
        next(new Error('UNAUTHORIZED'));
        return;
      }
      const user = verifyAccessToken(token);
      (socket as AuthedSocket).data.user = user;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (raw) => {
    const socket = raw as AuthedSocket;
    const userId = socket.data.user.sub;
    console.log(`[ws] connected ${userId}`);

    // Default rooms for targeted push
    void socket.join(`user:${userId}`);

    socket.on(
      'session:hello',
      (payload: { role?: 'driver' | 'rider'; rideId?: string; vehicleType?: string }) => {
        socket.data.role = payload?.role;
        const prevRide = socket.data.activeRideId as string | undefined;
        if (payload?.rideId) {
          socket.data.activeRideId = payload.rideId;
          void socket.join(`ride:${payload.rideId}`);
        } else {
          // Clear active ride so location updates stop broadcasting to completed trips
          if (prevRide) {
            void socket.leave(`ride:${prevRide}`);
          }
          socket.data.activeRideId = undefined;
        }
        if (payload?.role === 'driver') {
          void socket.join(`driver:${userId}`);
        }
        socket.emit('session:ready', {
          userId,
          role: socket.data.role,
          rideId: socket.data.activeRideId ?? null,
        });
      },
    );

    socket.on('ride:join', (payload: { rideId: string }) => {
      if (!payload?.rideId) return;
      socket.data.activeRideId = payload.rideId;
      void socket.join(`ride:${payload.rideId}`);
      socket.emit('ride:joined', { rideId: payload.rideId });
    });

    socket.on('ride:leave', (payload: { rideId: string }) => {
      if (!payload?.rideId) return;
      void socket.leave(`ride:${payload.rideId}`);
      if (socket.data.activeRideId === payload.rideId) {
        socket.data.activeRideId = undefined;
      }
    });

    socket.on(
      'driver:location_update',
      async (payload: { lat: number; lng: number; heading?: number; speed?: number; vehicleType?: string }) => {
        if (!payload || !Number.isFinite(payload.lat) || !Number.isFinite(payload.lng)) return;

        const now = Date.now();
        try {
          await redisCmd.geoadd(GEO_DRIVERS, payload.lng, payload.lat, userId);
          await redisCmd.hset(DRIVER_META(userId), {
            status: 'online',
            vehicleType: payload.vehicleType ?? 'sedan',
            lastPing: String(now),
            lat: String(payload.lat),
            lng: String(payload.lng),
            heading: String(payload.heading ?? 0),
            speed: String(payload.speed ?? 0),
          });
        } catch (err) {
          console.warn('[ws] geo write failed', err);
        }

        const rideId = socket.data.activeRideId;
        if (rideId) {
          const speed = payload.speed ?? 0;
          const etaSeconds = Math.max(30, Math.round(800 / Math.max(speed, 5))); // coarse if no dropoff
          io.to(`ride:${rideId}`).emit('ride:location_broadcast', {
            rideId,
            lat: payload.lat,
            lng: payload.lng,
            heading: payload.heading ?? 0,
            etaSeconds,
            driverId: userId,
          });
        }
      },
    );

    socket.on(
      'dispatch:response',
      async (payload: { rideId: string; accepted: boolean }) => {
        if (!payload?.rideId) return;
        const key = `dispatch:response:${payload.rideId}:${userId}`;
        try {
          await redisCmd.set(key, payload.accepted ? 'accepted' : 'declined', 'PX', 25_000);
        } catch (err) {
          console.warn('[ws] dispatch response redis failed', err);
        }
        // Acknowledge driver immediately; matching loop picks up redis key
        socket.emit('dispatch:response_ack', {
          rideId: payload.rideId,
          accepted: payload.accepted,
        });
      },
    );

    socket.on('disconnect', () => {
      console.log(`[ws] disconnected ${userId}`);
    });
  });

  // Domain events from REST trip/dispatch services
  await domainSub.subscribe(wsEnv.DOMAIN_CHANNEL);
  domainSub.on('message', (channel, message) => {
    if (channel !== wsEnv.DOMAIN_CHANNEL) return;
    let event: { type: string; payload: Record<string, unknown> };
    try {
      event = JSON.parse(message);
    } catch {
      return;
    }

    const p = event.payload || {};
    switch (event.type) {
      case 'ride.status_changed': {
        const rideId = String(p.rideId || '');
        if (!rideId) break;
        io.to(`ride:${rideId}`).emit('ride:status_changed', {
          rideId,
          status: p.status,
          from: p.from,
          driverUserId: p.driverUserId,
          passengerUserId: p.passengerUserId,
        });
        break;
      }
      case 'dispatch.offer': {
        const driverId = String(p.driverId || '');
        if (!driverId) break;
        // Forward full API payload (includes cargo fields); never drop bookingType.
        const { driverId: _omit, ...clientPayload } = p;
        io.to(`driver:${driverId}`).emit('dispatch:offer', {
          ...clientPayload,
          rideId: p.rideId,
          pickupLat: p.pickupLat,
          pickupLng: p.pickupLng,
          riderName: p.riderName,
          fareEstimate: p.fareEstimate,
          distanceMeters: p.distanceMeters,
          timeoutMs: p.timeoutMs,
          bookingType: p.bookingType ?? 'ride',
          cargoWeightKg: p.cargoWeightKg ?? null,
          cargoDescription: p.cargoDescription ?? null,
          cargoSizeTier: p.cargoSizeTier ?? null,
          dispatchLogId: p.dispatchLogId,
        });
        break;
      }
      case 'dispatch.no_drivers': {
        const rideId = String(p.rideId || '');
        if (rideId) {
          io.to(`ride:${rideId}`).emit('dispatch:no_drivers', p);
        }
        break;
      }
      case 'ride.location_broadcast': {
        const rideId = String(p.rideId || '');
        if (rideId) {
          io.to(`ride:${rideId}`).emit('ride:location_broadcast', p);
        }
        break;
      }
      default:
        break;
    }
  });

  httpServer.listen(wsEnv.PORT, () => {
    console.log(`[ws-gateway] listening on :${wsEnv.PORT}  channel=${wsEnv.DOMAIN_CHANNEL}`);
  });
}

main().catch((err) => {
  console.error('[ws-gateway] fatal', err);
  process.exit(1);
});
