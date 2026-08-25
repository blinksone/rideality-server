import {
  DriverOnboardingStatus,
  UserStatus,
  DocumentStatus,
} from '@prisma/client';
import { prisma } from '../lib/prisma';

/** Review state of the latest required KYC set (license + ID/passport + selfie). */
export type DocumentReviewStatus =
  | 'missing'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired';

export interface OnboardingStatus {
  phone_verified: boolean;
  personal_info: boolean;
  role_selected: boolean;
  vehicle_info: boolean;
  /** Required document files exist (any status). Do not treat this as approved. */
  documents_uploaded: boolean;
  /** Latest required documents are all DocumentStatus.approved. */
  documents_approved: boolean;
  document_status: DocumentReviewStatus;
  locations_saved: boolean;
  driver_approved: boolean;
  profile_complete: boolean;
  pending_steps: string[];
  is_driver: boolean;
}

function requiredDocumentSlots<T extends { type: string }>(latestDocuments: T[]) {
  return {
    license: latestDocuments.find((d) => d.type === 'driver_license'),
    identity: latestDocuments.find(
      (d) => d.type === 'national_id' || d.type === 'passport',
    ),
    selfie: latestDocuments.find((d) => d.type === 'selfie'),
  };
}

function documentReview(
  latestDocuments: { type: string; status: DocumentStatus }[],
): {
  uploaded: boolean;
  approved: boolean;
  status: DocumentReviewStatus;
} {
  const slots = requiredDocumentSlots(latestDocuments);
  const required = [slots.license, slots.identity, slots.selfie];
  const uploaded = required.every(Boolean);
  if (!uploaded) {
    return { uploaded: false, approved: false, status: 'missing' };
  }

  const statuses = required.map((d) => d!.status);
  if (statuses.some((s) => s === DocumentStatus.rejected)) {
    return { uploaded: true, approved: false, status: 'rejected' };
  }
  if (statuses.some((s) => s === DocumentStatus.expired)) {
    return { uploaded: true, approved: false, status: 'expired' };
  }
  if (statuses.every((s) => s === DocumentStatus.approved)) {
    return { uploaded: true, approved: true, status: 'approved' };
  }
  return { uploaded: true, approved: false, status: 'pending' };
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
  const docReview = documentReview(latestDocuments);
  const locationsSaved = user.savedLocations.length > 0;
  const driverApproved =
    user.driverProfile?.onboardingStatus === DriverOnboardingStatus.approved;

  const pendingSteps: string[] = [];
  if (!phoneVerified) pendingSteps.push('phone_verified');
  if (!personalInfo) pendingSteps.push('personal_info');
  if (!roleSelected) pendingSteps.push('role_selected');
  if (isDriver && !vehicleInfo) pendingSteps.push('vehicle_info');
  if (isDriver && !docReview.uploaded) pendingSteps.push('documents_uploaded');
  if (isDriver && docReview.uploaded && !docReview.approved) {
    pendingSteps.push('documents_approved');
  }
  if (!locationsSaved) pendingSteps.push('locations_saved');
  if (isDriver && !driverApproved) pendingSteps.push('driver_approved');

  const profileComplete =
    phoneVerified &&
    personalInfo &&
    locationsSaved &&
    (!isDriver || (vehicleInfo && docReview.approved && driverApproved));

  return {
    phone_verified: phoneVerified,
    personal_info: personalInfo,
    role_selected: roleSelected,
    vehicle_info: vehicleInfo,
    documents_uploaded: docReview.uploaded,
    documents_approved: docReview.approved,
    document_status: docReview.status,
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
