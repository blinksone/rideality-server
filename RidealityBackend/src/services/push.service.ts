import fs from 'fs';
import admin from 'firebase-admin';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { env } from '../config/env';

export type PushData = Record<string, string>;

export interface PushMessage {
  title: string;
  body: string;
  /** FCM data payload values must be strings */
  data?: PushData;
}

let initAttempted = false;
let ready = false;

/**
 * Initialize Firebase Admin from service-account JSON path.
 * Safe to call multiple times; no-ops without credentials.
 */
export function initFirebase(): boolean {
  if (initAttempted) return ready;
  initAttempted = true;

  const saPath = env.FIREBASE_SERVICE_ACCOUNT_PATH || env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!saPath) {
    logger.warn('FCM disabled: FIREBASE_SERVICE_ACCOUNT_PATH not set');
    return false;
  }
  if (!fs.existsSync(saPath)) {
    logger.warn('FCM disabled: service account file missing', { path: saPath });
    return false;
  }

  try {
    if (admin.apps.length === 0) {
      const json = JSON.parse(fs.readFileSync(saPath, 'utf8')) as admin.ServiceAccount;
      admin.initializeApp({
        credential: admin.credential.cert(json),
        projectId: env.FIREBASE_PROJECT_ID || json.projectId,
      });
    }
    ready = true;
    logger.info('Firebase Admin initialized for FCM', {
      projectId: env.FIREBASE_PROJECT_ID || 'from-sa',
    });
  } catch (err) {
    logger.error('Firebase Admin init failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    ready = false;
  }
  return ready;
}

export function isFcmReady(): boolean {
  return ready;
}

function stringifyData(data?: Record<string, unknown>): PushData | undefined {
  if (!data) return undefined;
  const out: PushData = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === 'string' ? v : String(v);
  }
  return out;
}

async function tokensForUser(
  userId: string,
  opts: { requireRideUpdates?: boolean } = {},
): Promise<string[]> {
  const prefs = await prisma.notificationPreference.findUnique({ where: { userId } });
  if (prefs) {
    if (!prefs.pushEnabled) return [];
    if (opts.requireRideUpdates !== false && !prefs.rideUpdates) return [];
  }

  const devices = await prisma.userDevice.findMany({
    where: { userId, fcmToken: { not: null } },
    select: { fcmToken: true },
    orderBy: { lastSeenAt: 'desc' },
  });

  const tokens = devices
    .map((d) => d.fcmToken)
    .filter((t): t is string => Boolean(t && t.trim()));
  return [...new Set(tokens)];
}

async function dropInvalidToken(token: string): Promise<void> {
  try {
    await prisma.userDevice.deleteMany({ where: { fcmToken: token } });
    logger.info('Removed invalid FCM token', { tokenPrefix: token.slice(0, 12) });
  } catch (err) {
    logger.warn('Failed to remove invalid FCM token', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Send a push to all registered devices for a user. Never throws.
 */
export async function sendPushToUser(
  userId: string | null | undefined,
  message: PushMessage,
  opts: { requireRideUpdates?: boolean } = {},
): Promise<{ sent: number; failed: number }> {
  if (!userId) return { sent: 0, failed: 0 };
  if (!ready && !initFirebase()) return { sent: 0, failed: 0 };

  const tokens = await tokensForUser(userId, opts);
  if (!tokens.length) return { sent: 0, failed: 0 };

  const data = stringifyData(message.data);
  let sent = 0;
  let failed = 0;

  // multicast in chunks of 500
  const chunkSize = 500;
  for (let i = 0; i < tokens.length; i += chunkSize) {
    const chunk = tokens.slice(i, i + chunkSize);
    try {
      const res = await admin.messaging().sendEachForMulticast({
        tokens: chunk,
        notification: {
          title: message.title,
          body: message.body,
        },
        data,
        android: {
          priority: 'high',
          notification: {
            channelId: 'rideality_rides',
            sound: 'default',
            priority: 'high',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              contentAvailable: true,
            },
          },
        },
      });

      sent += res.successCount;
      failed += res.failureCount;

      res.responses.forEach((r, idx) => {
        if (r.success) return;
        const code = r.error?.code || '';
        const invalid =
          code.includes('registration-token-not-registered') ||
          code.includes('invalid-registration-token') ||
          code.includes('invalid-argument');
        if (invalid) {
          void dropInvalidToken(chunk[idx]);
        } else {
          logger.warn('FCM send failed', {
            userId,
            code,
            message: r.error?.message,
          });
        }
      });
    } catch (err) {
      failed += chunk.length;
      logger.error('FCM multicast error', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (sent || failed) {
    logger.info('FCM sendToUser', { userId, sent, failed, title: message.title });
  }
  return { sent, failed };
}

// ─── Ride-domain helpers ────────────────────────────────────────────────────

const STATUS_COPY: Record<
  string,
  { title: string; body: string; audience: 'passenger' | 'driver' | 'both' }
> = {
  accepted: {
    title: 'Driver assigned',
    body: 'A driver accepted your ride and is on the way.',
    audience: 'passenger',
  },
  driver_en_route: {
    title: 'Driver en route',
    body: 'Your driver is heading to the pickup.',
    audience: 'passenger',
  },
  arrived: {
    title: 'Driver arrived',
    body: 'Your driver has arrived at the pickup point.',
    audience: 'passenger',
  },
  picked_up: {
    title: 'Trip started',
    body: 'You are on the way to your destination.',
    audience: 'both',
  },
  completed: {
    title: 'Trip completed',
    body: 'Thanks for riding with Rideality.',
    audience: 'both',
  },
  cancelled: {
    title: 'Trip cancelled',
    body: 'This trip was cancelled.',
    audience: 'both',
  },
};

/** Fire-and-forget push for FSM transitions. */
export function notifyRideStatusChanged(payload: {
  rideId: string;
  status: string;
  from?: string;
  passengerUserId?: string | null;
  driverUserId?: string | null;
  actorUserId?: string | null;
}): void {
  const copy = STATUS_COPY[payload.status];
  if (!copy) return;

  const data = {
    type: 'ride.status_changed',
    rideId: payload.rideId,
    status: payload.status,
    from: payload.from ?? '',
  };

  const msg: PushMessage = {
    title: copy.title,
    body: copy.body,
    data,
  };

  const jobs: Promise<unknown>[] = [];
  if (copy.audience === 'passenger' || copy.audience === 'both') {
    jobs.push(sendPushToUser(payload.passengerUserId, msg));
  }
  if (copy.audience === 'driver' || copy.audience === 'both') {
    // For cancel: still notify both so offline party sees it
    const driverMsg =
      payload.status === 'cancelled'
        ? msg
        : payload.status === 'picked_up' || payload.status === 'completed'
          ? msg
          : null;
    if (driverMsg) {
      jobs.push(sendPushToUser(payload.driverUserId, driverMsg));
    }
  }

  void Promise.all(jobs).catch(() => undefined);
}

/** Offer to a specific driver (foreground may also get WS). */
export function notifyDispatchOffer(payload: {
  rideId: string;
  driverId: string;
  riderName?: string;
  fareEstimate?: number;
  distanceMeters?: number;
  timeoutMs?: number;
  pickupLat?: number;
  pickupLng?: number;
  bookingType?: string;
  cargoWeightKg?: number;
}): void {
  const isCargo = payload.bookingType === 'cargo';
  const fare =
    payload.fareEstimate != null ? ` · ~${Math.round(payload.fareEstimate)} PKR` : '';
  const weight =
    isCargo && payload.cargoWeightKg != null
      ? ` · ${payload.cargoWeightKg} kg`
      : '';
  void sendPushToUser(payload.driverId, {
    title: isCargo ? 'New cargo offer' : 'New ride offer',
    body: `${payload.riderName || 'Rider'} nearby${fare}${weight}`,
    data: {
      type: 'dispatch.offer',
      rideId: payload.rideId,
      bookingType: payload.bookingType ?? 'ride',
      riderName: payload.riderName ?? '',
      fareEstimate: payload.fareEstimate != null ? String(payload.fareEstimate) : '',
      distanceMeters: payload.distanceMeters != null ? String(payload.distanceMeters) : '',
      timeoutMs: payload.timeoutMs != null ? String(payload.timeoutMs) : '',
      pickupLat: payload.pickupLat != null ? String(payload.pickupLat) : '',
      pickupLng: payload.pickupLng != null ? String(payload.pickupLng) : '',
      cargoWeightKg: payload.cargoWeightKg != null ? String(payload.cargoWeightKg) : '',
    },
  });
}

export function notifyNoDrivers(payload: {
  rideId: string;
  passengerUserId?: string | null;
}): void {
  if (!payload.passengerUserId) return;
  void sendPushToUser(payload.passengerUserId, {
    title: 'No drivers nearby',
    body: 'We could not find a driver. Try again in a moment.',
    data: {
      type: 'dispatch.no_drivers',
      rideId: payload.rideId,
    },
  });
}
