import {
  DriverOnboardingStatus,
  UserStatus,
  DocumentStatus,
} from '@prisma/client';
import { prisma } from '../lib/prisma';

export interface OnboardingStatus {
  phone_verified: boolean;
  personal_info: boolean;
  role_selected: boolean;
  vehicle_info: boolean;
  documents_uploaded: boolean;
  locations_saved: boolean;
  driver_approved: boolean;
  profile_complete: boolean;
  pending_steps: string[];
  is_driver: boolean;
}

export async function computeOnboarding(userId: string): Promise<OnboardingStatus> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      driverProfile: { include: { vehicle: true } },
      savedLocations: true,
      documents: true,
    },
  });

  if (!user) {
    throw new Error('User not found');
  }

  const latestDocuments = (() => {
    const byType = new Map<string, (typeof user.documents)[number]>();
    for (const doc of [...user.documents].sort(
      (a, b) => b.submittedAt.getTime() - a.submittedAt.getTime(),
    )) {
      if (!byType.has(doc.type)) byType.set(doc.type, doc);
    }
    return Array.from(byType.values());
  })();

  const phoneVerified = !!user.phoneVerifiedAt;
  const personalInfo = !!user.profile?.fullName;
  const isDriver = !!user.driverProfile;
  const roleSelected = isDriver || user.activeMode === 'passenger';
  const vehicleInfo = !!user.driverProfile?.vehicle;
  const documentsUploaded =
    latestDocuments.some((d) => d.type === 'driver_license') &&
    latestDocuments.some((d) => d.type === 'national_id' || d.type === 'passport') &&
    latestDocuments.some((d) => d.type === 'selfie');
  const locationsSaved = user.savedLocations.length > 0;
  const driverApproved =
    user.driverProfile?.onboardingStatus === DriverOnboardingStatus.approved;

  const pendingSteps: string[] = [];
  if (!phoneVerified) pendingSteps.push('phone_verified');
  if (!personalInfo) pendingSteps.push('personal_info');
  if (!roleSelected) pendingSteps.push('role_selected');
  if (isDriver && !vehicleInfo) pendingSteps.push('vehicle_info');
  if (isDriver && !documentsUploaded) pendingSteps.push('documents_uploaded');
  if (!locationsSaved) pendingSteps.push('locations_saved');
  if (isDriver && !driverApproved) pendingSteps.push('driver_approved');

  const profileComplete =
    phoneVerified &&
    personalInfo &&
    locationsSaved &&
    (!isDriver || (vehicleInfo && documentsUploaded && driverApproved));

  return {
    phone_verified: phoneVerified,
    personal_info: personalInfo,
    role_selected: roleSelected,
    vehicle_info: vehicleInfo,
    documents_uploaded: documentsUploaded,
    locations_saved: locationsSaved,
    driver_approved: driverApproved,
    profile_complete: profileComplete,
    pending_steps: pendingSteps,
    is_driver: isDriver,
  };
}

export async function syncUserStatus(userId: string): Promise<UserStatus> {
  const onboarding = await computeOnboarding(userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { driverProfile: true },
  });

  if (!user) throw new Error('User not found');

  if (['SUSPENDED', 'BANNED', 'RESTRICTED', 'DELETED'].includes(user.status)) {
    return user.status;
  }

  let newStatus: UserStatus;

  if (!onboarding.phone_verified) {
    newStatus = UserStatus.REGISTERED;
  } else if (!onboarding.personal_info || !onboarding.locations_saved) {
    newStatus = UserStatus.PROFILE_INCOMPLETE;
  } else if (
    onboarding.is_driver &&
    user.driverProfile?.onboardingStatus === DriverOnboardingStatus.pending_review
  ) {
    newStatus = UserStatus.PROFILE_INCOMPLETE;
  } else {
    newStatus = UserStatus.ACTIVE;
  }

  if (newStatus !== user.status) {
    await prisma.user.update({
      where: { id: userId },
      data: { status: newStatus },
    });
  }

  return newStatus;
}

export function getCapabilities(
  user: {
    status: UserStatus;
    driverProfile?: { onboardingStatus: DriverOnboardingStatus } | null;
  },
  onboarding: OnboardingStatus,
) {
  const canBook =
    onboarding.phone_verified &&
    onboarding.personal_info &&
    !['SUSPENDED', 'BANNED', 'DELETED'].includes(user.status);

  const canDrive =
    onboarding.is_driver &&
    user.driverProfile?.onboardingStatus === DriverOnboardingStatus.approved &&
    user.status === UserStatus.ACTIVE;

  const canOfferRideShare = canDrive && onboarding.vehicle_info;

  return { can_book: canBook, can_drive: canDrive, can_offer_ride_share: canOfferRideShare };
}

export async function getTrustBadges(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      documents: true,
      driverProfile: true,
      passengerProfile: true,
    },
  });

  if (!user) return [];

  const latestDocuments = (() => {
    const byType = new Map<string, (typeof user.documents)[number]>();
    for (const doc of [...user.documents].sort(
      (a, b) => b.submittedAt.getTime() - a.submittedAt.getTime(),
    )) {
      if (!byType.has(doc.type)) byType.set(doc.type, doc);
    }
    return Array.from(byType.values());
  })();

  const badges: string[] = [];
  if (user.phoneVerifiedAt) badges.push('phone_verified');

  const idDoc = latestDocuments.find(
    (d) =>
      (d.type === 'national_id' || d.type === 'passport') &&
      d.status === DocumentStatus.approved,
  );
  if (idDoc) badges.push('id_verified');

  if (user.driverProfile?.onboardingStatus === DriverOnboardingStatus.approved) {
    badges.push('driver_verified');
  }

  if (user.driverProfile?.driverType === 'fleet_assigned') {
    badges.push('fleet_driver');
  }

  const tier = user.passengerProfile?.loyaltyTier ?? user.driverProfile?.incentiveTier;
  if (tier && tier !== 'basic') {
    badges.push(`tier_${tier}`);
  }

  return badges;
}
