import { RideStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ValidationError, NotFoundError } from '../utils/errors';
import { logger } from '../lib/logger';
import { makeEvent, publishDomainEvent } from '../realtime/domainEvents';
import {
  captureRideFare,
  refundRidePayment,
} from '../clients/finance.client';
import { notifyRideStatusChanged } from './push.service';
import { assertCargoProofForTransition } from './cargo.service';

/**
 * Canonical FSM statuses (product). DB still stores snake_case Prisma enums.
 * Legacy fleet rows: assigned ≈ accepted, in_progress ≈ picked_up.
 */
export type TripStatus =
  | 'requested'
  | 'accepted'
  | 'driver_en_route'
  | 'arrived'
  | 'picked_up'
  | 'completed'
  | 'cancelled';

const ALLOWED: Record<TripStatus, TripStatus[]> = {
  requested: ['accepted', 'cancelled'],
  accepted: ['driver_en_route', 'cancelled'],
  driver_en_route: ['arrived', 'cancelled'],
  arrived: ['picked_up', 'cancelled'],
  picked_up: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

/** Map Prisma/legacy statuses into the product FSM. */
export function canonicalizeStatus(status: RideStatus | string): TripStatus {
  switch (status) {
    case RideStatus.assigned:
    case 'assigned':
      return 'accepted';
    case RideStatus.in_progress:
    case 'in_progress':
      return 'picked_up';
    case RideStatus.requested:
    case RideStatus.accepted:
    case RideStatus.driver_en_route:
    case RideStatus.arrived:
    case RideStatus.picked_up:
    case RideStatus.completed:
    case RideStatus.cancelled:
      return status as TripStatus;
    default:
      return status as TripStatus;
  }
}

export function isTransitionAllowed(from: TripStatus, to: TripStatus): boolean {
  if (from === to) return true; // idempotent same-state
  return ALLOWED[from]?.includes(to) ?? false;
}

export function toPrismaStatus(status: TripStatus): RideStatus {
  return status as RideStatus;
}

export interface TransitionOptions {
  actorUserId?: string;
  driverUserId?: string;
  fleetCompanyId?: string;
  vehicleId?: string;
  cancelReason?: string;
  fare?: number;
  skipFinance?: boolean;
}

export interface TransitionResult {
  rideId: string;
  from: TripStatus;
  to: TripStatus;
  idempotent: boolean;
  ride: Awaited<ReturnType<typeof loadRide>>;
}

async function loadRide(rideId: string) {
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    include: {
      passenger: { include: { profile: true } },
      driver: { include: { profile: true } },
    },
  });
  if (!ride) throw new NotFoundError('Trip not found');
  return ride;
}

/**
 * Server-authoritative trip state machine.
 * Same-status re-transition is a no-op (idempotent).
 */
export async function transitionRide(
  rideId: string,
  next: TripStatus,
  options: TransitionOptions = {},
): Promise<TransitionResult> {
  const ride = await loadRide(rideId);
  const from = canonicalizeStatus(ride.status);

  if (from === next) {
    return { rideId, from, to: next, idempotent: true, ride };
  }

  if (!isTransitionAllowed(from, next)) {
    throw new ValidationError(`Invalid trip transition ${from} → ${next}`, {
      from,
      to: next,
      rideId,
    });
  }

  await assertCargoProofForTransition(ride, next);

  const data: Record<string, unknown> = {
    status: toPrismaStatus(next),
  };

  if (options.driverUserId) data.driverUserId = options.driverUserId;
  if (options.fleetCompanyId) data.fleetCompanyId = options.fleetCompanyId;
  if (options.vehicleId) data.vehicleId = options.vehicleId;
  if (options.cancelReason) data.cancelReason = options.cancelReason;
  if (typeof options.fare === 'number') data.fare = options.fare;

  const driverId = options.driverUserId ?? ride.driverUserId;
  if (driverId) {
    const profile = await prisma.driverProfile.findUnique({
      where: { userId: driverId },
      select: {
        fleetCompanyId: true,
        commissionRateOverride: true,
        fleetCompany: { select: { fleetTakePercent: true } },
      },
    });
    if (!options.fleetCompanyId && !ride.fleetCompanyId && profile?.fleetCompanyId) {
      data.fleetCompanyId = profile.fleetCompanyId;
    }
    const fleetId =
      options.fleetCompanyId ??
      (typeof data.fleetCompanyId === 'string' ? data.fleetCompanyId : null) ??
      ride.fleetCompanyId ??
      profile?.fleetCompanyId ??
      null;
    if (fleetId && next === 'accepted') {
      const liveTake =
        profile?.commissionRateOverride != null
          ? Number(profile.commissionRateOverride)
          : Number(profile?.fleetCompany?.fleetTakePercent ?? 0);
      data.fleetTakePercent = liveTake;
    }
  }

  if (next === 'picked_up' || next === 'driver_en_route') {
    if (!ride.startedAt) data.startedAt = new Date();
  }
  if (next === 'completed') {
    data.completedAt = new Date();
    if (!ride.startedAt) data.startedAt = new Date();
  }
  if (next === 'cancelled') {
    data.cancelledAt = new Date();
  }

  const updated = await prisma.ride.update({
    where: { id: rideId },
    data,
    include: {
      passenger: { include: { profile: true } },
      driver: { include: { profile: true } },
    },
  });

  await publishDomainEvent(
    makeEvent('ride.status_changed', {
      rideId,
      status: next,
      from,
      driverUserId: updated.driverUserId,
      passengerUserId: updated.passengerUserId,
      actorUserId: options.actorUserId ?? null,
    }),
  );

  notifyRideStatusChanged({
    rideId,
    status: next,
    from,
    driverUserId: updated.driverUserId,
    passengerUserId: updated.passengerUserId,
    actorUserId: options.actorUserId ?? null,
  });

  if (!options.skipFinance) {
    try {
      if (next === 'completed') {
        await settleCompletedRide(updated);
      }
      // Refund path: cancelled after rider was charged (picked_up+) rarely charged pre-complete in v1.
      // If cancel after completed is impossible; cancel from picked_up does not charge yet.
      // Explicit refund when cancelling a ride that already completed is not allowed by FSM.
      if (next === 'cancelled' && from === 'picked_up') {
        // no charge yet — nothing to refund
      }
    } catch (err) {
      logger.error('Finance side-effect failed after trip transition', {
        rideId,
        next,
        error: err instanceof Error ? err.message : String(err),
      });
      // Status already committed; finance can be reconciled via ops
    }
  }

  return { rideId, from, to: next, idempotent: false, ride: updated };
}

async function settleCompletedRide(ride: {
  id: string;
  passengerUserId: string | null;
  driverUserId: string | null;
  fare: { toNumber?: () => number } | number;
  fareEstimate: { toNumber?: () => number } | number | null;
  currency: string;
}) {
  const amount = Number(
    typeof ride.fare === 'object' && ride.fare && 'toNumber' in ride.fare
      ? ride.fare.toNumber?.()
      : ride.fare,
  ) || Number(
    typeof ride.fareEstimate === 'object' && ride.fareEstimate && 'toNumber' in ride.fareEstimate
      ? ride.fareEstimate.toNumber?.()
      : ride.fareEstimate ?? 0,
  );

  if (!ride.passengerUserId || !ride.driverUserId || amount <= 0) {
    logger.warn('Skip fare capture — missing parties or zero amount', {
      rideId: ride.id,
      amount,
    });
    return;
  }

  await captureRideFare({
    rideId: ride.id,
    passengerUserId: ride.passengerUserId,
    driverUserId: ride.driverUserId,
    amount,
    currency: ride.currency,
  });
}

/**
 * On cancel where payment already captured (future), refund via finance only.
 * Exposed for ops / future paid pre-auth.
 */
export async function refundCancelledRide(rideId: string, actorUserId?: string) {
  const ride = await loadRide(rideId);
  if (!ride.passengerUserId) return;

  const amount = Number(ride.fare) || Number(ride.fareEstimate) || 0;
  if (amount <= 0) return;

  await refundRidePayment({
    rideId,
    passengerUserId: ride.passengerUserId,
    amount,
    currency: ride.currency,
    actorUserId,
  });
}

export { ALLOWED as TRIP_TRANSITIONS };
