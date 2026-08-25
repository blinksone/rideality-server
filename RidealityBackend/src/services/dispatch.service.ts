import { BookingType, DispatchResponse, RideStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { logger } from '../lib/logger';
import { REALTIME } from '../realtime/constants';
import { makeEvent, publishDomainEvent } from '../realtime/domainEvents';
import { searchNearbyDrivers } from './location.service';
import { normalizeVehicleType } from './service-product.service';
import { transitionRide } from './tripStateMachine.service';
import { notifyDispatchOffer, notifyNoDrivers } from './push.service';
import { modesAllow, vehicleCanCarry, type ServiceMode } from './cargo.service';

export interface DispatchRunResult {
  rideId: string;
  outcome: 'accepted' | 'no_drivers' | 'exhausted';
  acceptedDriverId?: string;
  offers: number;
}

const activeRuns = new Map<string, Promise<DispatchRunResult>>();

/**
 * Kick off async matching for a REQUESTED ride. Returns immediately after scheduling.
 */
export function startDispatch(rideId: string): void {
  if (activeRuns.has(rideId)) return;
  const promise = runDispatch(rideId).finally(() => {
    activeRuns.delete(rideId);
  });
  activeRuns.set(rideId, promise);
  promise.catch((err) =>
    logger.error('Dispatch run failed', {
      rideId,
      error: err instanceof Error ? err.message : String(err),
    }),
  );
}

export function getActiveDispatch(rideId: string) {
  return activeRuns.get(rideId);
}

async function loadDriverCaps(driverIds: string[]) {
  if (!driverIds.length) return new Map();
  const rows = await prisma.driverProfile.findMany({
    where: { userId: { in: driverIds } },
    select: {
      userId: true,
      serviceModes: true,
      vehicle: { select: { cargoCapacityKg: true, vehicleType: true } },
    },
  });
  const map = new Map<
    string,
    { serviceModes: string[]; cargoCapacityKg: number | null; vehicleType: string | null }
  >();
  for (const r of rows) {
    map.set(r.userId, {
      serviceModes: r.serviceModes?.length ? r.serviceModes : ['rides'],
      cargoCapacityKg:
        r.vehicle?.cargoCapacityKg != null ? Number(r.vehicle.cargoCapacityKg) : null,
      vehicleType: r.vehicle?.vehicleType ?? null,
    });
  }
  return map;
}

function candidateOkForBooking(
  caps: { serviceModes: string[]; cargoCapacityKg: number | null; vehicleType: string | null } | undefined,
  ride: {
    bookingType: BookingType;
    vehicleType: string | null;
    cargoWeightKg: { toNumber?: () => number } | number | null;
  },
  geoVehicleType: string,
): boolean {
  if (!caps) return false;
  const needed: ServiceMode = ride.bookingType === BookingType.cargo ? 'cargo' : 'rides';
  if (!modesAllow(caps.serviceModes, needed)) return false;

  if (ride.vehicleType) {
    const wanted = normalizeVehicleType(ride.vehicleType);
    const have = normalizeVehicleType(caps.vehicleType || geoVehicleType);
    if (wanted && have && wanted !== have) return false;
  }

  if (ride.bookingType === BookingType.cargo) {
    const weight = Number(
      typeof ride.cargoWeightKg === 'object' && ride.cargoWeightKg && 'toNumber' in ride.cargoWeightKg
        ? ride.cargoWeightKg.toNumber?.()
        : ride.cargoWeightKg ?? 0,
    );
    if (!vehicleCanCarry(caps.cargoCapacityKg, weight)) return false;
  }
  return true;
}

async function runDispatch(rideId: string): Promise<DispatchRunResult> {
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    include: { passenger: { include: { profile: true } } },
  });
  if (!ride || ride.status !== RideStatus.requested) {
    return { rideId, outcome: 'exhausted', offers: 0 };
  }
  if (ride.pickupLat == null || ride.pickupLng == null) {
    await publishDomainEvent(
      makeEvent('dispatch.no_drivers', { rideId, reason: 'missing_pickup' }),
    );
    notifyNoDrivers({ rideId, passengerUserId: ride.passengerUserId });
    return { rideId, outcome: 'no_drivers', offers: 0 };
  }

  const pickupLat = Number(ride.pickupLat);
  const pickupLng = Number(ride.pickupLng);
  const riderName =
    ride.passengerName ||
    ride.passenger?.profile?.fullName ||
    ride.passenger?.phone ||
    'Rider';
  const fareEstimate = Number(ride.fareEstimate ?? ride.fare ?? 0);
  const isCargo = ride.bookingType === BookingType.cargo;
  const cargoWeightKg =
    isCargo && ride.cargoWeightKg != null ? Number(ride.cargoWeightKg) : null;

  let offers = 0;
  const tried = new Set<string>();

  for (const radius of [REALTIME.SEARCH_RADIUS_KM, REALTIME.SEARCH_RADIUS_EXPAND_KM]) {
    const candidates = await searchNearbyDrivers(
      pickupLng,
      pickupLat,
      radius,
      REALTIME.SEARCH_COUNT,
    );

    const caps = await loadDriverCaps(candidates.map((c) => c.driverId));

    for (const c of candidates) {
      if (tried.has(c.driverId)) continue;
      if (!candidateOkForBooking(caps.get(c.driverId), ride, c.vehicleType)) continue;

      tried.add(c.driverId);

      const lockKey = REALTIME.offerLock(c.driverId);
      const locked = await redis.set(lockKey, rideId, 'PX', REALTIME.OFFER_LOCK_MS, 'NX');
      if (locked !== 'OK') continue;

      const log = await prisma.dispatchLog.create({
        data: {
          rideId,
          driverUserId: c.driverId,
          distanceMeters: c.distanceMeters,
        },
      });
      offers += 1;

      // Socket wire payload (ws-gateway → dispatch:offer). Always set bookingType as plain string.
      const offerPayload: Record<string, unknown> = {
        rideId,
        driverId: c.driverId,
        bookingType: isCargo ? 'cargo' : 'ride',
        pickupLat,
        pickupLng,
        riderName,
        fareEstimate,
        dispatchLogId: log.id,
        distanceMeters: c.distanceMeters,
        timeoutMs: REALTIME.OFFER_TIMEOUT_MS,
      };
      if (isCargo) {
        offerPayload.cargoWeightKg = cargoWeightKg;
        offerPayload.cargoDescription = ride.cargoDescription ?? null;
        offerPayload.cargoSizeTier = ride.cargoSizeTier ?? null;
        offerPayload.dropoffProofType = ride.dropoffProofType ?? null;
      }

      await publishDomainEvent(makeEvent('dispatch.offer', offerPayload));
      logger.info('dispatch.offer published', {
        rideId,
        driverId: c.driverId,
        bookingType: offerPayload.bookingType,
        cargoWeightKg: offerPayload.cargoWeightKg ?? null,
        cargoSizeTier: offerPayload.cargoSizeTier ?? null,
      });

      notifyDispatchOffer({
        rideId,
        driverId: c.driverId,
        riderName,
        fareEstimate,
        distanceMeters: c.distanceMeters,
        timeoutMs: REALTIME.OFFER_TIMEOUT_MS,
        pickupLat,
        pickupLng,
        bookingType: isCargo ? 'cargo' : 'ride',
        cargoWeightKg: cargoWeightKg ?? undefined,
      });

      const response = await waitForOfferResponse(rideId, c.driverId, REALTIME.OFFER_TIMEOUT_MS);

      if (response === 'accepted') {
        await prisma.dispatchLog.update({
          where: { id: log.id },
          data: { response: DispatchResponse.accepted, respondedAt: new Date() },
        });
        await redis.del(lockKey);

        const current = await prisma.ride.findUnique({ where: { id: rideId } });
        if (current?.status !== RideStatus.requested) {
          logger.warn('Ride no longer REQUESTED on accept — skip', { rideId });
          return { rideId, outcome: 'exhausted', offers };
        }

        const alreadyAccepted = await prisma.dispatchLog.count({
          where: { rideId, response: DispatchResponse.accepted },
        });
        if (alreadyAccepted > 1) {
          logger.error('Double-dispatch detected — extra accepted logs', { rideId });
        }

        await transitionRide(rideId, 'accepted', {
          driverUserId: c.driverId,
          actorUserId: c.driverId,
        });

        await publishDomainEvent(
          makeEvent('dispatch.response', {
            rideId,
            driverId: c.driverId,
            accepted: true,
            bookingType: ride.bookingType,
          }),
        );

        return { rideId, outcome: 'accepted', acceptedDriverId: c.driverId, offers };
      }

      await prisma.dispatchLog.update({
        where: { id: log.id },
        data: {
          response:
            response === 'declined' ? DispatchResponse.declined : DispatchResponse.timeout,
          respondedAt: new Date(),
        },
      });
      await redis.del(lockKey);
      await publishDomainEvent(
        makeEvent('dispatch.response', {
          rideId,
          driverId: c.driverId,
          accepted: false,
          reason: response,
        }),
      );
    }
  }

  await publishDomainEvent(
    makeEvent('dispatch.no_drivers', { rideId, offers, tried: tried.size, bookingType: ride.bookingType }),
  );
  notifyNoDrivers({ rideId, passengerUserId: ride.passengerUserId });
  return { rideId, outcome: offers ? 'exhausted' : 'no_drivers', offers };
}

function responseKey(rideId: string, driverId: string) {
  return `dispatch:response:${rideId}:${driverId}`;
}

export async function recordDispatchResponse(
  rideId: string,
  driverId: string,
  accepted: boolean,
): Promise<void> {
  await redis.set(
    responseKey(rideId, driverId),
    accepted ? 'accepted' : 'declined',
    'PX',
    REALTIME.OFFER_LOCK_MS + 5000,
  );
}

async function waitForOfferResponse(
  rideId: string,
  driverId: string,
  timeoutMs: number,
): Promise<'accepted' | 'declined' | 'timeout'> {
  const key = responseKey(rideId, driverId);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const val = await redis.get(key);
    if (val === 'accepted' || val === 'declined') {
      await redis.del(key);
      return val;
    }
    await sleep(250);
  }
  return 'timeout';
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function listDispatchLogs(rideId: string) {
  return prisma.dispatchLog.findMany({
    where: { rideId },
    orderBy: { offeredAt: 'asc' },
    include: {
      driver: { include: { profile: true } },
    },
  });
}
