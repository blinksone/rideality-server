import {
  DocumentStatus,
  DriverOnboardingStatus,
  FleetCompanyStatus,
  FleetMemberRole,
  FleetMemberStatus,
  FleetNotificationType,
  PlatformRole,
  UserStatus,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ForbiddenError, NotFoundError, ValidationError, ConflictError } from '../utils/errors';
import { createAdminUser } from './admin.service';
import { createFleetCompany } from './fleet.service';
import { generateTemporaryPassword, hashPassword } from '../utils/crypto';
import { isValidE164, toE164WithPrefix } from '../utils/phone';
import {
  assertCanReviewFleetDocuments,
  assertFleetAccess,
  assertFleetCityView,
  assertFleetOwner,
  normalizeMemberRole,
  notStaffDriverUserFilter,
} from './fleet-access';

export const PLATFORM_STAFF_TYPES = [
  'SUB_ADMIN',
  'FLEET_OWNER',
  'FINANCE_USER',
  'PLATFORM_SUPPORT',
] as const;

export type PlatformStaffType = (typeof PLATFORM_STAFF_TYPES)[number];

const STAFF_TYPE_TO_ROLE: Record<Exclude<PlatformStaffType, 'FLEET_OWNER'>, PlatformRole> = {
  SUB_ADMIN: PlatformRole.SUB_ADMIN,
  FINANCE_USER: PlatformRole.FINANCE_OFFICER,
  PLATFORM_SUPPORT: PlatformRole.SUPPORT_AGENT,
};

const ROLE_TO_STAFF_TYPE: Partial<Record<PlatformRole, PlatformStaffType>> = {
  [PlatformRole.SUB_ADMIN]: 'SUB_ADMIN',
  [PlatformRole.ADMIN]: 'SUB_ADMIN',
  [PlatformRole.FINANCE_OFFICER]: 'FINANCE_USER',
  [PlatformRole.SUPPORT_AGENT]: 'PLATFORM_SUPPORT',
  [PlatformRole.FLEET_OWNER]: 'FLEET_OWNER',
};

export async function listPublicFleetCompanies(query?: { regionId?: string; regionCode?: string }) {
  let regionId = query?.regionId;
  if (!regionId && query?.regionCode) {
    const region = await prisma.region.findFirst({
      where: { code: { equals: query.regionCode, mode: 'insensitive' }, isActive: true },
      select: { id: true },
    });
    if (!region) return [];
    regionId = region.id;
  }

  const companies = await prisma.fleetCompany.findMany({
    where: {
      status: FleetCompanyStatus.active,
      ...(regionId ? { regionId } : {}),
    },
    orderBy: { legalName: 'asc' },
    select: {
      id: true,
      legalName: true,
      regionId: true,
      region: { select: { id: true, code: true, name: true } },
    },
  });
  return companies;
}

export async function listPublicFleetRegions(companyId: string) {
  const company = await prisma.fleetCompany.findUnique({
    where: { id: companyId },
    select: { id: true, status: true },
  });
  if (!company) throw new NotFoundError('Fleet company not found');

  return prisma.fleetRegion.findMany({
    where: { fleetCompanyId: companyId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, fleetCompanyId: true, createdAt: true },
  });
}

export async function listFleetRegions(companyId: string, requesterId: string) {
  const access = await assertFleetAccess(companyId, requesterId);

  const regions = await prisma.fleetRegion.findMany({
    where: {
      fleetCompanyId: companyId,
      ...(access.fleetRegionId ? { id: access.fleetRegionId } : {}),
    },
    orderBy: { name: 'asc' },
  });

  const withCounts = await Promise.all(
    regions.map(async (region) => {
      const driverCount = await prisma.driverProfile.count({
        where: { fleetCompanyId: companyId, fleetRegionId: region.id },
      });
      return { ...region, driverCount };
    }),
  );

  return withCounts;
}

export async function createFleetRegion(
  companyId: string,
  requesterId: string,
  data: { name: string },
) {
  await assertFleetOwner(companyId, requesterId);

  const name = data.name.trim();
  if (name.length < 2) throw new ValidationError('City name must be at least 2 characters');

  const existing = await prisma.fleetRegion.findFirst({
    where: { fleetCompanyId: companyId, name: { equals: name, mode: 'insensitive' } },
  });
  if (existing) throw new ValidationError('A city with this name already exists in the fleet');

  const region = await prisma.fleetRegion.create({
    data: { fleetCompanyId: companyId, name },
  });

  await prisma.auditLog.create({
    data: {
      actorId: requesterId,
      fleetCompanyId: companyId,
      action: 'fleet.region.created',
      details: { fleetRegionId: region.id, name: region.name },
    },
  });

  return region;
}

async function assertFleetRegion(companyId: string, regionId: string) {
  const region = await prisma.fleetRegion.findFirst({
    where: { id: regionId, fleetCompanyId: companyId },
  });
  if (!region) throw new NotFoundError('Fleet region not found');
  return region;
}

/** One active regional user per city. */
export async function assertCityHasNoRegionalUser(
  companyId: string,
  fleetRegionId: string,
  options?: { excludeMembershipId?: string },
) {
  const existing = await prisma.fleetMembership.findFirst({
    where: {
      fleetCompanyId: companyId,
      fleetRegionId,
      status: FleetMemberStatus.active,
      role: { in: [FleetMemberRole.regional, FleetMemberRole.manager] },
      ...(options?.excludeMembershipId ? { id: { not: options.excludeMembershipId } } : {}),
    },
    include: {
      user: { include: { profile: true } },
      fleetRegion: { select: { name: true } },
    },
  });
  if (existing) {
    const who = existing.user.profile?.fullName ?? existing.user.email ?? existing.user.phone;
    const city = existing.fleetRegion?.name ?? 'this city';
    throw new ConflictError(
      `${city} already has a regional user (${who}). Remove or reassign them first.`,
      'CITY_REGIONAL_EXISTS',
    );
  }
}

async function createScopedInvite(
  companyId: string,
  requesterId: string,
  data: { email: string; role: FleetMemberRole; fleetRegionId?: string | null },
) {
  const email = data.email.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: { email, deletedAt: null },
  });

  if (user) {
    const existing = await prisma.fleetMembership.findFirst({
      where: { fleetCompanyId: companyId, userId: user.id, status: FleetMemberStatus.active },
    });
    if (existing) throw new ValidationError('User is already a member of this fleet');
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const invite = await prisma.fleetInvite.create({
    data: {
      fleetCompanyId: companyId,
      email,
      invitedUserId: user?.id,
      phone: user?.phone,
      memberRole: data.role,
      fleetRegionId: data.fleetRegionId,
      expiresAt,
    },
  });

  if (user) {
    await prisma.fleetNotification.create({
      data: {
        fleetCompanyId: companyId,
        userId: user.id,
        type: FleetNotificationType.system,
        title: 'Fleet invitation',
        body: `You have been invited to join this fleet as ${normalizeMemberRole(data.role)}.`,
        metadata: { inviteId: invite.id, token: invite.token, fleetRegionId: data.fleetRegionId },
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      actorId: requesterId,
      fleetCompanyId: companyId,
      targetUserId: user?.id,
      action: 'fleet.invite.created',
      details: {
        inviteId: invite.id,
        role: data.role,
        fleetRegionId: data.fleetRegionId,
        email,
      },
    },
  });

  return { inviteId: invite.id, token: invite.token, expiresAt: invite.expiresAt };
}

export async function inviteRegionalFleet(
  companyId: string,
  requesterId: string,
  regionId: string,
  data: { email: string },
) {
  const access = await assertFleetOwner(companyId, requesterId);
  if (!access.canInviteRegional) {
    throw new ForbiddenError('Only fleet owner can invite regional fleet admins');
  }
  await assertFleetRegion(companyId, regionId);
  await assertCityHasNoRegionalUser(companyId, regionId);
  return createScopedInvite(companyId, requesterId, {
    email: data.email,
    role: FleetMemberRole.regional,
    fleetRegionId: regionId,
  });
}

export async function inviteFleetSupport(
  companyId: string,
  requesterId: string,
  data: { email: string },
) {
  const access = await assertFleetAccess(companyId, requesterId);
  if (!access.canInviteSupport) {
    throw new ForbiddenError('Only fleet owner can invite fleet support');
  }
  return createScopedInvite(companyId, requesterId, {
    email: data.email,
    role: FleetMemberRole.support,
    fleetRegionId: null,
  });
}

export async function createFleetStaffUser(
  companyId: string,
  requesterId: string,
  data: {
    role: 'REGIONAL' | 'SUPPORT' | 'regional' | 'support';
    fleetRegionId?: string;
    fullName: string;
    email: string;
    phone: string;
  },
) {
  const memberRole =
    data.role === 'REGIONAL' || data.role === 'regional'
      ? FleetMemberRole.regional
      : FleetMemberRole.support;

  const access = await assertFleetAccess(companyId, requesterId);
  if (memberRole === FleetMemberRole.regional && !access.canInviteRegional) {
    throw new ForbiddenError('Only fleet owner can create regional fleet users');
  }
  if (memberRole === FleetMemberRole.support && !access.canInviteSupport) {
    throw new ForbiddenError('Only fleet owner can create fleet support users');
  }

  let region: { id: string; name: string } | null = null;
  if (memberRole === FleetMemberRole.regional) {
    if (!data.fleetRegionId) throw new ValidationError('City is required for regional fleet');
    region = await assertFleetRegion(companyId, data.fleetRegionId);
    await assertCityHasNoRegionalUser(companyId, data.fleetRegionId);
  }

  const company = await prisma.fleetCompany.findUnique({
    where: { id: companyId },
    include: { region: true },
  });
  if (!company) throw new NotFoundError('Fleet company not found');

  const prefix = company.region.phonePrefix?.replace(/\s/g, '') || '';
  const phone = toE164WithPrefix(data.phone, prefix);
  if (!isValidE164(phone)) {
    throw new ValidationError('Invalid phone number');
  }
  if (prefix && !phone.startsWith(prefix)) {
    throw new ValidationError(`Phone must be a valid number for this country (${prefix})`);
  }

  const email = data.email.trim().toLowerCase();
  const existingPhone = await prisma.user.findFirst({
    where: { phone, regionId: company.regionId, deletedAt: null },
  });
  if (existingPhone) throw new ConflictError('Phone already registered in this region', 'PHONE_EXISTS');
  const existingEmail = await prisma.user.findFirst({ where: { email, deletedAt: null } });
  if (existingEmail) throw new ConflictError('Email already in use', 'EMAIL_EXISTS');

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        phone,
        email,
        passwordHash,
        phoneVerifiedAt: new Date(),
        status: UserStatus.ACTIVE,
        mustResetPassword: true,
        region: { connect: { id: company.regionId } },
        profile: { create: { fullName: data.fullName.trim() } },
        passengerProfile: { create: {} },
        notificationPrefs: { create: {} },
        wallet: { create: { currency: company.region.currency } },
        ...(memberRole === FleetMemberRole.regional
          ? { platformRoles: { create: { role: PlatformRole.FLEET_MANAGER } } }
          : {}),
      },
    });

    await tx.fleetMembership.create({
      data: {
        fleetCompanyId: companyId,
        userId: created.id,
        role: memberRole,
        fleetRegionId: region?.id ?? null,
        invitedByUserId: requesterId,
        status: FleetMemberStatus.active,
      },
    });

    return created;
  });

  await prisma.auditLog.create({
    data: {
      actorId: requesterId,
      fleetCompanyId: companyId,
      targetUserId: user.id,
      action: 'fleet.staff.created',
      details: { role: memberRole, fleetRegionId: region?.id ?? null, email },
    },
  });

  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    fullName: data.fullName.trim(),
    role: normalizeMemberRole(memberRole),
    fleetRegionId: region?.id ?? null,
    fleetRegionName: region?.name ?? null,
    temporaryPassword,
  };
}

export async function reviewFleetDocument(
  companyId: string,
  requesterId: string,
  documentId: string,
  data: { status: 'approved' | 'rejected' | 'APPROVED' | 'REJECTED'; rejectionReason?: string },
) {
  const access = await assertCanReviewFleetDocuments(companyId, requesterId);

  const doc = await prisma.verificationDocument.findUnique({
    where: { id: documentId },
    include: {
      user: {
        include: {
          driverProfile: true,
          profile: true,
        },
      },
    },
  });
  if (!doc) throw new NotFoundError('Document not found');

  const driver = doc.user.driverProfile;
  if (!driver || driver.fleetCompanyId !== companyId) {
    throw new NotFoundError('Document does not belong to this fleet');
  }
  if (access.fleetRegionId && driver.fleetRegionId !== access.fleetRegionId) {
    throw new ForbiddenError('No access to documents outside your city');
  }
  const approved = data.status.toLowerCase() === 'approved';
  if (!approved && !data.rejectionReason?.trim()) {
    throw new ValidationError('Rejection reason is required');
  }

  const updated = await prisma.verificationDocument.update({
    where: { id: documentId },
    data: {
      status: approved ? DocumentStatus.approved : DocumentStatus.rejected,
      reviewedBy: requesterId,
      reviewedAt: new Date(),
      rejectionReason: approved ? null : data.rejectionReason?.trim(),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: requesterId,
      fleetCompanyId: companyId,
      targetUserId: doc.userId,
      action: `document.review.${data.status}`,
      details: { documentId, type: doc.type },
    },
  });

  return updated;
}

export async function createPlatformStaffUser(
  actorId: string,
  actorRoles: PlatformRole[],
  data: {
    type: PlatformStaffType;
    phone: string;
    email: string;
    fullName: string;
    regionId: string;
    legalName?: string;
    taxId?: string;
  },
  ipAddress?: string,
) {
  if (!actorRoles.includes(PlatformRole.SUPER_ADMIN)) {
    throw new ForbiddenError('Only SUPER_ADMIN can create platform staff');
  }

  if (data.type === 'FLEET_OWNER') {
    if (!data.legalName?.trim()) {
      throw new ValidationError('Fleet company legal name is required');
    }
    const user = await createAdminUser(
      actorId,
      actorRoles,
      {
        phone: data.phone,
        email: data.email,
        fullName: data.fullName,
        regionId: data.regionId,
        platformRole: PlatformRole.FLEET_OWNER,
      },
      ipAddress,
    );
    const company = await createFleetCompany(user.id, {
      legalName: data.legalName,
      taxId: data.taxId,
      regionId: data.regionId,
    });
    return { ...user, fleetCompany: company, staffType: 'FLEET_OWNER' as const };
  }

  const platformRole = STAFF_TYPE_TO_ROLE[data.type];
  const user = await createAdminUser(
    actorId,
    actorRoles,
    {
      phone: data.phone,
      email: data.email,
      fullName: data.fullName,
      regionId: data.regionId,
      platformRole,
    },
    ipAddress,
  );
  return { ...user, staffType: data.type };
}

export async function listPlatformStaffUsers(query: {
  page: number;
  limit: number;
  type?: PlatformStaffType;
  search?: string;
}) {
  const roleFilter: PlatformRole[] = query.type
    ? query.type === 'SUB_ADMIN'
      ? [PlatformRole.SUB_ADMIN, PlatformRole.ADMIN]
      : query.type === 'FINANCE_USER'
        ? [PlatformRole.FINANCE_OFFICER]
        : query.type === 'PLATFORM_SUPPORT'
          ? [PlatformRole.SUPPORT_AGENT]
          : [PlatformRole.FLEET_OWNER]
    : [
        PlatformRole.SUB_ADMIN,
        PlatformRole.ADMIN,
        PlatformRole.FINANCE_OFFICER,
        PlatformRole.SUPPORT_AGENT,
        PlatformRole.FLEET_OWNER,
      ];

  const where = {
    deletedAt: null,
    platformRoles: { some: { role: { in: roleFilter } } },
    ...(query.search && {
      OR: [
        { phone: { contains: query.search } },
        { email: { contains: query.search, mode: 'insensitive' as const } },
        { profile: { fullName: { contains: query.search, mode: 'insensitive' as const } } },
      ],
    }),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { createdAt: 'desc' },
      include: {
        profile: true,
        platformRoles: true,
        ownedFleets: {
          select: { id: true, legalName: true, status: true },
          take: 5,
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users: users.map((u) => {
      const roles = u.platformRoles.map((r) => r.role);
      const staffType =
        ROLE_TO_STAFF_TYPE[roles.find((r) => ROLE_TO_STAFF_TYPE[r]) ?? PlatformRole.ADMIN] ??
        'SUB_ADMIN';
      return {
        id: u.id,
        phone: u.phone,
        email: u.email,
        status: u.status,
        fullName: u.profile?.fullName,
        roles,
        staffType,
        fleets: u.ownedFleets,
        createdAt: u.createdAt,
      };
    }),
    total,
  };
}

export async function getFleetOwnerCompanyDetail(companyId: string) {
  const company = await prisma.fleetCompany.findUnique({
    where: { id: companyId },
    include: {
      region: { select: { id: true, code: true, name: true } },
      owner: { include: { profile: { select: { fullName: true } } } },
    },
  });
  if (!company) throw new NotFoundError('Fleet company not found');

  const regions = await listFleetRegions(companyId, company.ownerUserId);
  const [driverCount, supportCount] = await Promise.all([
    prisma.driverProfile.count({
      where: { fleetCompanyId: companyId, onboardingStatus: DriverOnboardingStatus.approved },
    }),
    prisma.fleetMembership.count({
      where: {
        fleetCompanyId: companyId,
        status: FleetMemberStatus.active,
        role: { in: [FleetMemberRole.support, FleetMemberRole.dispatcher] },
      },
    }),
  ]);

  return {
    ...company,
    regions,
    driverCount,
    supportCount,
  };
}

export async function getFleetCityProfile(
  companyId: string,
  requesterId: string,
  regionId: string,
) {
  await assertFleetCityView(companyId, requesterId, regionId);
  const region = await assertFleetRegion(companyId, regionId);

  const drivers = await prisma.driverProfile.findMany({
    where: {
      fleetCompanyId: companyId,
      fleetRegionId: regionId,
      user: notStaffDriverUserFilter(companyId),
    },
    include: {
      user: { include: { profile: true, wallet: true } },
      vehicle: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  const driverIds = drivers.map((d) => d.userId);
  const emptyIds = driverIds.length === 0;

  const [trips, tripCount, complaints, documents, regionalStaff] = await Promise.all([
    emptyIds
      ? Promise.resolve([])
      : prisma.ride.findMany({
          where: { fleetCompanyId: companyId, driverUserId: { in: driverIds } },
          orderBy: { createdAt: 'desc' },
          take: 80,
          include: {
            driver: { include: { profile: true } },
            vehicle: true,
          },
        }),
    emptyIds
      ? Promise.resolve(0)
      : prisma.ride.count({
          where: { fleetCompanyId: companyId, driverUserId: { in: driverIds } },
        }),
    emptyIds
      ? Promise.resolve([])
      : prisma.abuseReport.findMany({
          where: { reportedId: { in: driverIds } },
          orderBy: { createdAt: 'desc' },
          take: 80,
          include: {
            reporter: { include: { profile: true } },
            reported: { include: { profile: true } },
          },
        }),
    emptyIds
      ? Promise.resolve([])
      : prisma.verificationDocument.findMany({
          where: { userId: { in: driverIds } },
          orderBy: { submittedAt: 'desc' },
          take: 80,
          include: { user: { include: { profile: true } } },
        }),
    prisma.fleetMembership.findMany({
      where: {
        fleetCompanyId: companyId,
        fleetRegionId: regionId,
        status: FleetMemberStatus.active,
        role: { in: [FleetMemberRole.regional, FleetMemberRole.manager] },
      },
      include: { user: { include: { profile: true } } },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const mappedDrivers = drivers.map((d) => ({
    userId: d.userId,
    fullName: d.user.profile?.fullName ?? null,
    phone: d.user.phone,
    email: d.user.email,
    onboardingStatus: d.onboardingStatus,
    isOnline: d.isOnline,
    totalRides: d.totalRides,
    vehicle: d.vehicle
      ? {
          id: d.vehicle.id,
          vehicleType: d.vehicle.vehicleType,
          model: d.vehicle.model,
          numberPlate: d.vehicle.numberPlate,
          color: d.vehicle.color,
          operationalStatus: d.vehicle.operationalStatus,
          isVerified: d.vehicle.isVerified,
        }
      : null,
    wallet: d.user.wallet
      ? {
          id: d.user.wallet.id,
          balance: Number(d.user.wallet.balance),
          currency: d.user.wallet.currency,
          status: d.user.wallet.status,
        }
      : null,
  }));

  const mappedVehicles = mappedDrivers
    .filter((d) => d.vehicle)
    .map((d) => ({
      ...d.vehicle!,
      driverUserId: d.userId,
      driverName: d.fullName ?? d.phone,
    }));

  const mappedTrips = trips.map((t) => ({
    id: t.id,
    status: t.status,
    passengerName: t.passengerName,
    pickupAddress: t.pickupAddress,
    dropoffAddress: t.dropoffAddress,
    fare: Number(t.fare),
    distanceKm: Number(t.distanceKm),
    currency: t.currency,
    driverUserId: t.driverUserId,
    driverName: t.driver?.profile?.fullName ?? t.driver?.phone ?? null,
    vehiclePlate: t.vehicle?.numberPlate ?? null,
    createdAt: t.createdAt,
    completedAt: t.completedAt,
  }));

  const mappedComplaints = complaints.map((c) => ({
    id: c.id,
    reason: c.reason,
    description: c.description,
    status: c.status,
    rideId: c.rideId,
    createdAt: c.createdAt,
    reporterName: c.reporter.profile?.fullName ?? c.reporter.phone,
    driverUserId: c.reportedId,
    driverName: c.reported.profile?.fullName ?? c.reported.phone,
    needsSupport: c.status === 'pending' || c.status === 'in_review',
  }));

  const mappedDocuments = documents.map((doc) => ({
    id: doc.id,
    type: doc.type,
    status: doc.status,
    fileUrl: doc.fileUrl,
    driverUserId: doc.userId,
    driverName: doc.user.profile?.fullName ?? doc.user.phone,
    submittedAt: doc.submittedAt,
    expiresAt: doc.expiresAt,
  }));

  const pendingComplaints = mappedComplaints.filter((c) => c.needsSupport);
  const pendingDrivers = mappedDrivers.filter(
    (d) => d.onboardingStatus === 'pending_review' || d.onboardingStatus === 'draft',
  );
  const pendingDocuments = mappedDocuments.filter((d) => d.status.toLowerCase() === 'pending');

  const supportNeeded = [
    ...pendingComplaints.map((c) => ({
      id: `complaint:${c.id}`,
      type: 'complaint' as const,
      title: `Complaint · ${c.reason}`,
      subtitle: `${c.driverName} · reported by ${c.reporterName}`,
      status: c.status,
      createdAt: c.createdAt,
      driverUserId: c.driverUserId,
    })),
    ...pendingDrivers.map((d) => ({
      id: `onboarding:${d.userId}`,
      type: 'onboarding' as const,
      title: 'Driver pending approval',
      subtitle: d.fullName ?? d.phone,
      status: d.onboardingStatus,
      createdAt: null as Date | null,
      driverUserId: d.userId,
    })),
    ...pendingDocuments.map((d) => ({
      id: `document:${d.id}`,
      type: 'document' as const,
      title: `Document pending · ${d.type}`,
      subtitle: d.driverName,
      status: d.status,
      createdAt: d.submittedAt,
      driverUserId: d.driverUserId,
      documentId: d.id,
    })),
  ];

  return {
    city: { id: region.id, name: region.name, createdAt: region.createdAt },
    regionalAdmins: regionalStaff.map((m) => ({
      userId: m.userId,
      fullName: m.user.profile?.fullName ?? null,
      phone: m.user.phone,
      email: m.user.email,
    })),
    stats: {
      drivers: mappedDrivers.length,
      online: mappedDrivers.filter((d) => d.isOnline).length,
      vehicles: mappedVehicles.length,
      trips: tripCount,
      pendingComplaints: pendingComplaints.length,
      pendingDocuments: pendingDocuments.length,
      pendingApprovals: pendingDrivers.length,
      walletTotal: mappedDrivers.reduce((sum, d) => sum + (d.wallet?.balance ?? 0), 0),
      currency: mappedDrivers.find((d) => d.wallet)?.wallet?.currency ?? 'PKR',
    },
    supportNeeded,
    drivers: mappedDrivers,
    vehicles: mappedVehicles,
    trips: mappedTrips,
    wallets: mappedDrivers.map((d) => ({
      driverUserId: d.userId,
      driverName: d.fullName ?? d.phone,
      wallet: d.wallet,
    })),
    complaints: mappedComplaints,
    documents: mappedDocuments,
  };
}

export async function reviewFleetCityComplaint(
  companyId: string,
  requesterId: string,
  complaintId: string,
  data: { status: 'in_review' | 'resolved' },
) {
  const access = await assertFleetAccess(companyId, requesterId);
  if (!access.isPlatformAdmin && access.tier !== 'owner' && access.tier !== 'regional' && access.tier !== 'support') {
    throw new ForbiddenError('No access to review complaints');
  }

  const report = await prisma.abuseReport.findUnique({ where: { id: complaintId } });
  if (!report) throw new NotFoundError('Complaint not found');

  const driver = await prisma.driverProfile.findFirst({
    where: { userId: report.reportedId, fleetCompanyId: companyId },
  });
  if (!driver) throw new NotFoundError('Complaint is not for a driver in this fleet');
  if (access.fleetRegionId && driver.fleetRegionId !== access.fleetRegionId) {
    throw new ForbiddenError('No access to this city complaint');
  }

  return prisma.abuseReport.update({
    where: { id: complaintId },
    data: { status: data.status },
  });
}

export { listMyFleetMemberships } from './fleet-access';
