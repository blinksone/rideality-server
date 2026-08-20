import {
  ActiveMode,
  ConsentType,
  DriverOnboardingStatus,
  DriverType,
  LocationLabel,
  PlatformRole,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ConflictError, ValidationError } from '../utils/errors';
import type {
  DriverOnboardingInput,
  PassengerOnboardingInput,
} from '../validators/onboarding.validator';
import { formatUserResponse, getUserById } from './user.service';
import { computeOnboarding, syncUserStatus } from './onboarding.service';
import { assertCanOnboardAsDriver } from './fleet-access';

const DRIVER_MIN_AGE = 18;

function parseDateInput(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`Invalid ${field}`);
  }
  return date;
}

function assertMinAge(dob: Date, minYears: number, message: string) {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  if (age < minYears) {
    throw new ValidationError(message, { min_age: minYears, age });
  }
}

async function assertEmailAvailable(userId: string, email?: string) {
  if (!email) return;
  const existing = await prisma.user.findFirst({
    where: {
      email: { equals: email, mode: 'insensitive' },
      NOT: { id: userId },
      // Unique index applies to soft-deleted rows too
    },
  });
  if (existing) {
    throw new ConflictError('Email is already in use', 'EMAIL_IN_USE');
  }
}

async function applyConsents(
  userId: string,
  data: {
    acceptTerms?: boolean;
    acceptPrivacy?: boolean;
    acceptMarketing?: boolean;
    consentVersion?: string;
  },
) {
  const version = data.consentVersion ?? '1.0';
  const rows: Array<{ type: ConsentType; accepted: boolean }> = [];
  if (data.acceptTerms !== undefined) {
    rows.push({ type: ConsentType.terms_of_use, accepted: data.acceptTerms });
  }
  if (data.acceptPrivacy !== undefined) {
    rows.push({ type: ConsentType.privacy_policy, accepted: data.acceptPrivacy });
  }
  if (data.acceptMarketing !== undefined) {
    rows.push({ type: ConsentType.marketing, accepted: data.acceptMarketing });
  }

  for (const row of rows) {
    await prisma.consentRecord.upsert({
      where: {
        userId_type_version: { userId, type: row.type, version },
      },
      create: {
        userId,
        type: row.type,
        version,
        accepted: row.accepted,
      },
      update: { accepted: row.accepted },
    });
  }
}

async function upsertLocation(
  userId: string,
  location?: {
    label?: LocationLabel | 'home' | 'work' | 'university' | 'custom';
    address: string;
    latitude: number;
    longitude: number;
    isDefault?: boolean;
  },
) {
  if (!location) return;
  const label = (location.label ?? LocationLabel.home) as LocationLabel;
  await prisma.savedLocation.upsert({
    where: { userId_label: { userId, label } },
    create: {
      userId,
      label,
      address: location.address,
      latitude: location.latitude,
      longitude: location.longitude,
      isDefault: location.isDefault ?? label === LocationLabel.home,
    },
    update: {
      address: location.address,
      latitude: location.latitude,
      longitude: location.longitude,
      isDefault: location.isDefault ?? undefined,
    },
  });
}

type SharedProfileFields = {
  fullName: string;
  email?: string;
  dateOfBirth?: string;
  gender?: string;
  profession?: string;
  preferredLanguage?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
};

async function upsertSharedProfile(userId: string, data: SharedProfileFields) {
  const dob = data.dateOfBirth ? parseDateInput(data.dateOfBirth, 'dateOfBirth') : undefined;

  await prisma.userProfile.upsert({
    where: { userId },
    create: {
      userId,
      fullName: data.fullName,
      dateOfBirth: dob,
      gender: data.gender,
      profession: data.profession,
      emergencyContactName: data.emergencyContactName,
      emergencyContactPhone: data.emergencyContactPhone,
    },
    update: {
      fullName: data.fullName,
      ...(data.dateOfBirth !== undefined && { dateOfBirth: dob }),
      ...(data.gender !== undefined && { gender: data.gender }),
      ...(data.profession !== undefined && { profession: data.profession }),
      ...(data.emergencyContactName !== undefined && {
        emergencyContactName: data.emergencyContactName,
      }),
      ...(data.emergencyContactPhone !== undefined && {
        emergencyContactPhone: data.emergencyContactPhone,
      }),
    },
  });

  const userUpdate: Prisma.UserUpdateInput = {};
  if (data.email !== undefined) userUpdate.email = data.email;
  if (data.preferredLanguage !== undefined) userUpdate.preferredLanguage = data.preferredLanguage;
  if (Object.keys(userUpdate).length > 0) {
    await prisma.user.update({ where: { id: userId }, data: userUpdate });
  }
}

/**
 * Passenger onboarding / signup profile.
 * Phone is taken from the authenticated session (OTP verified).
 */
export async function completePassengerOnboarding(
  userId: string,
  data: PassengerOnboardingInput,
) {
  await getUserById(userId);
  await assertEmailAvailable(userId, data.email);

  await prisma.passengerProfile.upsert({
    where: { userId },
    create: {
      userId,
      promoOptIn: data.promoOptIn ?? true,
    },
    update: {
      ...(data.promoOptIn !== undefined && { promoOptIn: data.promoOptIn }),
    },
  });

  await upsertSharedProfile(userId, data);
  await upsertLocation(userId, data.location);
  await applyConsents(userId, data);
  await syncUserStatus(userId);

  const user = await formatUserResponse(userId);
  const onboarding = await computeOnboarding(userId);

  return {
    type: 'passenger' as const,
    user,
    onboarding,
    next_steps: onboarding.pending_steps,
  };
}

/**
 * Driver onboarding / signup profile (basic identity).
 * Vehicle + license document remain follow-up APIs.
 * Phone is taken from the authenticated session (OTP verified).
 */
export async function completeDriverOnboarding(userId: string, data: DriverOnboardingInput) {
  await getUserById(userId);
  await assertCanOnboardAsDriver(userId);
  await assertEmailAvailable(userId, data.email);

  const dob = parseDateInput(data.dateOfBirth, 'dateOfBirth');
  assertMinAge(dob, DRIVER_MIN_AGE, `Drivers must be at least ${DRIVER_MIN_AGE} years old`);

  const company = await prisma.fleetCompany.findUnique({ where: { id: data.companyId } });
  if (!company) throw new ValidationError('Fleet company not found');
  const city = await prisma.fleetRegion.findFirst({
    where: { id: data.regionId, fleetCompanyId: data.companyId },
  });
  if (!city) throw new ValidationError('City does not belong to the selected fleet');

  await upsertSharedProfile(userId, data);

  await prisma.driverProfile.upsert({
    where: { userId },
    create: {
      userId,
      onboardingStatus: DriverOnboardingStatus.draft,
      driverType: DriverType.fleet_assigned,
      fleetCompanyId: data.companyId,
      fleetRegionId: data.regionId,
      licenseNumber: data.licenseNumber,
      licenseExpiry: data.licenseExpiry
        ? parseDateInput(data.licenseExpiry, 'licenseExpiry')
        : undefined,
    },
    update: {
      driverType: DriverType.fleet_assigned,
      fleetCompanyId: data.companyId,
      fleetRegionId: data.regionId,
      ...(data.licenseNumber !== undefined && { licenseNumber: data.licenseNumber }),
      ...(data.licenseExpiry !== undefined && {
        licenseExpiry: parseDateInput(data.licenseExpiry, 'licenseExpiry'),
      }),
    },
  });

  const existingRole = await prisma.userPlatformRole.findUnique({
    where: { userId_role: { userId, role: PlatformRole.DRIVER } },
  });
  if (!existingRole) {
    await prisma.userPlatformRole.create({
      data: { userId, role: PlatformRole.DRIVER },
    });
  }

  // Keep passenger mode active until approved — still ensure passenger profile exists
  await prisma.passengerProfile.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });

  await prisma.user.update({
    where: { id: userId },
    data: { activeMode: ActiveMode.passenger },
  });

  await upsertLocation(userId, data.location);
  await applyConsents(userId, data);
  await syncUserStatus(userId);

  const user = await formatUserResponse(userId);
  const onboarding = await computeOnboarding(userId);

  return {
    type: 'driver' as const,
    user,
    onboarding,
    next_steps: onboarding.pending_steps,
    remaining: {
      vehicle: !onboarding.vehicle_info,
      documents: !onboarding.documents_uploaded,
      approval: !onboarding.driver_approved,
    },
  };
}

export async function getOnboardingStatus(userId: string) {
  await getUserById(userId);
  const onboarding = await computeOnboarding(userId);
  const user = await formatUserResponse(userId);
  return {
    onboarding,
    capabilities: user.capabilities,
    next_steps: onboarding.pending_steps,
  };
}
