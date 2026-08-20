import path from 'path';
import fs from 'fs/promises';
import {
  ActiveMode,
  ConsentType,
  DocumentStatus,
  DocumentType,
  DriverOnboardingStatus,
  LocationLabel,
  PlatformRole,
  Prisma,
  WalletTransactionType,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { redis, RedisKeys } from '../lib/redis';
import { maskSensitive } from '../utils/crypto';
import {
  computeOnboarding,
  syncUserStatus,
  getCapabilities,
  getTrustBadges,
} from './onboarding.service';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';
import { env } from '../config/env';
import { normalizeServiceModes } from './cargo.service';
import { assertCanOnboardAsDriver } from './fleet-access';

function normalizeEmail(email: string | undefined | null): string | null | undefined {
  if (email === undefined) return undefined;
  if (email === null) return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed.length ? trimmed : null;
}

const userInclude = {
  profile: true,
  passengerProfile: true,
  driverProfile: { include: { vehicle: true, fleetCompany: true } },
  savedLocations: true,
  wallet: true,
  platformRoles: true,
  notificationPrefs: true,
} satisfies Prisma.UserInclude;

const CREDIT_TX_TYPES: WalletTransactionType[] = [
  WalletTransactionType.topup,
  WalletTransactionType.adjustment_credit,
  WalletTransactionType.ride_earnings,
  WalletTransactionType.refund,
  WalletTransactionType.release,
];

export async function getUserById(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: userInclude,
  });
  if (!user || user.deletedAt) throw new NotFoundError('User not found');
  return user;
}

export async function formatUserResponse(userId: string) {
  const user = await getUserById(userId);
  const onboarding = await computeOnboarding(userId);
  const capabilities = getCapabilities(user, onboarding);
  const trustBadges = await getTrustBadges(userId);

  return {
    id: user.id,
    phone: user.phone,
    email: user.email,
    status: user.status,
    activeMode: user.activeMode,
    regionId: user.regionId,
    preferredLanguage: user.preferredLanguage,
    profile: user.profile
      ? {
          fullName: user.profile.fullName,
          photoUrl: user.profile.photoUrl,
          dateOfBirth: user.profile.dateOfBirth,
          gender: user.profile.gender,
          profession: user.profile.profession,
          emergencyContactName: user.profile.emergencyContactName,
          emergencyContactPhone: user.profile.emergencyContactPhone,
          ratingAvg: Number(user.profile.ratingAvg),
          ratingCount: user.profile.ratingCount,
        }
      : null,
    capabilities,
    trustBadges,
    onboarding,
    roles: user.platformRoles.map((r) => r.role),
    createdAt: user.createdAt,
  };
}

export async function updateProfile(
  userId: string,
  data: {
    fullName?: string;
    email?: string;
    preferredLanguage?: string;
    dateOfBirth?: string;
    gender?: string;
    profession?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    role?: 'passenger' | 'driver' | 'both';
    vehicleType?: string;
    vehicleModel?: string;
    numberPlate?: string;
    availableSeats?: number;
    licenseNumber?: string;
    licenseExpiry?: string;
  },
) {
  const user = await getUserById(userId);

  const normalizedEmail = normalizeEmail(data.email);
  if (normalizedEmail !== undefined && normalizedEmail !== null) {
    // Include soft-deleted rows — @@unique([email]) still applies to them.
    const taken = await prisma.user.findFirst({
      where: {
        email: { equals: normalizedEmail, mode: 'insensitive' },
        NOT: { id: userId },
      },
      select: { id: true, phone: true, deletedAt: true },
    });
    if (taken) {
      throw new ConflictError(
        'This email is already registered to another account',
        'EMAIL_ALREADY_EXISTS',
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    if (
      data.fullName ||
      data.dateOfBirth ||
      data.gender ||
      data.profession ||
      data.emergencyContactName ||
      data.emergencyContactPhone
    ) {
      await tx.userProfile.upsert({
        where: { userId },
        create: {
          userId,
          fullName: data.fullName,
          dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
          gender: data.gender,
          profession: data.profession,
          emergencyContactName: data.emergencyContactName,
          emergencyContactPhone: data.emergencyContactPhone,
        },
        update: {
          ...(data.fullName !== undefined && { fullName: data.fullName }),
          ...(data.dateOfBirth !== undefined && { dateOfBirth: new Date(data.dateOfBirth) }),
          ...(data.gender !== undefined && { gender: data.gender }),
          ...(data.profession !== undefined && { profession: data.profession }),
          ...(data.emergencyContactName !== undefined && { emergencyContactName: data.emergencyContactName }),
          ...(data.emergencyContactPhone !== undefined && { emergencyContactPhone: data.emergencyContactPhone }),
        },
      });
    }

    // Only write when email is provided and actually changes (or clearing).
    if (normalizedEmail !== undefined) {
      const current = (user.email || '').toLowerCase();
      const next = normalizedEmail === null ? null : normalizedEmail;
      if ((current || null) !== next) {
        await tx.user.update({
          where: { id: userId },
          data: { email: next },
        });
      }
    }

    if (data.preferredLanguage !== undefined) {
      await tx.user.update({ where: { id: userId }, data: { preferredLanguage: data.preferredLanguage } });
    }

    if (data.role === 'driver' || data.role === 'both') {
      await assertCanOnboardAsDriver(userId);
      await tx.driverProfile.upsert({
        where: { userId },
        create: {
          userId,
          onboardingStatus: DriverOnboardingStatus.draft,
          licenseNumber: data.licenseNumber,
          licenseExpiry: data.licenseExpiry ? new Date(data.licenseExpiry) : undefined,
        },
        update: {
          ...(data.licenseNumber !== undefined && { licenseNumber: data.licenseNumber }),
          ...(data.licenseExpiry !== undefined && { licenseExpiry: new Date(data.licenseExpiry) }),
        },
      });

      const existingRole = await tx.userPlatformRole.findUnique({
        where: { userId_role: { userId, role: PlatformRole.DRIVER } },
      });
      if (!existingRole) {
        await tx.userPlatformRole.create({ data: { userId, role: PlatformRole.DRIVER } });
      }

      if (data.vehicleModel && data.numberPlate) {
        const driver = await tx.driverProfile.findUnique({ where: { userId } });
        if (driver) {
          await tx.vehicle.upsert({
            where: { driverProfileId: driver.id },
            create: {
              driverProfileId: driver.id,
              vehicleType: data.vehicleType ?? 'Car',
              model: data.vehicleModel,
              numberPlate: data.numberPlate,
              availableSeats: data.availableSeats ?? 4,
            },
            update: {
              ...(data.vehicleType !== undefined && { vehicleType: data.vehicleType }),
              ...(data.vehicleModel !== undefined && { model: data.vehicleModel }),
              ...(data.numberPlate !== undefined && { numberPlate: data.numberPlate }),
              ...(data.availableSeats !== undefined && { availableSeats: data.availableSeats }),
            },
          });
        }
      }
    }

    if (data.role === 'passenger') {
      await tx.passengerProfile.upsert({
        where: { userId },
        create: { userId },
        update: {},
      });
    }
  });

  const onboarding = await computeOnboarding(userId);
  const isDriver = onboarding.is_driver;
  const hasVehicle = onboarding.vehicle_info;
  const hasDocs = onboarding.documents_uploaded;

  if (isDriver && hasVehicle && hasDocs && onboarding.personal_info) {
    const driver = await prisma.driverProfile.findUnique({ where: { userId } });
    if (driver?.onboardingStatus === DriverOnboardingStatus.draft) {
      await prisma.driverProfile.update({
        where: { userId },
        data: { onboardingStatus: DriverOnboardingStatus.pending_review },
      });
    }
  }

  await syncUserStatus(userId);
  return formatUserResponse(userId);
}

export async function setActiveMode(userId: string, mode: ActiveMode) {
  if (mode === ActiveMode.driver) {
    const onboarding = await computeOnboarding(userId);
    const user = await getUserById(userId);
    const capabilities = getCapabilities(user, onboarding);

    if (!capabilities.can_drive) {
      throw new ForbiddenError(
        'Complete driver verification to switch to driver mode.',
        'DRIVER_NOT_APPROVED',
        { onboarding_required: true, pending_steps: onboarding.pending_steps },
      );
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { activeMode: mode },
  });

  return formatUserResponse(userId);
}

export async function saveLocations(
  userId: string,
  locations: Array<{
    label: LocationLabel;
    address: string;
    latitude: number;
    longitude: number;
    isDefault?: boolean;
  }>,
) {
  for (const loc of locations) {
    await prisma.savedLocation.upsert({
      where: { userId_label: { userId, label: loc.label } },
      create: {
        userId,
        label: loc.label,
        address: loc.address,
        latitude: loc.latitude,
        longitude: loc.longitude,
        isDefault: loc.isDefault ?? false,
      },
      update: {
        address: loc.address,
        latitude: loc.latitude,
        longitude: loc.longitude,
        isDefault: loc.isDefault ?? false,
      },
    });
  }

  await syncUserStatus(userId);
  return getPassengerView(userId);
}

export async function getPassengerView(userId: string) {
  const user = await getUserById(userId);
  const pp = user.passengerProfile;
  return {
    profile: user.profile
      ? {
          fullName: user.profile.fullName,
          photoUrl: user.profile.photoUrl,
          ratingAvg: Number(user.profile.ratingAvg),
          ratingCount: user.profile.ratingCount,
          verificationLevel: pp?.verificationLevel ?? 'basic',
        }
      : null,
    loyalty: {
      tier: pp?.loyaltyTier ?? 'basic',
      points: pp?.loyaltyPoints ?? 0,
    },
    stats: {
      totalRides: pp?.totalRides ?? 0,
      totalSpend: pp ? Number(pp.totalSpend) : 0,
      lastRideAt: pp?.lastRideAt ?? null,
      cancellationScore: pp ? Number(pp.cancellationScore) : 0,
    },
    // legacy fields kept for backwards compatibility with existing mobile clients
    loyaltyTier: pp?.loyaltyTier ?? 'basic',
    loyaltyPoints: pp?.loyaltyPoints ?? 0,
    wallet: user.wallet
      ? {
          balance: Number(user.wallet.balance),
          currency: user.wallet.currency,
          status: user.wallet.status,
        }
      : null,
    savedPlaces: user.savedLocations.map((l) => ({
      id: l.id,
      label: l.label,
      address: l.address,
      latitude: Number(l.latitude),
      longitude: Number(l.longitude),
      isDefault: l.isDefault,
    })),
    preferences: {
      defaultVehicleType: pp?.defaultVehicleType ?? null,
      promoOptIn: pp?.promoOptIn ?? true,
    },
  };
}

export async function removeSavedLocation(userId: string, locationId: string) {
  const result = await prisma.savedLocation.deleteMany({
    where: { id: locationId, userId },
  });
  if (result.count === 0) throw new NotFoundError('Saved location not found');
  return getPassengerView(userId);
}

export async function getMyWallet(userId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) throw new NotFoundError('Wallet not found');
  return {
    id: wallet.id,
    balance: Number(wallet.balance),
    currency: wallet.currency,
    status: wallet.status,
    createdAt: wallet.createdAt,
    updatedAt: wallet.updatedAt,
  };
}

export async function getMyWalletTransactions(
  userId: string,
  query: { page: number; limit: number; type?: WalletTransactionType },
) {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) throw new NotFoundError('Wallet not found');

  const where: Prisma.WalletTransactionWhereInput = { walletId: wallet.id };
  if (query.type) where.type = query.type;

  const skip = (query.page - 1) * query.limit;
  const [rows, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: query.limit,
    }),
    prisma.walletTransaction.count({ where }),
  ]);

  return {
    wallet: {
      id: wallet.id,
      balance: Number(wallet.balance),
      currency: wallet.currency,
      status: wallet.status,
    },
    transactions: rows.map((tx) => ({
      id: tx.id,
      type: tx.type,
      amount: CREDIT_TX_TYPES.includes(tx.type) ? Number(tx.amount) : -Number(tx.amount),
      currency: tx.currency,
      balanceAfter: Number(tx.balanceAfter),
      description: tx.description,
      referenceType: tx.referenceType,
      referenceId: tx.referenceId,
      createdAt: tx.createdAt,
    })),
    total,
  };
}

export async function getDriverView(userId: string) {
  const user = await getUserById(userId);
  const driver = user.driverProfile;

  if (!driver) {
    throw new NotFoundError('Driver profile not found');
  }

  return {
    onboardingStatus: driver.onboardingStatus,
    driverType: driver.driverType,
    fleetCompanyId: driver.fleetCompanyId,
    isOnline: driver.isOnline,
    serviceModes: driver.serviceModes?.length ? driver.serviceModes : ['rides'],
    incentiveTier: driver.incentiveTier,
    totalRides: driver.totalRides,
    totalDistanceKm: Number(driver.totalDistanceKm),
    activeHours: Number(driver.activeHours),
    licenseNumber: maskSensitive(driver.licenseNumber),
    licenseExpiry: driver.licenseExpiry,
    documents: await listDocuments(userId),
    vehicle: driver.vehicle
      ? {
          id: driver.vehicle.id,
          vehicleType: driver.vehicle.vehicleType,
          model: driver.vehicle.model,
          numberPlate: driver.vehicle.numberPlate,
          availableSeats: driver.vehicle.availableSeats,
          cargoCapacityKg:
            driver.vehicle.cargoCapacityKg != null
              ? Number(driver.vehicle.cargoCapacityKg)
              : null,
          isVerified: driver.vehicle.isVerified,
        }
      : null,
  };
}

export async function setDriverAvailability(
  userId: string,
  isOnline: boolean,
  modes?: string[],
) {
  const onboarding = await computeOnboarding(userId);
  const user = await getUserById(userId);
  const capabilities = getCapabilities(user, onboarding);

  if (isOnline && !capabilities.can_drive) {
    throw new ForbiddenError('Cannot go online. Driver verification incomplete.', 'DRIVER_NOT_APPROVED', {
      pending_steps: onboarding.pending_steps,
    });
  }

  const data: { isOnline: boolean; serviceModes?: string[] } = { isOnline };
  if (modes?.length) {
    data.serviceModes = normalizeServiceModes(modes);
  }

  await prisma.driverProfile.update({
    where: { userId },
    data,
  });

  if (isOnline) {
    await redis.set(RedisKeys.driverOnline(userId), '1');
  } else {
    await redis.del(RedisKeys.driverOnline(userId), RedisKeys.driverLocation(userId));
  }

  return getDriverView(userId);
}

export async function setDriverServiceModes(userId: string, modes: string[]) {
  const normalized = normalizeServiceModes(modes);
  const driver = await prisma.driverProfile.findUnique({ where: { userId } });
  if (!driver) throw new NotFoundError('Driver profile not found');

  await prisma.driverProfile.update({
    where: { userId },
    data: { serviceModes: normalized },
  });
  return getDriverView(userId);
}

export async function upsertVehicle(
  userId: string,
  data: {
    vehicleType: string;
    model: string;
    numberPlate: string;
    availableSeats?: number;
    color?: string;
    year?: number;
    cargoCapacityKg?: number;
  },
) {
  let driver = await prisma.driverProfile.findUnique({ where: { userId } });
  if (!driver) {
    await assertCanOnboardAsDriver(userId);
    driver = await prisma.driverProfile.create({
      data: { userId, onboardingStatus: DriverOnboardingStatus.draft },
    });
    await prisma.userPlatformRole.upsert({
      where: { userId_role: { userId, role: PlatformRole.DRIVER } },
      create: { userId, role: PlatformRole.DRIVER },
      update: {},
    });
  }

  await prisma.vehicle.upsert({
    where: { driverProfileId: driver.id },
    create: {
      driverProfileId: driver.id,
      vehicleType: data.vehicleType,
      model: data.model,
      numberPlate: data.numberPlate,
      availableSeats: data.availableSeats ?? 4,
      color: data.color,
      year: data.year,
      cargoCapacityKg: data.cargoCapacityKg,
    },
    update: {
      vehicleType: data.vehicleType,
      model: data.model,
      numberPlate: data.numberPlate,
      availableSeats: data.availableSeats ?? 4,
      color: data.color,
      year: data.year,
      ...(data.cargoCapacityKg !== undefined && { cargoCapacityKg: data.cargoCapacityKg }),
    },
  });

  return getDriverView(userId);
}

export async function registerDocument(
  userId: string,
  type: DocumentType,
  fileUrl: string,
  expiresAt?: string,
) {
  const doc = await prisma.verificationDocument.create({
    data: {
      userId,
      type,
      fileUrl,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    },
  });

  const driver = await prisma.driverProfile.findUnique({ where: { userId } });
  if (driver?.onboardingStatus === DriverOnboardingStatus.rejected) {
    await prisma.driverProfile.update({
      where: { userId },
      data: { onboardingStatus: DriverOnboardingStatus.pending_review },
    });
  }

  const onboarding = await computeOnboarding(userId);
  if (onboarding.is_driver && onboarding.vehicle_info && onboarding.documents_uploaded && onboarding.personal_info) {
    await prisma.driverProfile.updateMany({
      where: { userId, onboardingStatus: DriverOnboardingStatus.draft },
      data: { onboardingStatus: DriverOnboardingStatus.pending_review },
    });
  }

  return {
    id: doc.id,
    type: doc.type,
    status: doc.status,
    submittedAt: doc.submittedAt,
  };
}

function mapDocumentRow(d: {
  id: string;
  type: DocumentType;
  fileUrl: string;
  status: DocumentStatus;
  rejectionReason: string | null;
  expiresAt: Date | null;
  submittedAt: Date;
  reviewedAt: Date | null;
}) {
  return {
    id: d.id,
    type: d.type,
    status: d.status,
    fileUrl: d.fileUrl,
    rejectionReason: d.rejectionReason,
    expiresAt: d.expiresAt,
    submittedAt: d.submittedAt,
    reviewedAt: d.reviewedAt,
  };
}

/** Latest verification document per type (newest upload wins). */
export async function listDocuments(userId: string) {
  const docs = await prisma.verificationDocument.findMany({
    where: { userId },
    orderBy: [{ type: 'asc' }, { submittedAt: 'desc' }],
  });

  const latestByType = new Map<DocumentType, (typeof docs)[number]>();
  for (const doc of docs) {
    if (!latestByType.has(doc.type)) {
      latestByType.set(doc.type, doc);
    }
  }

  return Array.from(latestByType.values())
    .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime())
    .map(mapDocumentRow);
}

export async function recordConsent(
  userId: string,
  consents: Array<{ type: ConsentType; version: string; accepted: boolean }>,
) {
  for (const c of consents) {
    await prisma.consentRecord.upsert({
      where: {
        userId_type_version: { userId, type: c.type, version: c.version },
      },
      create: {
        userId,
        type: c.type,
        version: c.version,
        accepted: c.accepted,
      },
      update: { accepted: c.accepted },
    });
  }

  return { recorded: consents.length };
}

export async function updatePhotoUrl(userId: string, photoUrl: string) {
  await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, photoUrl },
    update: { photoUrl },
  });
  return { photoUrl };
}

export async function saveLocalUpload(filename: string, buffer: Buffer): Promise<string> {
  const uploadDir = path.resolve(env.UPLOAD_LOCAL_PATH);
  await fs.mkdir(uploadDir, { recursive: true });
  const safeName = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const filePath = path.join(uploadDir, safeName);
  await fs.writeFile(filePath, buffer);
  return `/uploads/${safeName}`;
}

export async function registerFcmToken(
  userId: string,
  data: { fcmToken: string; deviceName?: string; platform?: string },
) {
  // Same token must not own multiple rows (re-login / reinstall).
  const existing = await prisma.userDevice.findFirst({
    where: { fcmToken: data.fcmToken },
  });
  if (existing) {
    const device = await prisma.userDevice.update({
      where: { id: existing.id },
      data: {
        userId,
        deviceName: data.deviceName ?? existing.deviceName,
        platform: data.platform ?? existing.platform,
        lastSeenAt: new Date(),
      },
    });
    return { deviceId: device.id };
  }
  const device = await prisma.userDevice.create({
    data: {
      userId,
      fcmToken: data.fcmToken,
      deviceName: data.deviceName,
      platform: data.platform,
    },
  });
  return { deviceId: device.id };
}

export async function listDevices(userId: string) {
  return prisma.userDevice.findMany({
    where: { userId },
    orderBy: { lastSeenAt: 'desc' },
    select: {
      id: true,
      deviceName: true,
      platform: true,
      lastSeenAt: true,
      createdAt: true,
    },
  });
}

export async function removeDevice(userId: string, deviceId: string) {
  const result = await prisma.userDevice.deleteMany({
    where: { id: deviceId, userId },
  });
  if (result.count === 0) throw new NotFoundError('Device not found');
}

export async function getNotificationPreferences(userId: string) {
  const prefs = await prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  return prefs;
}

export async function updateNotificationPreferences(
  userId: string,
  data: Partial<{
    pushEnabled: boolean;
    smsEnabled: boolean;
    emailEnabled: boolean;
    rideUpdates: boolean;
    promotions: boolean;
  }>,
) {
  return prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}

export async function getRestrictions(userId: string) {
  const now = new Date();
  const records = await prisma.abuseRecord.findMany({
    where: {
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: 'desc' },
  });

  return records.map((r) => ({
    id: r.id,
    action: r.action,
    reason: r.reason,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
  }));
}

export async function requestAccountDeletion(userId: string) {
  const deleteAt = new Date();
  deleteAt.setDate(deleteAt.getDate() + 30);

  await prisma.user.update({
    where: { id: userId },
    // Free unique email so another account can claim it later
    data: { status: 'DELETED', deletedAt: new Date(), email: null },
  });

  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  return { message: 'Account scheduled for deletion', effectiveAt: deleteAt };
}

export async function exportUserData(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      passengerProfile: true,
      driverProfile: { include: { vehicle: true } },
      savedLocations: true,
      documents: true,
      consents: true,
      wallet: true,
      devices: true,
      abuseRecords: true,
    },
  });

  if (!user) throw new NotFoundError('User not found');

  return {
    exportedAt: new Date().toISOString(),
    user: {
      ...user,
      passwordHash: undefined,
      driverProfile: user.driverProfile
        ? {
            ...user.driverProfile,
            licenseNumber: maskSensitive(user.driverProfile.licenseNumber),
          }
        : null,
    },
  };
}

export async function getPublicProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true, passengerProfile: true, driverProfile: true },
  });

  if (!user || user.deletedAt) throw new NotFoundError('User not found');

  const badges = await getTrustBadges(userId);

  return {
    id: user.id,
    fullName: user.profile?.fullName ?? 'User',
    photoUrl: user.profile?.photoUrl,
    ratingAvg: user.profile ? Number(user.profile.ratingAvg) : 0,
    ratingCount: user.profile?.ratingCount ?? 0,
    trustBadges: badges,
  };
}

export async function reportUser(
  reporterId: string,
  reportedId: string,
  reason: string,
  description?: string,
  rideId?: string,
) {
  if (reporterId === reportedId) {
    throw new ValidationError('Cannot report yourself');
  }

  const report = await prisma.abuseReport.create({
    data: { reporterId, reportedId, reason, description, rideId },
  });

  return { id: report.id, status: report.status };
}

export async function blockUser(blockerId: string, blockedId: string) {
  if (blockerId === blockedId) {
    throw new ValidationError('Cannot block yourself');
  }

  await prisma.userBlock.upsert({
    where: { blockerId_blockedId: { blockerId, blockedId } },
    create: { blockerId, blockedId },
    update: {},
  });

  return { blocked: true };
}

export async function unblockUser(blockerId: string, blockedId: string) {
  await prisma.userBlock.deleteMany({ where: { blockerId, blockedId } });
  return { blocked: false };
}

export async function getTrustScore(userId: string) {
  const user = await getUserById(userId);
  const badges = await getTrustBadges(userId);
  return {
    ratingAvg: user.profile ? Number(user.profile.ratingAvg) : 0,
    ratingCount: user.profile?.ratingCount ?? 0,
    trustBadges: badges,
    loyaltyTier: user.passengerProfile?.loyaltyTier,
    incentiveTier: user.driverProfile?.incentiveTier,
  };
}
