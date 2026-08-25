import {
  AdminRole,
  DocumentStatus,
  DriverOnboardingStatus,
  FleetCompanyStatus,
  FleetMemberRole,
  FleetMemberStatus,
  FleetNotificationType,
  PlatformRole,
  Prisma,
  UserStatus,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ForbiddenError, NotFoundError, ValidationError, ConflictError } from '../utils/errors';
import { createAdminUser, getAdminUserDetail } from './admin.service';
import { createFleetCompany } from './fleet.service';
import { generateTemporaryPassword, hashPassword } from '../utils/crypto';
import { isValidE164, normalizePhone, toE164WithPrefix } from '../utils/phone';
import {
  assertCanReviewFleetDocuments,
  assertFleetAccess,
  assertFleetCityView,
  assertFleetOwner,
  normalizeMemberRole,
  notStaffDriverUserFilter,
} from './fleet-access';
import {
  assertCanInvite,
  assertTargetUserInScope,
  getAdminAssignment,
  isSuperAdminRole,
  rolesInvitableFrom,
  scopedVisibleUserWhere,
  scopeAllows,
  upsertAdminAssignment,
  type AdminAssignmentRecord,
} from './admin-scope.service';

export const PLATFORM_STAFF_TYPES = [
  'SUB_ADMIN',
  'GLOBAL_ADMIN',
  'CONTINENT_ADMIN',
  'COUNTRY_ADMIN',
  'REGIONAL_ADMIN',
  'CITY_ADMIN',
  'FLEET_OWNER',
  'REGIONAL_FLEET',
  'FLEET_FINANCE',
  'FLEET_SUPPORT',
  'FINANCE_USER',
  'PLATFORM_SUPPORT',
] as const;

export type PlatformStaffType = (typeof PLATFORM_STAFF_TYPES)[number];

const FLEET_TEAM_TYPES = ['REGIONAL_FLEET', 'FLEET_FINANCE', 'FLEET_SUPPORT'] as const;

function isFleetTeamType(type: PlatformStaffType): type is (typeof FLEET_TEAM_TYPES)[number] {
  return (FLEET_TEAM_TYPES as readonly string[]).includes(type);
}

function staffTypeToPlatformRole(type: PlatformStaffType): PlatformRole {
  switch (type) {
    case 'FLEET_OWNER':
      return PlatformRole.FLEET_OWNER;
    case 'REGIONAL_FLEET':
      return PlatformRole.FLEET_MANAGER;
    case 'FLEET_FINANCE':
    case 'FINANCE_USER':
      return PlatformRole.FINANCE_OFFICER;
    case 'FLEET_SUPPORT':
    case 'PLATFORM_SUPPORT':
      return PlatformRole.SUPPORT_AGENT;
    default:
      return PlatformRole.SUB_ADMIN;
  }
}

function staffTypeToAdminRole(type: PlatformStaffType): AdminRole {
  return type;
}

async function findActorFleetCompany(actorId: string) {
  const owned = await prisma.fleetCompany.findFirst({
    where: { ownerUserId: actorId },
    orderBy: { createdAt: 'desc' },
  });
  if (owned) return owned;
  const membership = await prisma.fleetMembership.findFirst({
    where: { userId: actorId, status: FleetMemberStatus.active },
    include: { fleetCompany: true },
    orderBy: { createdAt: 'desc' },
  });
  return membership?.fleetCompany ?? null;
}

async function ensureFleetRegionForGeoCity(companyId: string, geoCityId: string) {
  const existing = await prisma.fleetRegion.findFirst({
    where: { fleetCompanyId: companyId, geoCityId },
  });
  if (existing) return existing;
  const city = await prisma.city.findUnique({ where: { id: geoCityId } });
  if (!city) throw new NotFoundError('City not found');
  return prisma.fleetRegion.create({
    data: {
      fleetCompanyId: companyId,
      name: city.name,
      provinceId: city.provinceId,
      geoCityId: city.id,
    },
  });
}

export async function listPublicSignupCities(regionId: string) {
  const country = await prisma.region.findFirst({
    where: { id: regionId, isActive: true },
    select: { id: true },
  });
  if (!country) return [];

  return prisma.city.findMany({
    where: {
      province: { countryId: regionId },
      fleetRegions: {
        some: {
          fleetCompany: { status: FleetCompanyStatus.active, regionId },
        },
      },
    },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      provinceId: true,
      province: { select: { id: true, name: true } },
    },
  });
}

export async function listPublicFleetCompanies(query?: {
  regionId?: string;
  regionCode?: string;
  cityId?: string;
  search?: string;
  sort?: 'top' | 'name';
  limit?: number;
}) {
  let regionId = query?.regionId;
  if (!regionId && query?.regionCode) {
    const region = await prisma.region.findFirst({
      where: { code: { equals: query.regionCode, mode: 'insensitive' }, isActive: true },
      select: { id: true },
    });
    if (!region) return [];
    regionId = region.id;
  }

  const limit = query?.limit ?? 20;
  const companies = await prisma.fleetCompany.findMany({
    where: {
      status: FleetCompanyStatus.active,
      ...(regionId ? { regionId } : {}),
      ...(query?.search
        ? { legalName: { contains: query.search, mode: 'insensitive' } }
        : {}),
      ...(query?.cityId
        ? { fleetRegions: { some: { geoCityId: query.cityId } } }
        : {}),
    },
    orderBy: { legalName: 'asc' },
    take: 80,
    select: {
      id: true,
      legalName: true,
      phone: true,
      email: true,
      address: true,
      logoUrl: true,
      regionId: true,
      region: { select: { id: true, code: true, name: true } },
      owner: { select: { phone: true } },
      fleetRegions: query?.cityId
        ? {
            where: { geoCityId: query.cityId },
            take: 1,
            select: { id: true, name: true },
          }
        : false,
    },
  });

  const cards = await attachPublicCompanyStats(
    companies.map((company) => ({
      id: company.id,
      legalName: company.legalName,
      phone: company.phone ?? company.owner.phone,
      email: company.email,
      address: company.address,
      logoUrl: company.logoUrl,
      regionId: company.regionId,
      region: company.region,
      fleetRegionId: company.fleetRegions?.[0]?.id ?? null,
      fleetRegionName: company.fleetRegions?.[0]?.name ?? null,
    })),
    query?.cityId,
  );

  const sort = query?.sort ?? (query?.cityId ? 'top' : 'name');
  if (sort === 'top') {
    cards.sort((a, b) => {
      if (b.driverCount !== a.driverCount) return b.driverCount - a.driverCount;
      if (b.ratingAvg !== a.ratingAvg) return b.ratingAvg - a.ratingAvg;
      return a.legalName.localeCompare(b.legalName);
    });
  }

  return cards.slice(0, limit);
}

export async function getPublicFleetCompany(companyId: string, cityId?: string) {
  const company = await prisma.fleetCompany.findFirst({
    where: { id: companyId, status: FleetCompanyStatus.active },
    select: {
      id: true,
      legalName: true,
      phone: true,
      email: true,
      address: true,
      logoUrl: true,
      regionId: true,
      region: { select: { id: true, code: true, name: true } },
      owner: { select: { phone: true } },
      fleetRegions: cityId
        ? {
            where: { geoCityId: cityId },
            take: 1,
            select: {
              id: true,
              name: true,
              geoCity: {
                select: { id: true, name: true, province: { select: { name: true } } },
              },
            },
          }
        : {
            take: 8,
            orderBy: { name: 'asc' },
            select: { id: true, name: true, geoCity: { select: { id: true, name: true } } },
          },
    },
  });
  if (!company) throw new NotFoundError('Fleet company not found');
  if (cityId && company.fleetRegions.length === 0) {
    throw new NotFoundError('This fleet does not operate in the selected city');
  }

  const geoCity = company.fleetRegions[0]?.geoCity as
    | { name: string; province?: { name: string } }
    | null
    | undefined;
  const cityLabel = geoCity
    ? [geoCity.name, geoCity.province?.name, company.region.name].filter(Boolean).join(', ')
    : company.fleetRegions[0]?.name ?? company.region.name;

  const [stats] = await attachPublicCompanyStats(
    [
      {
        id: company.id,
        legalName: company.legalName,
        phone: company.phone ?? company.owner.phone,
        email: company.email,
        address: company.address ?? cityLabel,
        logoUrl: company.logoUrl,
        regionId: company.regionId,
        region: company.region,
        fleetRegionId: cityId ? company.fleetRegions[0]?.id ?? null : null,
        fleetRegionName: cityId ? company.fleetRegions[0]?.name ?? null : null,
      },
    ],
    cityId,
  );

  const reviews = await prisma.rideRating.findMany({
    where: {
      raterRole: 'passenger',
      moderationStatus: 'visible',
      ride: { fleetCompanyId: companyId },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      score: true,
      comment: true,
      createdAt: true,
      isAnonymous: true,
      rater: { select: { profile: { select: { fullName: true } } } },
    },
  });

  return {
    ...stats,
    cities: company.fleetRegions.map((row) => ({
      id: row.id,
      name: row.geoCity?.name ?? row.name,
    })),
    reviews: reviews.map((row) => ({
      id: row.id,
      score: row.score,
      comment: row.comment,
      createdAt: row.createdAt,
      reviewerName: row.isAnonymous
        ? 'Rideality rider'
        : row.rater.profile?.fullName?.split(' ')[0] ?? 'Rideality rider',
    })),
  };
}

async function attachPublicCompanyStats<
  T extends {
    id: string;
    legalName: string;
    phone: string | null;
    address: string | null;
    regionId: string;
    region: { id: string; code: string; name: string };
    fleetRegionId: string | null;
    fleetRegionName: string | null;
  },
>(companies: T[], cityId?: string) {
  if (companies.length === 0) return [];
  const ids = companies.map((c) => c.id);
  const fleetRegionIds = companies.map((c) => c.fleetRegionId).filter((id): id is string => Boolean(id));

  const [driverGroups, ratingRows] = await Promise.all([
    prisma.driverProfile.groupBy({
      by: ['fleetCompanyId'],
      where: {
        fleetCompanyId: { in: ids },
        onboardingStatus: DriverOnboardingStatus.approved,
        ...(cityId && fleetRegionIds.length ? { fleetRegionId: { in: fleetRegionIds } } : {}),
      },
      _count: { _all: true },
    }),
    prisma.$queryRaw<Array<{ companyId: string; ratingAvg: unknown; ratingCount: unknown }>>(
      Prisma.sql`
        SELECT r.fleet_company_id AS "companyId",
               ROUND(AVG(rr.score)::numeric, 2) AS "ratingAvg",
               COUNT(*)::int AS "ratingCount"
        FROM ride_ratings rr
        INNER JOIN rides r ON r.id = rr.ride_id
        WHERE r.fleet_company_id IN (${Prisma.join(ids)})
          AND rr.moderation_status = 'visible'
          AND rr.rater_role = 'passenger'
        GROUP BY r.fleet_company_id
      `,
    ),
  ]);

  const driversByCompany = new Map(driverGroups.map((row) => [row.fleetCompanyId, row._count._all]));
  const ratingsByCompany = new Map(
    ratingRows.map((row) => [
      row.companyId,
      {
        ratingAvg: Number(row.ratingAvg ?? 0),
        ratingCount: Number(row.ratingCount ?? 0),
      },
    ]),
  );

  return companies.map((company) => ({
    ...company,
    driverCount: driversByCompany.get(company.id) ?? 0,
    ratingAvg: ratingsByCompany.get(company.id)?.ratingAvg ?? 0,
    ratingCount: ratingsByCompany.get(company.id)?.ratingCount ?? 0,
  }));
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

  const catalog = await prisma.serviceProduct.findMany({ where: { isActive: true } });
  if (catalog.length) {
    await prisma.fleetRegionService.createMany({
      data: catalog.map((row) => ({
        fleetRegionId: region.id,
        productCode: row.code,
        enabled: true,
      })),
      skipDuplicates: true,
    });
  }

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

export async function listFleetCityServices(fleetRegionId: string) {
  const catalog = await prisma.serviceProduct.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
  const enabled = await prisma.fleetRegionService.findMany({
    where: { fleetRegionId },
  });
  const byCode = new Map(enabled.map((row) => [row.productCode, row.enabled]));
  return catalog.map((row) => ({
    code: row.code,
    label: row.label,
    family: row.family === 'cargo' ? 'cargo' : 'taxi',
    enabled: byCode.get(row.code) ?? false,
  }));
}

export async function setFleetCityServices(
  companyId: string,
  requesterId: string,
  regionId: string,
  products: Array<{ code: string; enabled: boolean }>,
) {
  await assertFleetOwner(companyId, requesterId);
  await assertFleetRegion(companyId, regionId);
  const catalog = await prisma.serviceProduct.findMany({ where: { isActive: true } });
  const allowed = new Set(catalog.map((row) => row.code));
  for (const row of products) {
    if (!allowed.has(row.code)) continue;
    await prisma.fleetRegionService.upsert({
      where: { fleetRegionId_productCode: { fleetRegionId: regionId, productCode: row.code } },
      create: { fleetRegionId: regionId, productCode: row.code, enabled: row.enabled },
      update: { enabled: row.enabled },
    });
  }
  return listFleetCityServices(regionId);
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
  const assignment = await getAdminAssignment(requesterId);
  if (assignment) {
    await assertCanInvite(assignment, 'REGIONAL_FLEET', { cityId: regionId });
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
  data: { email: string; fleetRegionId?: string },
) {
  const access = await assertFleetAccess(companyId, requesterId);
  if (!access.canInviteSupport) {
    throw new ForbiddenError('Only regional fleet can invite fleet support');
  }
  const assignment = await getAdminAssignment(requesterId);
  let cityId = data.fleetRegionId ?? access.fleetRegionId ?? assignment?.cityId ?? null;
  if (assignment) {
    const scoped = await assertCanInvite(assignment, 'FLEET_SUPPORT', { cityId });
    cityId = scoped.cityId ?? null;
  }
  if (!cityId) {
    throw new ValidationError('City is required for fleet support');
  }
  await assertFleetRegion(companyId, cityId);
  return createScopedInvite(companyId, requesterId, {
    email: data.email,
    role: FleetMemberRole.support,
    fleetRegionId: cityId,
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
  const assignment = await getAdminAssignment(requesterId);
  if (memberRole === FleetMemberRole.regional) {
    if (!access.canInviteRegional) {
      throw new ForbiddenError('Only fleet owner can create regional fleet users');
    }
    if (assignment) await assertCanInvite(assignment, 'REGIONAL_FLEET', { cityId: data.fleetRegionId });
  }
  if (memberRole === FleetMemberRole.support) {
    if (!access.canInviteSupport) {
      throw new ForbiddenError('Only regional fleet can create fleet support users');
    }
    if (assignment) {
      const scoped = await assertCanInvite(assignment, 'FLEET_SUPPORT', { cityId: data.fleetRegionId });
      data.fleetRegionId = scoped.cityId ?? data.fleetRegionId;
    } else if (!data.fleetRegionId) {
      data.fleetRegionId = access.fleetRegionId ?? undefined;
    }
  }

  let region: Awaited<ReturnType<typeof assertFleetRegion>> | null = null;
  if (memberRole === FleetMemberRole.regional) {
    if (!data.fleetRegionId) throw new ValidationError('City is required for regional fleet');
    region = await assertFleetRegion(companyId, data.fleetRegionId);
    await assertCityHasNoRegionalUser(companyId, data.fleetRegionId);
  } else if (data.fleetRegionId) {
    region = await assertFleetRegion(companyId, data.fleetRegionId);
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

  await upsertAdminAssignment({
    userId: user.id,
    role: memberRole === FleetMemberRole.regional ? 'REGIONAL_FLEET' : 'FLEET_SUPPORT',
    countryId: company.regionId,
    cityId: region?.geoCityId ?? null,
    invitedByUserId: requesterId,
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
  return applyFleetDocumentReview(companyId, requesterId, documentId, data, access.fleetRegionId);
}

export async function reviewFleetDocumentById(
  requesterId: string,
  documentId: string,
  data: { status: 'approved' | 'rejected'; rejectionReason?: string },
  assignmentCityId?: string | null,
) {
  const doc = await prisma.verificationDocument.findUnique({
    where: { id: documentId },
    include: {
      user: {
        include: {
          driverProfile: {
            include: { fleetRegion: { select: { id: true, geoCityId: true } } },
          },
        },
      },
    },
  });
  const driver = doc?.user.driverProfile;
  const companyId = driver?.fleetCompanyId;
  if (!driver || !companyId) {
    throw new NotFoundError('Document not found');
  }
  const driverFleetRegionId = driver.fleetRegionId;
  const driverGeoCityId = driver.fleetRegion?.geoCityId ?? null;

  // AdminAssignment.cityId is geo City.id; fleet membership uses FleetRegion.id.
  if (
    assignmentCityId &&
    assignmentCityId !== driverFleetRegionId &&
    assignmentCityId !== driverGeoCityId
  ) {
    throw new ForbiddenError('No access to this fleet region');
  }

  const access = await assertCanReviewFleetDocuments(companyId, requesterId, {
    fleetRegionId: driverFleetRegionId ?? undefined,
  });
  return applyFleetDocumentReview(companyId, requesterId, documentId, data, access.fleetRegionId);
}

async function applyFleetDocumentReview(
  companyId: string,
  requesterId: string,
  documentId: string,
  data: { status: 'approved' | 'rejected' | 'APPROVED' | 'REJECTED'; rejectionReason?: string },
  fleetRegionId: string | null,
) {
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
  if (fleetRegionId && driver.fleetRegionId !== fleetRegionId) {
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
      action: `document.review.${approved ? 'approved' : 'rejected'}`,
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
    continentId?: string;
    regionalId?: string;
    cityId?: string;
    legalName?: string;
    taxId?: string;
  },
  ipAddress?: string,
) {
  const adminRole = staffTypeToAdminRole(data.type);
  if (data.type === 'FLEET_OWNER' && !data.legalName?.trim()) {
    throw new ValidationError('Fleet company legal name is required');
  }
  const inviter = await getAdminAssignment(actorId);
  if (!actorRoles.includes(PlatformRole.SUPER_ADMIN) && !inviter) {
    throw new ForbiddenError('Only assigned admins can create portal users');
  }
  const scoped = inviter
    ? await assertCanInvite(inviter, adminRole, {
        continentId: data.continentId,
        countryId: data.regionId,
        regionalId: data.regionalId,
        cityId: data.cityId,
      })
    : {
        continentId: data.continentId,
        countryId: data.regionId,
        regionalId: data.regionalId,
        cityId: data.cityId,
      };

  const platformRole = staffTypeToPlatformRole(data.type);
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
    { allowDelegatedCreate: true },
  );

  await upsertAdminAssignment({
    userId: user.id,
    role: adminRole,
    continentId: scoped.continentId,
    countryId: scoped.countryId,
    regionalId: scoped.regionalId,
    cityId: scoped.cityId,
    invitedByUserId: actorId,
  });

  if (data.type === 'FLEET_OWNER') {
    const company = await createFleetCompany(user.id, {
      legalName: data.legalName!,
      taxId: data.taxId,
      regionId: data.regionId,
      continentId: scoped.continentId,
      regionalId: scoped.regionalId,
      cityId: scoped.cityId,
      invitedByUserId: actorId,
    });
    return { ...user, fleetCompany: company, staffType: data.type };
  }

  if (isFleetTeamType(data.type)) {
    const company = await findActorFleetCompany(actorId);
    if (!company) {
      throw new ValidationError('You must belong to a fleet company to create this user');
    }
    const geoCityId = scoped.cityId;
    if (!geoCityId) throw new ValidationError('City is required for fleet team users');
    const fleetRegion = await ensureFleetRegionForGeoCity(company.id, geoCityId);

    if (data.type === 'REGIONAL_FLEET') {
      await assertCityHasNoRegionalUser(company.id, fleetRegion.id);
    }

    const memberRole =
      data.type === 'REGIONAL_FLEET'
        ? FleetMemberRole.regional
        : data.type === 'FLEET_SUPPORT'
          ? FleetMemberRole.support
          : data.type === 'FLEET_FINANCE'
            ? FleetMemberRole.finance
            : null;

    if (memberRole) {
      await prisma.fleetMembership.create({
        data: {
          fleetCompanyId: company.id,
          userId: user.id,
          role: memberRole,
          fleetRegionId: fleetRegion.id,
          invitedByUserId: actorId,
          status: FleetMemberStatus.active,
        },
      });
    }

    return { ...user, fleetCompany: company, staffType: data.type };
  }

  return { ...user, staffType: data.type };
}

export async function updatePlatformStaffUser(
  actorId: string,
  actorRoles: PlatformRole[],
  targetUserId: string,
  data: {
    phone: string;
    email: string;
    fullName: string;
    regionId: string;
    continentId?: string;
    regionalId?: string;
    cityId?: string;
  },
  ipAddress?: string,
) {
  const actor = await getAdminAssignment(actorId);
  const isSuper = actorRoles.includes(PlatformRole.SUPER_ADMIN) || isSuperAdminRole(actor?.role);
  if (!isSuper && !actor) {
    throw new ForbiddenError('Only assigned admins can update portal users');
  }

  await assertTargetUserInScope(actor ?? null, targetUserId);

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    include: { adminAssignment: true, profile: true },
  });
  if (!target || target.deletedAt) throw new NotFoundError('User not found');
  if (!target.adminAssignment) throw new ValidationError('This user is not a portal admin');
  if (target.adminAssignment.role === 'SUPER_ADMIN') {
    throw new ForbiddenError('Super Admin cannot be updated this way');
  }

  const adminRole = target.adminAssignment.role;
  if (!isSuper && actor && !rolesInvitableFrom(actor.role).includes(adminRole)) {
    throw new ForbiddenError(`You cannot update ${adminRole} users`);
  }

  const scoped = actor
    ? await assertCanInvite(
        actor,
        adminRole,
        {
          continentId: data.continentId,
          countryId: data.regionId,
          regionalId: data.regionalId,
          cityId: data.cityId,
        },
        { skipInviteCheck: true },
      )
    : {
        continentId: data.continentId,
        countryId: data.regionId,
        regionalId: data.regionalId,
        cityId: data.cityId,
      };

  const region = await prisma.region.findUnique({ where: { id: data.regionId } });
  if (!region || !region.isActive) throw new NotFoundError('Region not found');

  const phone = normalizePhone(data.phone);
  if (!isValidE164(phone)) {
    throw new ValidationError('Invalid phone number. Use international format, e.g. +14155552671');
  }
  const prefix = region.phonePrefix?.replace(/\s/g, '') || '';
  if (prefix && !phone.startsWith(prefix)) {
    throw new ValidationError(`Phone must start with region prefix ${prefix}`, {
      regionCode: region.code,
      phonePrefix: prefix,
    });
  }

  const email = data.email.trim().toLowerCase();
  const existingPhone = await prisma.user.findFirst({
    where: { phone, regionId: data.regionId, deletedAt: null, NOT: { id: targetUserId } },
  });
  if (existingPhone) {
    throw new ConflictError('Phone already registered in this region', 'PHONE_EXISTS');
  }
  const existingEmail = await prisma.user.findFirst({
    where: { email, deletedAt: null, NOT: { id: targetUserId } },
  });
  if (existingEmail) {
    throw new ConflictError('Email already in use', 'EMAIL_EXISTS');
  }

  const proposed = {
    ...target.adminAssignment,
    continentId: scoped.continentId ?? null,
    countryId: scoped.countryId ?? null,
    regionalId: scoped.regionalId ?? null,
    cityId: scoped.cityId ?? null,
  };
  const invitees = await prisma.adminAssignment.findMany({
    where: { invitedById: target.adminAssignment.id },
    select: {
      role: true,
      continentId: true,
      countryId: true,
      regionalId: true,
      cityId: true,
      user: { select: { profile: { select: { fullName: true } }, email: true } },
    },
  });
  for (const child of invitees) {
    const stillInScope = await scopeAllows(proposed, {
      continentId: child.continentId,
      countryId: child.countryId,
      regionalId: child.regionalId,
      cityId: child.cityId,
    });
    if (!stillInScope) {
      const name = child.user.profile?.fullName ?? child.user.email ?? child.role;
      throw new ValidationError(
        `Cannot change assigned area while ${name} still reports here. Reassign that team member first.`,
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: targetUserId },
      data: {
        phone,
        email,
        region: { connect: { id: data.regionId } },
        profile: {
          upsert: {
            create: { fullName: data.fullName.trim() },
            update: { fullName: data.fullName.trim() },
          },
        },
      },
    });
  });

  await upsertAdminAssignment({
    userId: targetUserId,
    role: adminRole,
    continentId: scoped.continentId,
    countryId: scoped.countryId,
    regionalId: scoped.regionalId,
    cityId: scoped.cityId,
  });

  await prisma.auditLog.create({
    data: {
      actorId,
      targetUserId,
      action: 'user.update',
      details: {
        role: adminRole,
        fullName: data.fullName.trim(),
        email,
        phone,
        continentId: scoped.continentId ?? null,
        countryId: scoped.countryId ?? null,
        regionalId: scoped.regionalId ?? null,
        cityId: scoped.cityId ?? null,
      },
      ipAddress,
    },
  });

  return getAdminUserDetail(targetUserId);
}

export async function listPlatformStaffUsers(
  query: {
    page: number;
    limit: number;
    type?: PlatformStaffType;
    search?: string;
  },
  assignment?: AdminAssignmentRecord | null,
) {
  const roles = (query.type ? [query.type] : [...PLATFORM_STAFF_TYPES]) as AdminRole[];
  const where = {
    deletedAt: null,
    AND: [
      scopedVisibleUserWhere(assignment ?? null, {
        excludeUserId: assignment?.userId,
        staffOnly: true,
      }),
      { adminAssignment: { is: { role: { in: roles } } } },
      ...(query.search
        ? [
            {
              OR: [
                { phone: { contains: query.search } },
                { email: { contains: query.search, mode: 'insensitive' as const } },
                { profile: { fullName: { contains: query.search, mode: 'insensitive' as const } } },
              ],
            },
          ]
        : []),
    ],
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
        adminAssignment: {
          include: {
            continent: { select: { name: true, code: true } },
            country: { select: { name: true, code: true } },
            province: { select: { name: true } },
            city: { select: { name: true } },
          },
        },
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
      const assignmentRow = u.adminAssignment;
      const scopeParts = [
        assignmentRow?.continent ? assignmentRow.continent.name : null,
        assignmentRow?.country ? `${assignmentRow.country.name} (${assignmentRow.country.code})` : null,
        assignmentRow?.province?.name ?? null,
        assignmentRow?.city?.name ?? null,
      ].filter(Boolean);
      return {
        id: u.id,
        phone: u.phone,
        email: u.email,
        status: u.status,
        fullName: u.profile?.fullName,
        roles: u.platformRoles.map((r) => r.role),
        staffType: (assignmentRow?.role ?? 'SUB_ADMIN') as PlatformStaffType,
        scopeLabel: scopeParts.join(' / ') || null,
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
        role: {
          in: [
            FleetMemberRole.regional,
            FleetMemberRole.manager,
            FleetMemberRole.support,
            FleetMemberRole.dispatcher,
            FleetMemberRole.finance,
          ],
        },
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

  const cityStaff = regionalStaff;
  const mappedStaff = (m: (typeof cityStaff)[number]) => ({
    userId: m.userId,
    fullName: m.user.profile?.fullName ?? null,
    phone: m.user.phone,
    email: m.user.email,
  });

  return {
    city: { id: region.id, name: region.name, createdAt: region.createdAt },
    services: await listFleetCityServices(region.id),
    regionalAdmins: cityStaff
      .filter((m) => m.role === FleetMemberRole.regional || m.role === FleetMemberRole.manager)
      .map(mappedStaff),
    supportStaff: cityStaff
      .filter((m) => m.role === FleetMemberRole.support || m.role === FleetMemberRole.dispatcher)
      .map(mappedStaff),
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
