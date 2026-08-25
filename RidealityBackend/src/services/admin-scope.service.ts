import {
  AdminRole,
  FleetMemberRole,
  FleetMemberStatus,
  PlatformRole,
  Prisma,
  ScopeType,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';
import {
  ADMIN_ROLE_DEFAULTS,
  ALLOWED_INVITES,
  PERMISSION_KEYS,
  expandPermissionAliases,
} from '../constants/permissions';

export type AdminAssignmentRecord = {
  id: string;
  userId: string;
  role: AdminRole;
  scopeType: ScopeType;
  continentId: string | null;
  countryId: string | null;
  regionalId: string | null;
  cityId: string | null;
  invitedById: string | null;
};

export type ScopeParams = {
  continentId?: string | null;
  countryId?: string | null;
  regionalId?: string | null;
  cityId?: string | null;
};

const ASSIGNMENT_SELECT = {
  id: true,
  userId: true,
  role: true,
  scopeType: true,
  continentId: true,
  countryId: true,
  regionalId: true,
  cityId: true,
  invitedById: true,
} as const;

const ROLE_PRIORITY: AdminRole[] = [
  'SUPER_ADMIN',
  'GLOBAL_ADMIN',
  'CONTINENT_ADMIN',
  'COUNTRY_ADMIN',
  'REGIONAL_ADMIN',
  'CITY_ADMIN',
  'SUB_ADMIN',
  'FINANCE_USER',
  'PLATFORM_SUPPORT',
  'FLEET_OWNER',
  'REGIONAL_FLEET',
  'FLEET_FINANCE',
  'FLEET_SUPPORT',
];

const UNRESTRICTED_SCOPES: ScopeType[] = ['PLATFORM', 'GLOBAL'];

export function isSuperAdminRole(role: AdminRole | null | undefined): boolean {
  return role === 'SUPER_ADMIN';
}

export function canInvite(inviter: AdminRole, target: AdminRole): boolean {
  return ALLOWED_INVITES[inviter]?.includes(target) ?? false;
}

export function invitedRolesFor(role: AdminRole): AdminRole[] {
  return ALLOWED_INVITES[role] ?? [];
}

/** Roles this admin may manage (invitees and everyone below them in the ladder). */
export function rolesInvitableFrom(role: AdminRole): AdminRole[] {
  const found = new Set<AdminRole>();
  const stack: AdminRole[] = [...(ALLOWED_INVITES[role] ?? [])];
  while (stack.length) {
    const next = stack.pop()!;
    if (found.has(next)) continue;
    found.add(next);
    stack.push(...(ALLOWED_INVITES[next] ?? []));
  }
  return [...found];
}

function rolesAbove(role: AdminRole): AdminRole[] {
  const index = ROLE_PRIORITY.indexOf(role);
  if (index <= 0) return [];
  return ROLE_PRIORITY.slice(0, index);
}

export function platformRoleToAdminRole(role: PlatformRole): AdminRole | null {
  switch (role) {
    case PlatformRole.SUPER_ADMIN:
      return 'SUPER_ADMIN';
    case PlatformRole.ADMIN:
    case PlatformRole.SUB_ADMIN:
      return 'SUB_ADMIN';
    case PlatformRole.FINANCE_OFFICER:
      return 'FINANCE_USER';
    case PlatformRole.SUPPORT_AGENT:
      return 'PLATFORM_SUPPORT';
    case PlatformRole.FLEET_OWNER:
      return 'FLEET_OWNER';
    case PlatformRole.FLEET_MANAGER:
      return 'REGIONAL_FLEET';
    default:
      return null;
  }
}

export function adminRoleToPlatformRole(role: AdminRole): PlatformRole {
  switch (role) {
    case 'SUPER_ADMIN':
      return PlatformRole.SUPER_ADMIN;
    case 'FINANCE_USER':
    case 'FLEET_FINANCE':
      return PlatformRole.FINANCE_OFFICER;
    case 'PLATFORM_SUPPORT':
    case 'FLEET_SUPPORT':
      return PlatformRole.SUPPORT_AGENT;
    case 'FLEET_OWNER':
      return PlatformRole.FLEET_OWNER;
    case 'REGIONAL_FLEET':
      return PlatformRole.FLEET_MANAGER;
    case 'GLOBAL_ADMIN':
    case 'CONTINENT_ADMIN':
    case 'COUNTRY_ADMIN':
    case 'REGIONAL_ADMIN':
    case 'CITY_ADMIN':
    case 'SUB_ADMIN':
    default:
      return PlatformRole.SUB_ADMIN;
  }
}

export function scopeTypeForRole(role: AdminRole): ScopeType {
  switch (role) {
    case 'GLOBAL_ADMIN':
      return 'GLOBAL';
    case 'CONTINENT_ADMIN':
      return 'CONTINENT';
    case 'COUNTRY_ADMIN':
    case 'FLEET_OWNER':
      return 'COUNTRY';
    case 'REGIONAL_ADMIN':
      return 'REGIONAL';
    case 'CITY_ADMIN':
    case 'REGIONAL_FLEET':
    case 'FLEET_SUPPORT':
    case 'FLEET_FINANCE':
      return 'CITY';
    default:
      return 'PLATFORM';
  }
}

export async function getAdminAssignment(userId: string): Promise<AdminAssignmentRecord | null> {
  return prisma.adminAssignment.findUnique({
    where: { userId },
    select: ASSIGNMENT_SELECT,
  });
}

export function assignmentPermissionKeys(assignment: AdminAssignmentRecord, grantKeys: string[] = []): string[] {
  if (isSuperAdminRole(assignment.role)) return [];
  const defaults = ADMIN_ROLE_DEFAULTS[assignment.role as Exclude<AdminRole, 'SUPER_ADMIN'>] ?? [];
  return expandPermissionAliases([...defaults, ...grantKeys]);
}

export async function resolveAssignmentPermissionKeys(assignment: AdminAssignmentRecord): Promise<string[]> {
  if (isSuperAdminRole(assignment.role)) {
    const all = await prisma.permission.findMany({ select: { key: true } });
    return all.map((p) => p.key);
  }
  const grants = await prisma.adminPermissionGrant.findMany({
    where: { assignmentId: assignment.id },
    select: { key: true },
  });
  return assignmentPermissionKeys(
    assignment,
    grants.map((g) => g.key),
  );
}

async function resolveGeo(params: ScopeParams): Promise<Required<ScopeParams>> {
  let continentId = params.continentId ?? null;
  let countryId = params.countryId ?? null;
  let regionalId = params.regionalId ?? null;
  let cityId = params.cityId ?? null;

  if (cityId) {
    const geoCity = await prisma.city.findUnique({
      where: { id: cityId },
      select: {
        provinceId: true,
        province: { select: { countryId: true, country: { select: { continentId: true } } } },
      },
    });
    if (geoCity) {
      regionalId = regionalId ?? geoCity.provinceId;
      countryId = countryId ?? geoCity.province.countryId;
      continentId = continentId ?? geoCity.province.country.continentId;
    } else {
      const fleetCity = await prisma.fleetRegion.findUnique({
        where: { id: cityId },
        select: {
          provinceId: true,
          geoCityId: true,
          fleetCompany: { select: { region: { select: { id: true, continentId: true } } } },
        },
      });
      if (fleetCity) {
        cityId = fleetCity.geoCityId ?? cityId;
        regionalId = regionalId ?? fleetCity.provinceId;
        countryId = countryId ?? fleetCity.fleetCompany.region.id;
        continentId = continentId ?? fleetCity.fleetCompany.region.continentId;
      }
    }
  } else if (regionalId) {
    const province = await prisma.province.findUnique({
      where: { id: regionalId },
      select: { country: { select: { id: true, continentId: true } } },
    });
    if (province) {
      countryId = countryId ?? province.country.id;
      continentId = continentId ?? province.country.continentId;
    }
  } else if (countryId) {
    const country = await prisma.region.findUnique({
      where: { id: countryId },
      select: { continentId: true },
    });
    continentId = continentId ?? country?.continentId ?? null;
  }

  return { continentId, countryId, regionalId, cityId };
}

export async function scopeAllows(
  assignment: AdminAssignmentRecord,
  requested: ScopeParams,
): Promise<boolean> {
  if (isSuperAdminRole(assignment.role) || UNRESTRICTED_SCOPES.includes(assignment.scopeType)) {
    return true;
  }

  const geo = await resolveGeo(requested);
  const hasAny =
    Boolean(geo.continentId || geo.countryId || geo.regionalId || geo.cityId);

  if (!hasAny) return true;

  switch (assignment.scopeType) {
    case 'CONTINENT':
      return !geo.continentId || geo.continentId === assignment.continentId;
    case 'COUNTRY':
      return !geo.countryId || geo.countryId === assignment.countryId;
    case 'REGIONAL':
      if (geo.regionalId) return geo.regionalId === assignment.regionalId;
      if (geo.cityId && assignment.regionalId) {
        const city = await prisma.city.findUnique({
          where: { id: geo.cityId },
          select: { provinceId: true },
        });
        return city?.provinceId === assignment.regionalId;
      }
      if (geo.countryId) return geo.countryId === assignment.countryId;
      return true;
    case 'CITY':
      if (geo.cityId) return geo.cityId === assignment.cityId;
      if (geo.countryId && assignment.countryId) return geo.countryId === assignment.countryId;
      return true;
    default:
      return false;
  }
}

export function extractScopeParams(source: {
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}): ScopeParams {
  const pick = (...keys: string[]): string | undefined => {
    for (const bag of [source.params, source.query, source.body]) {
      if (!bag) continue;
      for (const key of keys) {
        const value = bag[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
      }
    }
    return undefined;
  };
  return {
    continentId: pick('continentId'),
    countryId: pick('countryId'),
    regionalId: pick('regionalId', 'provinceId'),
    cityId: pick('cityId', 'fleetRegionId'),
  };
}

export function scopedUserWhere(assignment: AdminAssignmentRecord | null): Prisma.UserWhereInput {
  if (!assignment || isSuperAdminRole(assignment.role) || UNRESTRICTED_SCOPES.includes(assignment.scopeType)) {
    return {};
  }
  if (assignment.scopeType === 'CONTINENT' && assignment.continentId) {
    return { region: { continentId: assignment.continentId } };
  }
  if (assignment.scopeType === 'COUNTRY' && assignment.countryId) {
    return { regionId: assignment.countryId };
  }
  if (assignment.scopeType === 'REGIONAL' && assignment.regionalId) {
    return {
      OR: [
        { driverProfile: { fleetRegion: { provinceId: assignment.regionalId } } },
        {
          fleetMemberships: {
            some: {
              status: FleetMemberStatus.active,
              fleetRegion: { provinceId: assignment.regionalId },
            },
          },
        },
        ...(assignment.countryId ? [{ regionId: assignment.countryId, driverProfile: null }] : []),
      ],
    };
  }
  if (assignment.scopeType === 'CITY' && assignment.cityId) {
    return {
      OR: [
        { adminAssignment: { is: { cityId: assignment.cityId } } },
        { adminAssignment: { is: { invitedById: assignment.id } } },
        { ownedFleets: { some: { fleetRegions: { some: { geoCityId: assignment.cityId } } } } },
        { driverProfile: { fleetRegion: { geoCityId: assignment.cityId } } },
        {
          fleetMemberships: {
            some: { status: FleetMemberStatus.active, fleetRegion: { geoCityId: assignment.cityId } },
          },
        },
      ],
    };
  }
  return { id: '__none__' };
}

/**
 * Geo/country/city admins must not see Super Admin, platform-wide staff,
 * or anyone above them on the ladder — even if those users share a home country.
 */
export function scopedVisibleUserWhere(
  assignment: AdminAssignmentRecord | null,
  options?: { excludeUserId?: string; staffOnly?: boolean },
): Prisma.UserWhereInput {
  const geo = scopedUserWhere(assignment);
  if (!assignment || isSuperAdminRole(assignment.role) || UNRESTRICTED_SCOPES.includes(assignment.scopeType)) {
    return geo;
  }

  const below = rolesInvitableFrom(assignment.role);
  if (options?.staffOnly && below.length === 0) {
    return { id: '__none__' };
  }

  const above = rolesAbove(assignment.role);
  const hidePrivileged: Prisma.UserWhereInput = {
    platformRoles: { none: { role: PlatformRole.SUPER_ADMIN } },
    NOT: {
      adminAssignment: {
        is: {
          OR: [
            ...(above.length ? [{ role: { in: above } }] : []),
            { scopeType: { in: ['PLATFORM', 'GLOBAL'] } },
          ],
        },
      },
    },
  };

  return {
    AND: [
      geo,
      hidePrivileged,
      ...(options?.excludeUserId ? [{ id: { not: options.excludeUserId } }] : []),
      ...(options?.staffOnly ? [{ adminAssignment: { is: { role: { in: below } } } }] : []),
    ],
  };
}

export function scopedFleetCompanyWhere(assignment: AdminAssignmentRecord | null): Prisma.FleetCompanyWhereInput {
  if (!assignment || isSuperAdminRole(assignment.role) || UNRESTRICTED_SCOPES.includes(assignment.scopeType)) {
    return {};
  }
  if (assignment.scopeType === 'CONTINENT' && assignment.continentId) {
    return { region: { continentId: assignment.continentId } };
  }
  if (assignment.scopeType === 'COUNTRY' && assignment.countryId) {
    return { regionId: assignment.countryId };
  }
  if (assignment.scopeType === 'REGIONAL' && assignment.regionalId) {
    return {
      OR: [
        { fleetRegions: { some: { provinceId: assignment.regionalId } } },
        { owner: { adminAssignment: { is: { regionalId: assignment.regionalId } } } },
        { owner: { adminAssignment: { is: { invitedById: assignment.id } } } },
      ],
    };
  }
  if (assignment.scopeType === 'CITY' && assignment.cityId) {
    return {
      OR: [
        { fleetRegions: { some: { geoCityId: assignment.cityId } } },
        { owner: { adminAssignment: { is: { cityId: assignment.cityId } } } },
        { owner: { adminAssignment: { is: { invitedById: assignment.id } } } },
      ],
    };
  }
  return { id: '__none__' };
}

export async function assertTargetUserInScope(
  assignment: AdminAssignmentRecord | null,
  targetUserId: string,
): Promise<void> {
  if (!assignment || isSuperAdminRole(assignment.role) || UNRESTRICTED_SCOPES.includes(assignment.scopeType)) {
    return;
  }
  if (targetUserId === assignment.userId) {
    return;
  }
  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      regionId: true,
      region: { select: { continentId: true } },
      platformRoles: { select: { role: true } },
      adminAssignment: { select: { role: true, scopeType: true } },
      driverProfile: { select: { fleetRegionId: true, fleetRegion: { select: { provinceId: true } } } },
    },
  });
  if (!user) throw new NotFoundError('User not found');

  if (user.platformRoles.some((r) => r.role === PlatformRole.SUPER_ADMIN) || user.adminAssignment?.role === 'SUPER_ADMIN') {
    throw new ForbiddenError('Forbidden: outside your assigned scope');
  }
  if (user.adminAssignment && (user.adminAssignment.scopeType === 'PLATFORM' || user.adminAssignment.scopeType === 'GLOBAL')) {
    throw new ForbiddenError('Forbidden: outside your assigned scope');
  }
  const above = rolesAbove(assignment.role);
  if (user.adminAssignment && above.includes(user.adminAssignment.role)) {
    throw new ForbiddenError('Forbidden: outside your assigned scope');
  }

  const allowed = await scopeAllows(assignment, {
    continentId: user.region?.continentId,
    countryId: user.regionId,
    regionalId: user.driverProfile?.fleetRegion?.provinceId,
    cityId: user.driverProfile?.fleetRegionId,
  });
  if (!allowed) {
    throw new ForbiddenError('Forbidden: outside your assigned scope');
  }
}

function idsForScope(
  scopeType: ScopeType,
  data: {
    continentId?: string | null;
    countryId?: string | null;
    regionalId?: string | null;
    cityId?: string | null;
  },
) {
  return {
    continentId: scopeType === 'CONTINENT' || scopeType === 'COUNTRY' || scopeType === 'REGIONAL' || scopeType === 'CITY'
      ? data.continentId ?? null
      : null,
    countryId: scopeType === 'COUNTRY' || scopeType === 'REGIONAL' || scopeType === 'CITY' ? data.countryId ?? null : null,
    regionalId:
      scopeType === 'REGIONAL' || scopeType === 'CITY' || (scopeType === 'COUNTRY' && Boolean(data.regionalId))
        ? data.regionalId ?? null
        : null,
    cityId:
      scopeType === 'CITY' || ((scopeType === 'COUNTRY' || scopeType === 'REGIONAL') && Boolean(data.cityId))
        ? data.cityId ?? null
        : null,
  };
}

export async function upsertAdminAssignment(data: {
  userId: string;
  role: AdminRole;
  continentId?: string | null;
  countryId?: string | null;
  regionalId?: string | null;
  cityId?: string | null;
  invitedByUserId?: string | null;
}): Promise<AdminAssignmentRecord> {
  const scopeType = scopeTypeForRole(data.role);
  let continentId = data.continentId ?? null;
  let countryId = data.countryId ?? null;
  let regionalId = data.regionalId ?? null;
  let cityId = data.cityId ?? null;

  if (countryId || regionalId || cityId) {
    const geo = await resolveGeo({ continentId, countryId, regionalId, cityId });
    continentId = continentId ?? geo.continentId;
    countryId = countryId ?? geo.countryId;
    regionalId = regionalId ?? geo.regionalId;
  }

  let invitedById: string | null = null;
  if (data.invitedByUserId) {
    const inviter = await prisma.adminAssignment.findUnique({
      where: { userId: data.invitedByUserId },
      select: { id: true },
    });
    invitedById = inviter?.id ?? null;
  }

  const ids = idsForScope(scopeType, { continentId, countryId, regionalId, cityId });

  return prisma.adminAssignment.upsert({
    where: { userId: data.userId },
    create: {
      userId: data.userId,
      role: data.role,
      scopeType,
      ...ids,
      invitedById,
    },
    update: {
      role: data.role,
      scopeType,
      ...ids,
      ...(data.invitedByUserId !== undefined ? { invitedById } : {}),
    },
    select: ASSIGNMENT_SELECT,
  });
}

export async function assertCanInvite(
  inviter: AdminAssignmentRecord,
  targetRole: AdminRole,
  payload: ScopeParams = {},
  options?: { skipInviteCheck?: boolean },
): Promise<ScopeParams> {
  if (
    !options?.skipInviteCheck &&
    !canInvite(inviter.role, targetRole) &&
    !isSuperAdminRole(inviter.role)
  ) {
    throw new ForbiddenError(`You cannot create ${targetRole} users`);
  }

  const targetScope = scopeTypeForRole(targetRole);

  if (targetScope === 'PLATFORM' || targetScope === 'GLOBAL') {
    return { continentId: null, countryId: null, regionalId: null, cityId: null };
  }

  if (targetRole === 'CONTINENT_ADMIN') {
    const continentId = payload.continentId;
    if (!continentId) throw new ValidationError('Continent is required');
    return { continentId, countryId: null, regionalId: null, cityId: null };
  }

  if (targetRole === 'COUNTRY_ADMIN') {
    const countryId = payload.countryId;
    if (!countryId) throw new ValidationError('Country is required');
    const country = await prisma.region.findUnique({
      where: { id: countryId },
      select: { continentId: true },
    });
    if (!country) throw new NotFoundError('Country not found');
    if (inviter.continentId && country.continentId !== inviter.continentId) {
      throw new ForbiddenError('Country is outside your assigned continent');
    }
    return { continentId: country.continentId, countryId, regionalId: null, cityId: null };
  }

  if (targetRole === 'REGIONAL_ADMIN') {
    const regionalId = payload.regionalId;
    if (!regionalId) throw new ValidationError('Province / region is required');
    const province = await prisma.province.findUnique({
      where: { id: regionalId },
      select: { countryId: true, country: { select: { continentId: true } } },
    });
    if (!province) throw new NotFoundError('Province not found');
    if (inviter.countryId && province.countryId !== inviter.countryId) {
      throw new ForbiddenError('Province is outside your assigned country');
    }
    return {
      continentId: province.country.continentId,
      countryId: province.countryId,
      regionalId,
      cityId: null,
    };
  }

  if (targetRole === 'CITY_ADMIN') {
    if (!payload.cityId) throw new ValidationError('City is required');
    const geo = await resolveGeo({ cityId: payload.cityId });
    if (inviter.regionalId && geo.regionalId && geo.regionalId !== inviter.regionalId) {
      throw new ForbiddenError('City is outside your assigned region');
    }
    if (inviter.countryId && geo.countryId !== inviter.countryId) {
      throw new ForbiddenError('City is outside your assigned country');
    }
    return geo;
  }

  if (targetRole === 'FLEET_OWNER') {
    const countryId = payload.countryId ?? inviter.countryId;
    if (!countryId) throw new ValidationError('Country is required for Fleet Owner');
    const country = await prisma.region.findUnique({
      where: { id: countryId },
      select: { continentId: true },
    });
    return {
      continentId: country?.continentId ?? inviter.continentId,
      countryId,
      regionalId: payload.regionalId ?? inviter.regionalId,
      cityId: payload.cityId ?? inviter.cityId,
    };
  }

  if (targetRole === 'REGIONAL_FLEET') {
    if (!payload.cityId) throw new ValidationError('City is required for Regional Fleet');
    const geo = await resolveGeo({ cityId: payload.cityId });
    if (inviter.countryId && geo.countryId !== inviter.countryId) {
      throw new ForbiddenError('City is outside your assigned country');
    }
    return geo;
  }

  if (targetRole === 'FLEET_SUPPORT' || targetRole === 'FLEET_FINANCE') {
    const cityId = inviter.cityId ?? payload.cityId;
    if (!cityId) throw new ValidationError(`${targetRole} must inherit the inviter city`);
    return resolveGeo({ cityId, countryId: inviter.countryId, continentId: inviter.continentId, regionalId: inviter.regionalId });
  }

  return {
    continentId: payload.continentId ?? inviter.continentId,
    countryId: payload.countryId ?? inviter.countryId,
    regionalId: payload.regionalId ?? inviter.regionalId,
    cityId: payload.cityId ?? inviter.cityId,
  };
}

export async function listInvitees(parentUserId: string, role: AdminRole) {
  const parent = await prisma.adminAssignment.findUnique({
    where: { userId: parentUserId },
    select: {
      ...ASSIGNMENT_SELECT,
    },
  });
  if (!parent) throw new NotFoundError('Admin assignment not found');

  const invitees = await prisma.adminAssignment.findMany({
    where: { invitedById: parent.id, role },
    include: {
      user: { include: { profile: true } },
      city: { select: { id: true, name: true } },
      country: { select: { id: true, code: true, name: true } },
      continent: { select: { id: true, code: true, name: true } },
      province: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return {
    parent,
    invitees: invitees.map((row) => ({
      id: row.id,
      userId: row.userId,
      role: row.role,
      scopeType: row.scopeType,
      continentId: row.continentId,
      countryId: row.countryId,
      regionalId: row.regionalId,
      cityId: row.cityId,
      continent: row.continent,
      country: row.country,
      province: row.province,
      city: row.city,
      fullName: row.user.profile?.fullName ?? null,
      email: row.user.email,
      phone: row.user.phone,
      createdAt: row.createdAt,
    })),
  };
}

export async function backfillAdminAssignments(): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    include: {
      platformRoles: true,
      region: { select: { continentId: true } },
      ownedFleets: { select: { regionId: true, region: { select: { continentId: true } } }, take: 1 },
      fleetMemberships: {
        where: { status: FleetMemberStatus.active },
        include: {
          fleetCompany: {
            select: {
              regionId: true,
              region: { select: { continentId: true } },
              fleetRegions: { select: { id: true, provinceId: true }, take: 1 },
            },
          },
          fleetRegion: { select: { id: true, provinceId: true } },
        },
      },
      adminAssignment: true,
    },
  });

  const ranked = users
    .map((user) => {
      const inferred = inferAssignment(user);
      return inferred ? { user, inferred } : null;
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort(
      (a, b) => ROLE_PRIORITY.indexOf(a.inferred.role) - ROLE_PRIORITY.indexOf(b.inferred.role),
    );

  const scopedRoles: AdminRole[] = [
    'GLOBAL_ADMIN',
    'CONTINENT_ADMIN',
    'COUNTRY_ADMIN',
    'REGIONAL_ADMIN',
    'CITY_ADMIN',
    'FLEET_OWNER',
    'REGIONAL_FLEET',
    'FLEET_SUPPORT',
    'FLEET_FINANCE',
  ];

  for (const row of ranked) {
    const before = row.user.adminAssignment;
    // Geo admins are stored as SUB_ADMIN on UserPlatformRole. Never clobber their real assignment.
    if (before && scopedRoles.includes(before.role) && row.inferred.role === 'SUB_ADMIN') {
      continue;
    }
    await upsertAdminAssignment({
      userId: row.user.id,
      role: row.inferred.role,
      continentId: row.inferred.continentId,
      countryId: row.inferred.countryId,
      regionalId: row.inferred.regionalId,
      cityId: row.inferred.cityId,
      invitedByUserId: row.inferred.invitedByUserId,
    });
    if (before) updated += 1;
    else created += 1;
  }

  const assignments = await prisma.adminAssignment.findMany({
    select: { id: true, userId: true, role: true, invitedById: true },
  });
  const byUserId = new Map(assignments.map((a) => [a.userId, a]));

  const memberships = await prisma.fleetMembership.findMany({
    where: {
      status: FleetMemberStatus.active,
      role: { in: [FleetMemberRole.regional, FleetMemberRole.support, FleetMemberRole.manager, FleetMemberRole.dispatcher] },
      invitedByUserId: { not: null },
    },
    select: { userId: true, invitedByUserId: true },
  });
  for (const membership of memberships) {
    const child = byUserId.get(membership.userId);
    const parent = membership.invitedByUserId ? byUserId.get(membership.invitedByUserId) : null;
    if (!child || !parent || child.invitedById) continue;
    await prisma.adminAssignment.update({
      where: { id: child.id },
      data: { invitedById: parent.id },
    });
  }

  return { created, updated };
}

function inferAssignment(user: {
  id: string;
  regionId: string;
  region: { continentId: string | null };
  platformRoles: { role: PlatformRole }[];
  ownedFleets: { regionId: string; region: { continentId: string | null } }[];
  fleetMemberships: {
    role: FleetMemberRole;
    invitedByUserId: string | null;
    fleetRegionId: string | null;
    fleetRegion: { id: string; provinceId: string | null } | null;
    fleetCompany: {
      regionId: string;
      region: { continentId: string | null };
      fleetRegions: { id: string; provinceId: string | null }[];
    };
  }[];
}): {
  role: AdminRole;
  continentId: string | null;
  countryId: string | null;
  regionalId: string | null;
  cityId: string | null;
  invitedByUserId: string | null;
} | null {
  const platformRoles = user.platformRoles.map((r) => r.role);
  if (platformRoles.includes(PlatformRole.SUPER_ADMIN)) {
    return { role: 'SUPER_ADMIN', continentId: null, countryId: null, regionalId: null, cityId: null, invitedByUserId: null };
  }
  if (platformRoles.includes(PlatformRole.SUB_ADMIN) || platformRoles.includes(PlatformRole.ADMIN)) {
    return { role: 'SUB_ADMIN', continentId: null, countryId: null, regionalId: null, cityId: null, invitedByUserId: null };
  }
  if (platformRoles.includes(PlatformRole.FINANCE_OFFICER)) {
    return { role: 'FINANCE_USER', continentId: null, countryId: null, regionalId: null, cityId: null, invitedByUserId: null };
  }
  if (platformRoles.includes(PlatformRole.SUPPORT_AGENT) && !user.fleetMemberships.some((m) => m.role === 'support' || m.role === 'dispatcher')) {
    return { role: 'PLATFORM_SUPPORT', continentId: null, countryId: null, regionalId: null, cityId: null, invitedByUserId: null };
  }
  if (platformRoles.includes(PlatformRole.FLEET_OWNER) || user.ownedFleets.length) {
    const fleet = user.ownedFleets[0];
    return {
      role: 'FLEET_OWNER',
      continentId: fleet?.region.continentId ?? user.region.continentId,
      countryId: fleet?.regionId ?? user.regionId,
      regionalId: null,
      cityId: null,
      invitedByUserId: null,
    };
  }

  const regional = user.fleetMemberships.find((m) => m.role === 'regional' || m.role === 'manager');
  if (regional) {
    return {
      role: 'REGIONAL_FLEET',
      continentId: regional.fleetCompany.region.continentId,
      countryId: regional.fleetCompany.regionId,
      regionalId: regional.fleetRegion?.provinceId ?? null,
      cityId: regional.fleetRegionId ?? regional.fleetRegion?.id ?? null,
      invitedByUserId: regional.invitedByUserId,
    };
  }

  const support = user.fleetMemberships.find((m) => m.role === 'support' || m.role === 'dispatcher');
  if (support) {
    const cityId =
      support.fleetRegionId ??
      support.fleetRegion?.id ??
      support.fleetCompany.fleetRegions[0]?.id ??
      null;
    return {
      role: 'FLEET_SUPPORT',
      continentId: support.fleetCompany.region.continentId,
      countryId: support.fleetCompany.regionId,
      regionalId: support.fleetRegion?.provinceId ?? support.fleetCompany.fleetRegions[0]?.provinceId ?? null,
      cityId,
      invitedByUserId: support.invitedByUserId,
    };
  }

  const finance = user.fleetMemberships.find((m) => m.role === 'finance');
  if (finance) {
    const cityId =
      finance.fleetRegionId ??
      finance.fleetRegion?.id ??
      finance.fleetCompany.fleetRegions[0]?.id ??
      null;
    return {
      role: 'FLEET_FINANCE',
      continentId: finance.fleetCompany.region.continentId,
      countryId: finance.fleetCompany.regionId,
      regionalId: finance.fleetRegion?.provinceId ?? finance.fleetCompany.fleetRegions[0]?.provinceId ?? null,
      cityId,
      invitedByUserId: finance.invitedByUserId,
    };
  }

  return null;
}

export { PERMISSION_KEYS };
