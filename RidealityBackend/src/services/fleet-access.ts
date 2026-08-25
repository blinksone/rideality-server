import { AdminRole, FleetCompanyStatus, FleetMemberRole, FleetMemberStatus, PlatformRole } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ConflictError, ForbiddenError } from '../utils/errors';

/** Canonical membership tiers after mapping legacy manager/dispatcher. */
export type FleetAccessTier = 'owner' | 'regional' | 'support' | 'finance';

export type FleetAccessContext = {
  userId: string;
  companyId: string;
  isPlatformAdmin: boolean;
  /** owner | regional | support | finance | null (platform admin with no membership) */
  tier: FleetAccessTier | null;
  membershipId: string | null;
  /** Region this actor is locked to. Null = whole company (owner / platform admin). */
  fleetRegionId: string | null;
  canReviewDocuments: boolean;
  /** Drivers, vehicles, and driver invites — regional / support, not country owner. */
  canManageDriverOps: boolean;
  canViewDrivers: boolean;
  canRequestDriverCredit: boolean;
  canReviewDriverCredit: boolean;
  canInviteRegional: boolean;
  canInviteSupport: boolean;
};

const STAFF_ROLES: FleetMemberRole[] = [
  FleetMemberRole.owner,
  FleetMemberRole.regional,
  FleetMemberRole.support,
  FleetMemberRole.finance,
  FleetMemberRole.manager,
  FleetMemberRole.dispatcher,
];

const STAFF_PLATFORM_ROLES: PlatformRole[] = [
  PlatformRole.FLEET_OWNER,
  PlatformRole.FLEET_MANAGER,
  PlatformRole.SUPPORT_AGENT,
  PlatformRole.ADMIN,
  PlatformRole.SUPER_ADMIN,
  PlatformRole.SUB_ADMIN,
  PlatformRole.FINANCE_OFFICER,
];

const ASSIGNMENT_TO_MEMBER_ROLE: Partial<Record<AdminRole, FleetMemberRole>> = {
  FLEET_FINANCE: FleetMemberRole.finance,
  FLEET_SUPPORT: FleetMemberRole.support,
  REGIONAL_FLEET: FleetMemberRole.regional,
};

async function findFleetCompanyForActor(actorId: string) {
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
  if (!city) return null;
  return prisma.fleetRegion.create({
    data: {
      fleetCompanyId: companyId,
      name: city.name,
      provinceId: city.provinceId,
      geoCityId: city.id,
    },
  });
}

/**
 * Existing Fleet Finance / Support / Regional users were invited before membership
 * was written. Attach them to the inviter's company so the fleet portal can open.
 */
export async function ensureFleetStaffMembershipFromAssignment(userId: string) {
  const assignment = await prisma.adminAssignment.findUnique({
    where: { userId },
    include: { invitedBy: true },
  });
  if (!assignment) return;
  const memberRole = ASSIGNMENT_TO_MEMBER_ROLE[assignment.role];
  if (!memberRole) return;

  const existing = await prisma.fleetMembership.findFirst({
    where: { userId, status: FleetMemberStatus.active, role: { in: STAFF_ROLES } },
  });
  if (existing) {
    if (existing.role !== memberRole && existing.role !== FleetMemberRole.owner) {
      await prisma.fleetMembership.update({
        where: { id: existing.id },
        data: { role: memberRole },
      });
    }
    return;
  }

  const inviterUserId = assignment.invitedBy?.userId ?? null;
  let company = inviterUserId ? await findFleetCompanyForActor(inviterUserId) : null;
  if (!company && assignment.countryId && assignment.cityId) {
    const matches = await prisma.fleetCompany.findMany({
      where: {
        regionId: assignment.countryId,
        status: FleetCompanyStatus.active,
        fleetRegions: { some: { geoCityId: assignment.cityId } },
      },
      take: 2,
    });
    if (matches.length === 1) company = matches[0];
  }
  if (!company) return;

  let fleetRegionId: string | null = null;
  if (assignment.cityId) {
    const region = await ensureFleetRegionForGeoCity(company.id, assignment.cityId);
    fleetRegionId = region?.id ?? null;
  }
  if (!fleetRegionId) {
    const first = await prisma.fleetRegion.findFirst({
      where: { fleetCompanyId: company.id },
      orderBy: { createdAt: 'asc' },
    });
    fleetRegionId = first?.id ?? null;
  }

  await prisma.fleetMembership.upsert({
    where: { fleetCompanyId_userId: { fleetCompanyId: company.id, userId } },
    create: {
      fleetCompanyId: company.id,
      userId,
      role: memberRole,
      fleetRegionId,
      invitedByUserId: inviterUserId,
      status: FleetMemberStatus.active,
    },
    update: {
      role: memberRole,
      status: FleetMemberStatus.active,
      ...(fleetRegionId ? { fleetRegionId } : {}),
      invitedByUserId: inviterUserId,
    },
  });
}

/** Prisma `user` filter: hide fleet/platform staff from driver rosters. */
export function notStaffDriverUserFilter(companyId: string) {
  return {
    fleetMemberships: {
      none: {
        fleetCompanyId: companyId,
        status: FleetMemberStatus.active,
        role: { in: STAFF_ROLES },
      },
    },
  };
}

/** Driver signup must use a phone that is not already a fleet or platform staff account. */
export async function assertCanOnboardAsDriver(userId: string) {
  const membership = await prisma.fleetMembership.findFirst({
    where: {
      userId,
      status: FleetMemberStatus.active,
      role: { in: STAFF_ROLES },
    },
    include: { fleetCompany: { select: { legalName: true } } },
  });
  if (membership) {
    throw new ConflictError(
      `This phone is already registered as fleet staff (${membership.fleetCompany.legalName}). Use a different phone number to sign up as a driver.`,
      'FLEET_STAFF_ACCOUNT',
    );
  }

  const staffRole = await prisma.userPlatformRole.findFirst({
    where: { userId, role: { in: STAFF_PLATFORM_ROLES } },
  });
  if (staffRole) {
    throw new ConflictError(
      'This phone is already registered as a staff account. Use a different phone number to sign up as a driver.',
      'STAFF_ACCOUNT',
    );
  }
}

export function normalizeMemberRole(role: FleetMemberRole): FleetAccessTier {
  if (role === FleetMemberRole.owner) return 'owner';
  if (role === FleetMemberRole.regional || role === FleetMemberRole.manager) return 'regional';
  if (role === FleetMemberRole.finance) return 'finance';
  return 'support';
}

export function isCompanyWideTier(tier: FleetAccessTier | null, isPlatformAdmin: boolean): boolean {
  return isPlatformAdmin || tier === 'owner' || tier === 'support';
}

function fleetStatusBlockMessage(
  status: FleetCompanyStatus,
  statusReason: string | null | undefined,
): { message: string; code: string } {
  const reason = statusReason?.trim();
  if (status === FleetCompanyStatus.suspended) {
    return {
      code: 'FLEET_SUSPENDED',
      message: reason
        ? `This fleet is suspended: ${reason}`
        : 'This fleet is suspended. Contact Rideality support.',
    };
  }
  return {
    code: 'FLEET_PENDING',
    message: reason
      ? `This fleet is pending approval: ${reason}`
      : 'This fleet is pending approval and cannot be used yet.',
  };
}

/** Block fleet-portal members from non-active companies (platform admins still allowed). */
export function assertFleetCompanyActiveForMember(
  status: FleetCompanyStatus,
  statusReason: string | null | undefined,
  isPlatformAdmin: boolean,
) {
  if (isPlatformAdmin || status === FleetCompanyStatus.active) return;
  const { message, code } = fleetStatusBlockMessage(status, statusReason);
  throw new ForbiddenError(message, code);
}

export async function assertFleetAccess(
  companyId: string,
  userId: string,
  options?: { fleetRegionId?: string },
): Promise<FleetAccessContext> {
  const membership = await prisma.fleetMembership.findFirst({
    where: {
      fleetCompanyId: companyId,
      userId,
      status: FleetMemberStatus.active,
      role: { in: STAFF_ROLES },
    },
  });

  const isAdmin = await prisma.userPlatformRole.findFirst({
    where: {
      userId,
      role: { in: [PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN, PlatformRole.SUB_ADMIN] },
    },
  });

  if (!membership && !isAdmin) {
    throw new ForbiddenError('No access to this fleet');
  }

  const isPlatformAdmin = Boolean(isAdmin);
  const company = await prisma.fleetCompany.findUnique({
    where: { id: companyId },
    select: { status: true, statusReason: true },
  });
  if (!company) {
    throw new ForbiddenError('No access to this fleet');
  }
  assertFleetCompanyActiveForMember(company.status, company.statusReason, isPlatformAdmin);

  const tier = membership ? normalizeMemberRole(membership.role) : null;
  const membershipRegionId = membership?.fleetRegionId ?? null;

  let fleetRegionId: string | null = null;
  if (isPlatformAdmin || tier === 'owner') {
    fleetRegionId = options?.fleetRegionId ?? null;
  } else {
    fleetRegionId = membershipRegionId;
    if (options?.fleetRegionId && membershipRegionId && options.fleetRegionId !== membershipRegionId) {
      throw new ForbiddenError('No access to this fleet region');
    }
  }

  const canReviewDocuments = isPlatformAdmin || tier === 'regional';
  const canManageDriverOps = isPlatformAdmin || tier === 'regional' || tier === 'support' || tier === 'owner';
  const canViewDrivers =
    isPlatformAdmin ||
    tier === 'regional' ||
    tier === 'support' ||
    tier === 'finance' ||
    tier === 'owner';
  const canRequestDriverCredit = isPlatformAdmin || tier === 'finance';
  const canReviewDriverCredit = isPlatformAdmin || tier === 'owner';

  return {
    userId,
    companyId,
    isPlatformAdmin,
    tier,
    membershipId: membership?.id ?? null,
    fleetRegionId,
    canReviewDocuments,
    canManageDriverOps,
    canViewDrivers,
    canRequestDriverCredit,
    canReviewDriverCredit,
    canInviteRegional: isPlatformAdmin || tier === 'owner',
    canInviteSupport: isPlatformAdmin || tier === 'regional',
  };
}

export async function assertFleetOwner(companyId: string, userId: string): Promise<FleetAccessContext> {
  const access = await assertFleetAccess(companyId, userId);
  if (!access.isPlatformAdmin && access.tier !== 'owner') {
    throw new ForbiddenError('Fleet owner access required');
  }
  return access;
}

export async function listMyFleetMemberships(userId: string) {
  try {
    await ensureFleetStaffMembershipFromAssignment(userId);
  } catch {
    // Login /me must still succeed if backfill cannot resolve a company.
  }

  const memberships = await prisma.fleetMembership.findMany({
    where: { userId, status: FleetMemberStatus.active },
    include: {
      fleetCompany: { select: { id: true, legalName: true, status: true } },
      fleetRegion: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return memberships.map((m) => ({
    id: m.id,
    companyId: m.fleetCompanyId,
    companyName: m.fleetCompany.legalName,
    companyStatus: m.fleetCompany.status,
    role: normalizeMemberRole(m.role),
    rawRole: m.role,
    fleetRegionId: m.fleetRegionId,
    fleetRegionName: m.fleetRegion?.name ?? null,
  }));
}

export async function assertFleetDriverOps(
  companyId: string,
  userId: string,
  options?: { fleetRegionId?: string },
): Promise<FleetAccessContext> {
  const access = await assertFleetAccess(companyId, userId, options);
  if (!access.canManageDriverOps) {
    throw new ForbiddenError('Driver, vehicle, and invite operations are managed by regional fleet');
  }
  return access;
}

export async function assertFleetCityView(
  companyId: string,
  userId: string,
  fleetRegionId: string,
): Promise<FleetAccessContext> {
  const access = await assertFleetAccess(companyId, userId, { fleetRegionId });
  if (access.tier === 'regional' && access.fleetRegionId !== fleetRegionId) {
    throw new ForbiddenError('No access to this fleet region');
  }
  return access;
}

export async function assertCanReviewFleetDocuments(
  companyId: string,
  userId: string,
  options?: { fleetRegionId?: string },
): Promise<FleetAccessContext> {
  const access = await assertFleetAccess(companyId, userId, options);
  if (!access.canReviewDocuments) {
    throw new ForbiddenError('Only regional fleet can review documents');
  }
  return access;
}
