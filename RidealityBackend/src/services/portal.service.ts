import { PlatformRole } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { resolveUserPermissionKeys } from './permission.service';
import { formatUserResponse } from './user.service';
import { listMyFleetMemberships } from './fleet-access';
import { getAdminAssignment, invitedRolesFor } from './admin-scope.service';

export const PORTAL_PLATFORM_ROLES: PlatformRole[] = [
  PlatformRole.SUPER_ADMIN,
  PlatformRole.ADMIN,
  PlatformRole.SUB_ADMIN,
  PlatformRole.FINANCE_OFFICER,
  PlatformRole.FLEET_OWNER,
  PlatformRole.FLEET_MANAGER,
  PlatformRole.SUPPORT_AGENT,
];

export function canAccessPortal(roles: PlatformRole[]): boolean {
  return roles.some((r) => PORTAL_PLATFORM_ROLES.includes(r));
}

export async function canAccessPortalAsync(userId: string, roles: PlatformRole[]): Promise<boolean> {
  if (canAccessPortal(roles)) return true;
  const membership = await prisma.fleetMembership.findFirst({
    where: { userId, status: 'active' },
    select: { id: true },
  });
  return Boolean(membership);
}

export async function getPortalMe(userId: string) {
  const profile = await formatUserResponse(userId);
  const access = await resolveUserPermissionKeys(userId);
  const platformRoles = profile.roles as PlatformRole[];
  const [region, account, fleetMemberships, assignment] = await Promise.all([
    prisma.region.findUnique({
      where: { id: profile.regionId },
      select: { id: true, code: true, name: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { mustResetPassword: true },
    }),
    listMyFleetMemberships(userId),
    getAdminAssignment(userId),
  ]);

  return {
    ...profile,
    platformRoles,
    effectivePermissions: access,
    isSuperAdmin: platformRoles.includes(PlatformRole.SUPER_ADMIN) || assignment?.role === 'SUPER_ADMIN',
    region,
    mustResetPassword: account?.mustResetPassword ?? false,
    fleetMemberships,
    adminRole: assignment?.role ?? null,
    scopeType: assignment?.scopeType ?? null,
    continentId: assignment?.continentId ?? null,
    countryId: assignment?.countryId ?? null,
    regionalId: assignment?.regionalId ?? null,
    cityId: assignment?.cityId ?? null,
    canInvite: assignment ? invitedRolesFor(assignment.role) : [],
  };
}

export async function getDashboardStats(userId: string, roles: PlatformRole[]) {
  const isSuper = roles.includes(PlatformRole.SUPER_ADMIN);
  const isAdmin = isSuper || roles.includes(PlatformRole.ADMIN) || roles.includes(PlatformRole.SUB_ADMIN);
  const isFleet = roles.includes(PlatformRole.FLEET_OWNER) || roles.includes(PlatformRole.FLEET_MANAGER);
  const isSupport = roles.includes(PlatformRole.SUPPORT_AGENT);

  const [
    totalUsers,
    totalDrivers,
    pendingDriverApprovals,
    pendingDocuments,
    totalFleets,
    activeFleetDrivers,
  ] = await Promise.all([
    isAdmin || isSupport ? prisma.user.count({ where: { deletedAt: null } }) : Promise.resolve(0),
    isAdmin || isFleet
      ? prisma.driverProfile.count()
      : Promise.resolve(0),
    isAdmin || isFleet
      ? prisma.driverProfile.count({ where: { onboardingStatus: 'pending_review' } })
      : Promise.resolve(0),
    isAdmin
      ? prisma.verificationDocument.count({ where: { status: 'pending' } })
      : Promise.resolve(0),
    isFleet || isAdmin
      ? isAdmin
        ? prisma.fleetCompany.count()
        : Promise.resolve(0)
      : Promise.resolve(0),
    isFleet || isAdmin
      ? isAdmin
        ? prisma.driverProfile.count({
            where: { fleetCompanyId: { not: null }, onboardingStatus: 'approved' },
          })
        : Promise.resolve(0)
      : Promise.resolve(0),
  ]);

  let myFleets = 0;
  let myFleetDrivers = 0;
  let pendingInvites = 0;

  if (isFleet) {
    const fleets = await prisma.fleetCompany.findMany({
      where: isSuper ? {} : { OR: [{ ownerUserId: userId }, { memberships: { some: { userId, status: 'active' } } }] },
      include: { _count: { select: { memberships: true } } },
    });
    myFleets = fleets.length;
    myFleetDrivers = await prisma.driverProfile.count({
      where: { fleetCompanyId: { in: fleets.map((f) => f.id) } },
    });
    pendingInvites = await prisma.fleetInvite.count({
      where: {
        fleetCompanyId: { in: fleets.map((f) => f.id) },
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
  }

  return {
    totalUsers,
    totalDrivers,
    pendingDriverApprovals,
    pendingDocuments,
    totalFleets,
    activeFleetDrivers,
    myFleets,
    myFleetDrivers,
    pendingInvites,
    roleScope: {
      isSuperAdmin: isSuper,
      isAdmin,
      isFleet,
      isSupport,
    },
  };
}
