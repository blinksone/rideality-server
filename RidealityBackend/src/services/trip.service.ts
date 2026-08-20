import { BookingType, CargoDropoffConfirmationType, Prisma, RideStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';
import {
  canonicalizeStatus,
  transitionRide,
  type TripStatus,
} from './tripStateMachine.service';
import { startDispatch, listDispatchLogs } from './dispatch.service';
import { haversineMeters } from './location.service';
import {
  ensureCargoProofRow,
  formatCargoProofPublic,
  generateCargoOtp,
} from './cargo.service';

export interface CreateTripInput {
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  pickupAddress?: string;
  dropoffAddress?: string;
  vehicleType?: string;
  currency?: string;
  /** Default ride. Use cargo for package delivery. */
  bookingType?: 'ride' | 'cargo';
  cargoWeightKg?: number;
  cargoDescription?: string;
  cargoSizeTier?: string;
  /** Default otp for cargo */
  dropoffProofType?: 'otp' | 'photo';
}

function estimateFare(distanceMeters: number, cargoWeightKg?: number): number {
  // Simple PKR heuristic: base 150 + 40/km (+ weight surcharge for cargo)
  const km = distanceMeters / 1000;
  let fare = 150 + km * 40;
  if (cargoWeightKg != null && cargoWeightKg > 0) {
    fare += cargoWeightKg * 8; // PKR / kg
  }
  return Math.round(fare * 100) / 100;
}

export function formatTrip(
  ride: {
    id: string;
    status: RideStatus;
    passengerUserId: string | null;
    driverUserId: string | null;
    pickupLat: Prisma.Decimal | number | null;
    pickupLng: Prisma.Decimal | number | null;
    dropoffLat: Prisma.Decimal | number | null;
    dropoffLng: Prisma.Decimal | number | null;
    pickupAddress: string;
    dropoffAddress: string;
    fare: Prisma.Decimal | number;
    fareEstimate: Prisma.Decimal | number | null;
    distanceKm: Prisma.Decimal | number;
    currency: string;
    vehicleType: string | null;
    fleetCompanyId: string | null;
    createdAt: Date;
    updatedAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
    cancelledAt: Date | null;
    cancelReason: string | null;
    bookingType?: BookingType | string;
    cargoWeightKg?: Prisma.Decimal | number | null;
    cargoDescription?: string | null;
    cargoSizeTier?: string | null;
    dropoffProofType?: CargoDropoffConfirmationType | string | null;
    cargoProof?: {
      pickupPhotoUrl: string | null;
      pickupConfirmedAt: Date | null;
      dropoffConfirmationType: CargoDropoffConfirmationType;
      dropoffOtpVerified: boolean;
      dropoffPhotoUrl: string | null;
      dropoffConfirmedAt: Date | null;
    } | null;
  },
  extras?: { dropoffOtp?: string },
) {
  const bookingType = (ride.bookingType as string) || 'ride';
  return {
    id: ride.id,
    rideId: ride.id,
    bookingId: ride.id,
    bookingType,
    status: canonicalizeStatus(ride.status),
    statusRaw: ride.status,
    passengerUserId: ride.passengerUserId,
    driverId: ride.driverUserId,
    driverUserId: ride.driverUserId,
    fleetCompanyId: ride.fleetCompanyId,
    pickup: {
      lat: ride.pickupLat != null ? Number(ride.pickupLat) : null,
      lng: ride.pickupLng != null ? Number(ride.pickupLng) : null,
      address: ride.pickupAddress,
    },
    dropoff: {
      lat: ride.dropoffLat != null ? Number(ride.dropoffLat) : null,
      lng: ride.dropoffLng != null ? Number(ride.dropoffLng) : null,
      address: ride.dropoffAddress,
    },
    fare: Number(ride.fare),
    fareEstimate: ride.fareEstimate != null ? Number(ride.fareEstimate) : null,
    distanceKm: Number(ride.distanceKm),
    currency: ride.currency,
    vehicleType: ride.vehicleType,
    cargo:
      bookingType === 'cargo'
        ? {
            weightKg: ride.cargoWeightKg != null ? Number(ride.cargoWeightKg) : null,
            description: ride.cargoDescription ?? null,
            sizeTier: ride.cargoSizeTier ?? null,
            dropoffProofType: ride.dropoffProofType ?? 'otp',
            proof: formatCargoProofPublic(ride.cargoProof ?? null, ride.id),
            // Plain OTP only when passenger creates / is returned creation extras
            dropoffOtp: extras?.dropoffOtp,
          }
        : null,
    cancelReason: ride.cancelReason,
    startedAt: ride.startedAt,
    completedAt: ride.completedAt,
    cancelledAt: ride.cancelledAt,
    createdAt: ride.createdAt,
    updatedAt: ride.updatedAt,
  };
}

/**
 * Rider creates a trip in REQUESTED and fires async dispatch.
 */
export async function createTrip(passengerUserId: string, input: CreateTripInput) {
  if (
    !Number.isFinite(input.pickupLat) ||
    !Number.isFinite(input.pickupLng) ||
    !Number.isFinite(input.dropoffLat) ||
    !Number.isFinite(input.dropoffLng)
  ) {
    throw new ValidationError('Invalid coordinates');
  }

  const bookingType =
    input.bookingType === 'cargo' ? BookingType.cargo : BookingType.ride;

  if (bookingType === BookingType.cargo) {
    if (input.cargoWeightKg == null || input.cargoWeightKg <= 0) {
      throw new ValidationError('cargoWeightKg is required for cargo bookings');
    }
  }

  const distanceM = haversineMeters(
    input.pickupLat,
    input.pickupLng,
    input.dropoffLat,
    input.dropoffLng,
  );
  const fareEstimate = estimateFare(
    distanceM,
    bookingType === BookingType.cargo ? input.cargoWeightKg : undefined,
  );

  const passenger = await prisma.user.findUnique({
    where: { id: passengerUserId },
    include: { profile: true, region: true },
  });
  if (!passenger) throw new NotFoundError('User not found');

  const active = await prisma.ride.findFirst({
    where: {
      passengerUserId,
      status: {
        in: [
          RideStatus.requested,
          RideStatus.accepted,
          RideStatus.driver_en_route,
          RideStatus.arrived,
          RideStatus.picked_up,
          RideStatus.assigned,
          RideStatus.in_progress,
        ],
      },
    },
  });
  if (active) {
    throw new ValidationError('You already have an active trip', {
      activeTripId: active.id,
    });
  }

  const dropoffProofType =
    bookingType === BookingType.cargo
      ? input.dropoffProofType === 'photo'
        ? CargoDropoffConfirmationType.photo
        : CargoDropoffConfirmationType.otp
      : null;

  const dropoffOtp =
    bookingType === BookingType.cargo && dropoffProofType === CargoDropoffConfirmationType.otp
      ? generateCargoOtp()
      : undefined;

  const ride = await prisma.ride.create({
    data: {
      passengerUserId,
      passengerName: passenger.profile?.fullName ?? null,
      driverUserId: null,
      fleetCompanyId: null,
      pickupLat: input.pickupLat,
      pickupLng: input.pickupLng,
      dropoffLat: input.dropoffLat,
      dropoffLng: input.dropoffLng,
      pickupAddress: input.pickupAddress ?? `${input.pickupLat.toFixed(5)}, ${input.pickupLng.toFixed(5)}`,
      dropoffAddress:
        input.dropoffAddress ?? `${input.dropoffLat.toFixed(5)}, ${input.dropoffLng.toFixed(5)}`,
      status: RideStatus.requested,
      bookingType,
      cargoWeightKg: bookingType === BookingType.cargo ? input.cargoWeightKg : null,
      cargoDescription:
        bookingType === BookingType.cargo ? input.cargoDescription?.slice(0, 500) ?? null : null,
      cargoSizeTier: bookingType === BookingType.cargo ? input.cargoSizeTier ?? null : null,
      dropoffProofType,
      fare: fareEstimate,
      fareEstimate,
      distanceKm: Math.round((distanceM / 1000) * 100) / 100,
      currency: input.currency ?? passenger.region.currency,
      vehicleType: input.vehicleType ?? 'sedan',
    },
    include: { cargoProof: true },
  });

  if (bookingType === BookingType.cargo && dropoffProofType) {
    await ensureCargoProofRow(ride.id, dropoffProofType, dropoffOtp);
  }

  startDispatch(ride.id);

  const withProof = await prisma.ride.findUnique({
    where: { id: ride.id },
    include: { cargoProof: true },
  });
  return formatTrip(withProof!, dropoffOtp ? { dropoffOtp } : undefined);
}

export async function getTrip(rideId: string, requesterId: string, isAdmin = false) {
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    include: { cargoProof: true },
  });
  if (!ride) throw new NotFoundError('Trip not found');
  if (
    !isAdmin &&
    ride.passengerUserId !== requesterId &&
    ride.driverUserId !== requesterId
  ) {
    throw new ForbiddenError('Not a party to this trip');
  }
  return formatTrip(ride);
}

export async function cancelTrip(
  rideId: string,
  requesterId: string,
  reason?: string,
  isAdmin = false,
) {
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    include: { cargoProof: true },
  });
  if (!ride) throw new NotFoundError('Trip not found');
  if (
    !isAdmin &&
    ride.passengerUserId !== requesterId &&
    ride.driverUserId !== requesterId
  ) {
    throw new ForbiddenError('Not a party to this trip');
  }

  const result = await transitionRide(rideId, 'cancelled', {
    actorUserId: requesterId,
    cancelReason: reason,
  });
  const full = await prisma.ride.findUnique({
    where: { id: result.rideId },
    include: { cargoProof: true },
  });
  return formatTrip(full!);
}

export async function advanceTripStatus(
  rideId: string,
  requesterId: string,
  next: TripStatus,
) {
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    include: { cargoProof: true },
  });
  if (!ride) throw new NotFoundError('Trip not found');
  if (ride.driverUserId !== requesterId && ride.passengerUserId !== requesterId) {
    throw new ForbiddenError('Not a party to this trip');
  }
  if (next !== 'cancelled' && ride.driverUserId !== requesterId) {
    throw new ForbiddenError('Only the assigned driver can advance trip status');
  }
  const result = await transitionRide(rideId, next, { actorUserId: requesterId });
  const full = await prisma.ride.findUnique({
    where: { id: result.rideId },
    include: { cargoProof: true },
  });
  return formatTrip(full!);
}

export async function getTripDispatchLog(rideId: string) {
  const ride = await prisma.ride.findUnique({ where: { id: rideId } });
  if (!ride) throw new NotFoundError('Trip not found');
  const logs = await listDispatchLogs(rideId);
  return logs.map((l) => ({
    id: l.id,
    rideId: l.rideId,
    driverId: l.driverUserId,
    offeredAt: l.offeredAt,
    respondedAt: l.respondedAt,
    response: l.response,
    distanceMeters: l.distanceMeters,
    driverName: l.driver.profile?.fullName ?? l.driver.phone,
  }));
}
