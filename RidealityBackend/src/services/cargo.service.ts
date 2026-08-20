import crypto from 'crypto';
import {
  BookingType,
  CargoDropoffConfirmationType,
  RideStatus,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';

export type ServiceMode = 'rides' | 'cargo';

const VALID_MODES = new Set<ServiceMode>(['rides', 'cargo']);

export function normalizeServiceModes(modes: string[]): ServiceMode[] {
  const out = [...new Set(modes.map((m) => m.toLowerCase().trim()))].filter((m): m is ServiceMode =>
    VALID_MODES.has(m as ServiceMode),
  );
  if (!out.length) {
    throw new ValidationError('modes must include at least one of: rides, cargo');
  }
  return out;
}

export function modesAllow(
  serviceModes: string[] | undefined | null,
  needed: ServiceMode,
): boolean {
  const modes = serviceModes?.length ? serviceModes : ['rides'];
  return modes.includes(needed) || modes.includes('both' as never);
}

/** Capacity check: capacity must be set and ≥ weight. */
export function vehicleCanCarry(capacityKg: number | null | undefined, weightKg: number): boolean {
  if (capacityKg == null || !Number.isFinite(capacityKg)) return false;
  return capacityKg + 1e-9 >= weightKg;
}

export function hashCargoOtp(otp: string): string {
  return crypto.createHash('sha256').update(otp.trim()).digest('hex');
}

export function generateCargoOtp(): string {
  return String(crypto.randomInt(100000, 999999));
}

export async function ensureCargoProofRow(
  rideId: string,
  dropoffType: CargoDropoffConfirmationType,
  dropoffOtpPlain?: string,
) {
  const existing = await prisma.cargoProof.findUnique({ where: { rideId } });
  if (existing) return existing;

  return prisma.cargoProof.create({
    data: {
      rideId,
      dropoffConfirmationType: dropoffType,
      dropoffOtpHash:
        dropoffType === CargoDropoffConfirmationType.otp && dropoffOtpPlain
          ? hashCargoOtp(dropoffOtpPlain)
          : null,
    },
  });
}

export async function getCargoProofForParty(rideId: string, userId: string, isAdmin = false) {
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    include: { cargoProof: true },
  });
  if (!ride) throw new NotFoundError('Booking not found');
  if (
    !isAdmin &&
    ride.passengerUserId !== userId &&
    ride.driverUserId !== userId
  ) {
    throw new ForbiddenError('Not a party to this booking');
  }
  return { ride, proof: ride.cargoProof };
}

/**
 * Driver records pickup proof (photo required for cargo v1).
 */
export async function submitPickupProof(
  rideId: string,
  driverUserId: string,
  input: { photoUrl?: string; otp?: string },
) {
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    include: { cargoProof: true },
  });
  if (!ride) throw new NotFoundError('Booking not found');
  if (ride.bookingType !== BookingType.cargo) {
    throw new ValidationError('Pickup proof only applies to cargo bookings');
  }
  if (ride.driverUserId !== driverUserId) {
    throw new ForbiddenError('Only the assigned driver can submit pickup proof');
  }
  const status = ride.status;
  if (
    status !== RideStatus.arrived &&
    status !== RideStatus.accepted &&
    status !== RideStatus.driver_en_route
  ) {
    // Allow proof once at pickup site — typically after arrived
    throw new ValidationError('Pickup proof is only allowed near pickup (arrived / en route)', {
      status,
    });
  }
  if (!input.photoUrl?.trim() && !input.otp?.trim()) {
    throw new ValidationError('Provide photoUrl (preferred) or otp for pickup proof');
  }

  let proof = ride.cargoProof;
  if (!proof) {
    proof = await ensureCargoProofRow(
      rideId,
      ride.dropoffProofType ?? CargoDropoffConfirmationType.otp,
    );
  }
  if (proof.pickupConfirmedAt) {
    return formatProofResponse(rideId, proof);
  }

  const updated = await prisma.cargoProof.update({
    where: { rideId },
    data: {
      pickupPhotoUrl: input.photoUrl?.trim() || proof.pickupPhotoUrl,
      pickupConfirmedAt: new Date(),
    },
  });
  return formatProofResponse(rideId, updated);
}

/**
 * Driver records dropoff proof (OTP or photo per booking config).
 */
export async function submitDropoffProof(
  rideId: string,
  driverUserId: string,
  input: { photoUrl?: string; otp?: string },
) {
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    include: { cargoProof: true },
  });
  if (!ride) throw new NotFoundError('Booking not found');
  if (ride.bookingType !== BookingType.cargo) {
    throw new ValidationError('Dropoff proof only applies to cargo bookings');
  }
  if (ride.driverUserId !== driverUserId) {
    throw new ForbiddenError('Only the assigned driver can submit dropoff proof');
  }
  if (ride.status !== RideStatus.picked_up) {
    throw new ValidationError('Dropoff proof only allowed after pickup (picked_up)', {
      status: ride.status,
    });
  }

  let proof = ride.cargoProof;
  if (!proof) {
    proof = await ensureCargoProofRow(
      rideId,
      ride.dropoffProofType ?? CargoDropoffConfirmationType.otp,
    );
  }
  if (proof.dropoffConfirmedAt) {
    return formatProofResponse(rideId, proof);
  }

  const type = proof.dropoffConfirmationType;
  if (type === CargoDropoffConfirmationType.otp) {
    if (!input.otp?.trim()) {
      throw new ValidationError('OTP required for dropoff on this cargo booking');
    }
    if (!proof.dropoffOtpHash) {
      throw new ValidationError('No dropoff OTP was issued for this booking');
    }
    if (hashCargoOtp(input.otp) !== proof.dropoffOtpHash) {
      throw new ValidationError('Invalid dropoff OTP', { code: 'INVALID_DROPOFF_OTP' });
    }
    const updated = await prisma.cargoProof.update({
      where: { rideId },
      data: {
        dropoffOtpVerified: true,
        dropoffConfirmedAt: new Date(),
        dropoffPhotoUrl: input.photoUrl?.trim() || proof.dropoffPhotoUrl,
      },
    });
    return formatProofResponse(rideId, updated);
  }

  // photo
  if (!input.photoUrl?.trim()) {
    throw new ValidationError('photoUrl required for dropoff on this cargo booking');
  }
  const updated = await prisma.cargoProof.update({
    where: { rideId },
    data: {
      dropoffPhotoUrl: input.photoUrl.trim(),
      dropoffConfirmedAt: new Date(),
    },
  });
  return formatProofResponse(rideId, updated);
}

function formatProofResponse(
  rideId: string,
  proof: {
    pickupPhotoUrl: string | null;
    pickupConfirmedAt: Date | null;
    dropoffConfirmationType: CargoDropoffConfirmationType;
    dropoffOtpVerified: boolean;
    dropoffPhotoUrl: string | null;
    dropoffConfirmedAt: Date | null;
  },
) {
  return {
    rideId,
    bookingId: rideId,
    pickup: {
      photoUrl: proof.pickupPhotoUrl,
      confirmedAt: proof.pickupConfirmedAt,
      ready: Boolean(proof.pickupConfirmedAt),
    },
    dropoff: {
      type: proof.dropoffConfirmationType,
      otpVerified: proof.dropoffOtpVerified,
      photoUrl: proof.dropoffPhotoUrl,
      confirmedAt: proof.dropoffConfirmedAt,
      ready: Boolean(proof.dropoffConfirmedAt),
    },
  };
}

/** Throws if cargo proof missing for guarded transitions. */
export async function assertCargoProofForTransition(
  ride: {
    id: string;
    bookingType: BookingType;
  },
  next: 'picked_up' | 'completed' | string,
): Promise<void> {
  if (ride.bookingType !== BookingType.cargo) return;
  if (next !== 'picked_up' && next !== 'completed') return;

  const proof = await prisma.cargoProof.findUnique({ where: { rideId: ride.id } });
  if (next === 'picked_up' && !proof?.pickupConfirmedAt) {
    throw new ValidationError('Pickup proof required before picked_up on cargo bookings', {
      code: 'CARGO_PICKUP_PROOF_REQUIRED',
      rideId: ride.id,
    });
  }
  if (next === 'completed' && !proof?.dropoffConfirmedAt) {
    throw new ValidationError('Dropoff proof required before completed on cargo bookings', {
      code: 'CARGO_DROPOFF_PROOF_REQUIRED',
      rideId: ride.id,
    });
  }
}

export function formatCargoProofPublic(
  proof: {
    pickupPhotoUrl: string | null;
    pickupConfirmedAt: Date | null;
    dropoffConfirmationType: CargoDropoffConfirmationType;
    dropoffOtpVerified: boolean;
    dropoffPhotoUrl: string | null;
    dropoffConfirmedAt: Date | null;
  } | null,
  rideId = '',
) {
  if (!proof) return null;
  return formatProofResponse(rideId, proof);
}
