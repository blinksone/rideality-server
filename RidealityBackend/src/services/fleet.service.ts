import {
  DriverOnboardingStatus,
  DriverType,
  FleetCompanyStatus,
  FleetMemberRole,
  FleetMemberStatus,
  PlatformRole,
  RideStatus,
  UserStatus,
  VehicleOperationalStatus,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { redis, RedisKeys } from '../lib/redis';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';
import { assertActiveRegion } from './region.service';
import { ensureFleetWallet } from '../clients/finance.client';
import { resolveUserPermissionKeys } from './permission.service';
import { PERMISSION_KEYS } from '../constants/permissions';
import {
  assertFleetAccess,
  assertFleetDriverOps,
  assertFleetOwner,
  normalizeMemberRole,
  notStaffDriverUserFilter,
} from './fleet-access';

export { assertFleetAccess, assertFleetDriverOps, assertFleetOwner, normalizeMemberRole } from './fleet-access';
export type { FleetAccessContext, FleetAccessTier } from './fleet-access';

/** Normalize optional tax id (empty string → undefined). */
function normalizeTaxId(taxId?: string | null): string | null | undefined {
  if (taxId === undefined) return undefined;
  if (taxId === null) return null;
  const trimmed = taxId.trim();
  return trimmed.length ? trimmed : null;
}

/**
 * RID-15 / RID-25 — reject duplicate legal name for the same owner (case-insensitive).
 */
async function assertUniqueLegalNameForOwner(
  legalName: string,
  ownerUserId: string,
  excludeCompanyId?: string,
) {
  const existing = await prisma.fleetCompany.findFirst({
    where: {
      ownerUserId,
      legalName: { equals: legalName.trim(), mode: 'insensitive' },
      ...(excludeCompanyId ? { id: { not: excludeCompanyId } } : {}),
    },
  });
  if (existing) {
    throw new ConflictError(
      'A fleet company with this legal name already exists for this owner',
      'FLEET_LEGAL_NAME_EXISTS',
    );
  }
}

export async function createFleetCompany(
  ownerUserId: string,
  data: { legalName: string; taxId?: string; regionId: string },
) {
  await assertActiveRegion(data.regionId);
  const legalName = data.legalName.trim();
  const taxId = normalizeTaxId(data.taxId);
  await assertUniqueLegalNameForOwner(legalName, ownerUserId);

  const company = await prisma.$transaction(async (tx) => {
    const created = await tx.fleetCompany.create({
      data: {
        legalName,
        taxId: taxId ?? undefined,
        regionId: data.regionId,
        ownerUserId,
        status: FleetCompanyStatus.pending,
      },
    });

    await tx.fleetMembership.create({
      data: {
        fleetCompanyId: created.id,
        userId: ownerUserId,
        role: FleetMemberRole.owner,
      },
    });

    await tx.userPlatformRole.upsert({
      where: { userId_role: { userId: ownerUserId, role: PlatformRole.FLEET_OWNER } },
      create: { userId: ownerUserId, role: PlatformRole.FLEET_OWNER },
      update: {},
    });

    return created;
  });

  const region = await prisma.region.findUniqueOrThrow({ where: { id: data.regionId } });
  // Phase 2: fleet wallet created only via finance ownership layer.
  await ensureFleetWallet(company.id, company.regionId, region.currency);

  return company;
}

export async function listFleetCompanies(
  query: {
    page: number;
    limit: number;
    search?: string;
    status?: FleetCompanyStatus;
    regionId?: string;
  },
  requester?: { userId: string; roles: PlatformRole[] },
) {
  const isPlatformAdmin =
    requester?.roles.includes(PlatformRole.SUPER_ADMIN) ||
    requester?.roles.includes(PlatformRole.ADMIN) ||
    requester?.roles.includes(PlatformRole.SUB_ADMIN);

  const where: {
    legalName?: { contains: string; mode: 'insensitive' };
    status?: FleetCompanyStatus;
    regionId?: string;
    OR?: Array<
      | { ownerUserId: string }
      | { memberships: { some: { userId: string; status: FleetMemberStatus } } }
    >;
  } = {};

  if (query.search) {
    where.legalName = { contains: query.search, mode: 'insensitive' };
  }
  if (query.status) {
    where.status = query.status;
  }
  if (query.regionId) {
    where.regionId = query.regionId;
  }
  if (requester && !isPlatformAdmin) {
    where.OR = [
      { ownerUserId: requester.userId },
      { memberships: { some: { userId: requester.userId, status: FleetMemberStatus.active } } },
    ];
  }

  const [companies, total] = await Promise.all([
    prisma.fleetCompany.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: {
        region: { select: { id: true, code: true, name: true } },
        owner: { include: { profile: { select: { fullName: true } } } },
      },
    }),
    prisma.fleetCompany.count({ where }),
  ]);

  return { companies, total };
}

export async function adminCreateFleetCompany(
  adminUserId: string,
  data: { legalName: string; taxId?: string; regionId: string; ownerUserId: string },
) {
  const owner = await prisma.user.findUnique({ where: { id: data.ownerUserId } });
  if (!owner || owner.deletedAt) throw new NotFoundError('Owner user not found');
  // RID-24 — only ACTIVE owners may be assigned
  if (owner.status !== UserStatus.ACTIVE) {
    throw new ValidationError('Owner user must be active (banned or suspended users cannot own a fleet)');
  }

  // RID-16/23 — lock region to the owner's region
  const regionId = owner.regionId;
  if (!regionId) {
    throw new ValidationError('Fleet owner has no region assigned');
  }
  if (data.regionId !== regionId) {
    // Accept client region only if it matches owner; otherwise force owner's region
    // still validate request region was active if they sent wrong one — force correct
  }

  const company = await createFleetCompany(data.ownerUserId, {
    legalName: data.legalName,
    taxId: data.taxId,
    regionId,
  });

  await prisma.auditLog.create({
    data: {
      actorId: adminUserId,
      targetUserId: data.ownerUserId,
      action: 'fleet.created',
      details: { fleetCompanyId: company.id, ownerUserId: data.ownerUserId },
    },
  });

  return prisma.fleetCompany.findUniqueOrThrow({
    where: { id: company.id },
    include: {
      region: { select: { id: true, code: true, name: true } },
      owner: { include: { profile: { select: { fullName: true } } } },
    },
  });
}

async function assignFleetOwner(
  companyId: string,
  newOwnerUserId: string,
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
) {
  const newOwner = await tx.user.findUnique({ where: { id: newOwnerUserId } });
  if (!newOwner || newOwner.deletedAt) throw new NotFoundError('Owner user not found');
  if (newOwner.status !== 'ACTIVE') throw new ValidationError('Owner user must be active');

  const company = await tx.fleetCompany.findUnique({ where: { id: companyId } });
  if (!company) throw new NotFoundError('Fleet company not found');

  const previousOwnerId = company.ownerUserId;

  await tx.fleetCompany.update({
    where: { id: companyId },
    data: { ownerUserId: newOwnerUserId },
  });

  if (previousOwnerId && previousOwnerId !== newOwnerUserId) {
    await tx.fleetMembership.updateMany({
      where: {
        fleetCompanyId: companyId,
        userId: previousOwnerId,
        role: FleetMemberRole.owner,
      },
      data: { status: FleetMemberStatus.removed },
    });
  }

  await tx.fleetMembership.upsert({
    where: {
      fleetCompanyId_userId: { fleetCompanyId: companyId, userId: newOwnerUserId },
    },
    create: {
      fleetCompanyId: companyId,
      userId: newOwnerUserId,
      role: FleetMemberRole.owner,
      status: FleetMemberStatus.active,
    },
    update: { role: FleetMemberRole.owner, status: FleetMemberStatus.active },
  });

  await tx.userPlatformRole.upsert({
    where: { userId_role: { userId: newOwnerUserId, role: PlatformRole.FLEET_OWNER } },
    create: { userId: newOwnerUserId, role: PlatformRole.FLEET_OWNER },
    update: {},
  });

  return { previousOwnerId };
}

export async function adminUpdateFleetCompany(
  companyId: string,
  adminUserId: string,
  data: {
    legalName?: string;
    taxId?: string | null;
    regionId?: string;
    status?: FleetCompanyStatus;
    statusReason?: string | null;
    ownerUserId?: string;
  },
) {
  const existing = await prisma.fleetCompany.findUnique({ where: { id: companyId } });
  if (!existing) throw new NotFoundError('Fleet company not found');

  if (data.ownerUserId !== undefined) {
    const perms = await resolveUserPermissionKeys(adminUserId);
    if (!perms.includes(PERMISSION_KEYS.MANAGE_USERS)) {
      throw new ForbiddenError('Only platform admins can assign fleet ownership');
    }
  }

  const nextOwnerId = data.ownerUserId ?? existing.ownerUserId;
  const nextLegalName = data.legalName !== undefined ? data.legalName.trim() : existing.legalName;

  // RID-25 — unique legal name per owner on update
  if (
    data.legalName !== undefined ||
    (data.ownerUserId !== undefined && data.ownerUserId !== existing.ownerUserId)
  ) {
    await assertUniqueLegalNameForOwner(nextLegalName, nextOwnerId, companyId);
  }

  // When owner changes, lock region to new owner's region (RID-16/23)
  let nextRegionId = data.regionId;
  if (data.ownerUserId && data.ownerUserId !== existing.ownerUserId) {
    const newOwner = await prisma.user.findUnique({ where: { id: data.ownerUserId } });
    if (!newOwner || newOwner.deletedAt) throw new NotFoundError('Owner user not found');
    if (newOwner.status !== UserStatus.ACTIVE) {
      throw new ValidationError('Owner user must be active');
    }
    if (!newOwner.regionId) throw new ValidationError('Fleet owner has no region assigned');
    nextRegionId = newOwner.regionId;
  }

  if (nextRegionId) {
    await assertActiveRegion(nextRegionId);
  }

  const taxId = data.taxId !== undefined ? normalizeTaxId(data.taxId) : undefined;

  const nextStatus = data.status ?? existing.status;
  if (nextStatus === FleetCompanyStatus.suspended) {
    const reason = (data.statusReason ?? existing.statusReason)?.trim();
    if (!reason || reason.length < 3) {
      throw new ValidationError('A reason is required when suspending a fleet');
    }
  }

  let nextStatusReason: string | null | undefined;
  if (data.status === FleetCompanyStatus.active) {
    nextStatusReason = null;
  } else if (data.statusReason !== undefined) {
    nextStatusReason = data.statusReason?.trim() || null;
  } else if (data.status === FleetCompanyStatus.suspended || data.status === FleetCompanyStatus.pending) {
    nextStatusReason = existing.statusReason;
  }

  let previousOwnerId: string | undefined;

  const updated = await prisma.$transaction(async (tx) => {
    if (data.ownerUserId && data.ownerUserId !== existing.ownerUserId) {
      const result = await assignFleetOwner(companyId, data.ownerUserId, tx);
      previousOwnerId = result.previousOwnerId;
    }

    return tx.fleetCompany.update({
      where: { id: companyId },
      data: {
        ...(data.legalName !== undefined ? { legalName: nextLegalName } : {}),
        ...(taxId !== undefined ? { taxId } : {}),
        ...(nextRegionId !== undefined ? { regionId: nextRegionId } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(nextStatusReason !== undefined ? { statusReason: nextStatusReason } : {}),
      },
      include: {
        region: { select: { id: true, code: true, name: true } },
        owner: { include: { profile: { select: { fullName: true } } } },
      },
    });
  });

  if (data.ownerUserId && data.ownerUserId !== existing.ownerUserId) {
    await prisma.auditLog.create({
      data: {
        actorId: adminUserId,
        targetUserId: data.ownerUserId,
        action: 'fleet.owner.assigned',
        details: { fleetCompanyId: companyId, previousOwnerId },
      },
    });
  }

  if (data.status !== undefined && data.status !== existing.status) {
    await prisma.auditLog.create({
      data: {
        actorId: adminUserId,
        targetUserId: existing.ownerUserId,
        action: 'fleet.status.update',
        details: {
          fleetCompanyId: companyId,
          previousStatus: existing.status,
          newStatus: data.status,
          statusReason: updated.statusReason,
        },
      },
    });

    // Kick active fleet portal sessions when company is no longer active.
    if (data.status === FleetCompanyStatus.suspended || data.status === FleetCompanyStatus.pending) {
      const memberIds = await prisma.fleetMembership.findMany({
        where: { fleetCompanyId: companyId, status: FleetMemberStatus.active },
        select: { userId: true },
      });
      const userIds = Array.from(new Set([existing.ownerUserId, ...memberIds.map((m) => m.userId)]));
      if (userIds.length) {
        await prisma.refreshToken.updateMany({
          where: { userId: { in: userIds }, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    }
  }

  return updated;
}

export async function getFleetCompany(companyId: string, requesterId: string) {
  await assertFleetAccess(companyId, requesterId);

  const company = await prisma.fleetCompany.findUnique({
    where: { id: companyId },
    include: {
      region: true,
      owner: { include: { profile: true } },
      memberships: {
        where: { status: FleetMemberStatus.active },
        include: { user: { include: { profile: true, driverProfile: true } } },
      },
    },
  });

  if (!company) throw new NotFoundError('Fleet company not found');
  return company;
}

export async function updateFleetCompany(
  companyId: string,
  requesterId: string,
  data: { legalName?: string; taxId?: string | null },
) {
  await assertFleetOwner(companyId, requesterId);

  const existing = await prisma.fleetCompany.findUnique({ where: { id: companyId } });
  if (!existing) throw new NotFoundError('Fleet company not found');

  // Fleet owners can update tax ID only; legal name is set by platform admin.
  if (data.legalName !== undefined && data.legalName.trim() !== existing.legalName) {
    throw new ForbiddenError('Legal name can only be changed by platform admin');
  }

  return prisma.fleetCompany.update({
    where: { id: companyId },
    data: {
      ...(data.taxId !== undefined ? { taxId: normalizeTaxId(data.taxId) } : {}),
    },
  });
}

export async function searchFleetInviteCandidates(
  companyId: string,
  requesterId: string,
  search: string,
) {
  await assertFleetDriverOps(companyId, requesterId);

  const company = await prisma.fleetCompany.findUnique({ where: { id: companyId } });
  if (!company) throw new NotFoundError('Fleet company not found');

  const memberships = await prisma.fleetMembership.findMany({
    where: { fleetCompanyId: companyId, status: FleetMemberStatus.active },
    select: { userId: true },
  });
  const excludeUserIds = memberships.map((m) => m.userId);

  // RID-12 — only users with at least one platform role (invite targets with roles)
  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      status: {
        in: [
          UserStatus.ACTIVE,
          UserStatus.PROFILE_INCOMPLETE,
          UserStatus.PHONE_VERIFIED,
          UserStatus.REGISTERED,
        ],
      },
      platformRoles: { some: {} },
      ...(excludeUserIds.length ? { id: { notIn: excludeUserIds } } : {}),
      regionId: company.regionId,
      OR: [
        { phone: { contains: search.trim() } },
        { email: { contains: search.trim(), mode: 'insensitive' } },
        { profile: { fullName: { contains: search.trim(), mode: 'insensitive' } } },
      ],
    },
    take: 20,
    orderBy: { createdAt: 'desc' },
    include: {
      profile: { select: { fullName: true } },
      platformRoles: { select: { role: true } },
      driverProfile: { select: { onboardingStatus: true } },
    },
  });

  return users
    .filter((user) => user.platformRoles.length > 0)
    .map((user) => ({
      id: user.id,
      phone: user.phone,
      email: user.email,
      fullName: user.profile?.fullName ?? null,
      status: user.status,
      roles: user.platformRoles.map((r) => r.role),
      driverOnboardingStatus: user.driverProfile?.onboardingStatus ?? null,
    }));
}

export async function createFleetInvite(
  companyId: string,
  requesterId: string,
  data: { phone?: string; email?: string; userId?: string },
) {
  const access = await assertFleetDriverOps(companyId, requesterId);

  let phone = data.phone;
  let email = data.email;
  let invitedUserId: string | undefined;

  if (data.userId) {
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      include: { profile: true, platformRoles: true },
    });
    if (!user || user.deletedAt) throw new NotFoundError('User not found');

    // RID-12 — users without platform roles cannot be invited
    if (!user.platformRoles.length) {
      throw new ValidationError(
        'User has no assigned role and cannot be invited to a fleet',
        { code: 'USER_NO_ROLE' },
      );
    }

    const existingMember = await prisma.fleetMembership.findFirst({
      where: {
        fleetCompanyId: companyId,
        userId: data.userId,
        status: FleetMemberStatus.active,
      },
    });
    if (existingMember) {
      throw new ValidationError('User is already a member of this fleet');
    }

    phone = user.phone;
    email = user.email ?? undefined;
    invitedUserId = user.id;
  }

  if (!phone && !email) {
    throw new ValidationError('Phone or email is required for invite');
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const invite = await prisma.fleetInvite.create({
    data: {
      fleetCompanyId: companyId,
      phone,
      email,
      invitedUserId,
      fleetRegionId: access.fleetRegionId,
      expiresAt,
    },
    include: { fleetCompany: { select: { legalName: true } } },
  });

  if (invitedUserId) {
    await prisma.fleetNotification.create({
      data: {
        fleetCompanyId: companyId,
        userId: invitedUserId,
        type: 'invite_pending',
        title: 'Fleet invitation',
        body: `You have been invited to join ${invite.fleetCompany.legalName} as a driver.`,
        metadata: {
          inviteId: invite.id,
          token: invite.token,
          kind: 'driver_invite',
        },
      },
    });
  }

  return {
    inviteId: invite.id,
    token: invite.token,
    expiresAt: invite.expiresAt,
  };
}

export async function listMyFleetInvites(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { phone: true, email: true },
  });
  if (!user) throw new NotFoundError('User not found');

  const now = new Date();
  const rows = await prisma.fleetInvite.findMany({
    where: {
      acceptedAt: null,
      rejectedAt: null,
      expiresAt: { gt: now },
      OR: [
        { invitedUserId: userId },
        ...(user.email ? [{ email: { equals: user.email, mode: 'insensitive' as const } }] : []),
        { phone: user.phone },
      ],
    },
    orderBy: { createdAt: 'desc' },
    include: {
      fleetCompany: {
        select: { id: true, legalName: true, status: true, regionId: true },
      },
    },
  });

  return rows.map((inv) => ({
    id: inv.id,
    token: inv.token,
    phone: inv.phone,
    email: inv.email,
    memberRole: inv.memberRole,
    kind: inv.memberRole ? 'team' : 'driver',
    expiresAt: inv.expiresAt,
    createdAt: inv.createdAt,
    status: 'pending' as const,
    fleetCompany: inv.fleetCompany,
  }));
}

function assertInviteBelongsToUser(
  invite: { invitedUserId: string | null; phone: string | null; email: string | null },
  user: { id: string; phone: string; email: string | null },
) {
  const byId = invite.invitedUserId === user.id;
  const byPhone = Boolean(invite.phone && invite.phone === user.phone);
  const byEmail = Boolean(
    invite.email && user.email && invite.email.toLowerCase() === user.email.toLowerCase(),
  );
  if (!byId && !byPhone && !byEmail) {
    throw new ForbiddenError('This invitation is not for your account');
  }
}

export async function acceptFleetInvite(token: string, userId: string) {
  const invite = await prisma.fleetInvite.findUnique({
    where: { token },
    include: { fleetCompany: true },
  });

  if (!invite) throw new NotFoundError('Invite not found');
  if (invite.acceptedAt) throw new ValidationError('Invite already accepted');
  if (invite.rejectedAt) throw new ValidationError('Invite was rejected');
  if (invite.expiresAt < new Date()) throw new ValidationError('Invite expired');

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) throw new NotFoundError('User not found');
  assertInviteBelongsToUser(invite, user);

  await prisma.$transaction(async (tx) => {
    await tx.fleetInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date(), invitedUserId: userId, rejectedAt: null },
    });

    if (!invite.memberRole) {
      // Driver invite — attach as fleet driver (not portal team staff)
      await tx.driverProfile.upsert({
        where: { userId },
        create: {
          userId,
          driverType: DriverType.fleet_assigned,
          fleetCompanyId: invite.fleetCompanyId,
          fleetRegionId: invite.fleetRegionId,
          onboardingStatus: DriverOnboardingStatus.pending_review,
        },
        update: {
          driverType: DriverType.fleet_assigned,
          fleetCompanyId: invite.fleetCompanyId,
          fleetRegionId: invite.fleetRegionId,
        },
      });

      await tx.userPlatformRole.upsert({
        where: { userId_role: { userId, role: PlatformRole.DRIVER } },
        create: { userId, role: PlatformRole.DRIVER },
        update: {},
      });
    } else {
      await tx.fleetMembership.upsert({
        where: {
          fleetCompanyId_userId: { fleetCompanyId: invite.fleetCompanyId, userId },
        },
        create: {
          fleetCompanyId: invite.fleetCompanyId,
          userId,
          role: invite.memberRole,
          fleetRegionId: invite.fleetRegionId,
        },
        update: {
          status: FleetMemberStatus.active,
          role: invite.memberRole,
          fleetRegionId: invite.fleetRegionId,
        },
      });

      const tier = normalizeMemberRole(invite.memberRole);
      if (tier === 'regional') {
        await tx.userPlatformRole.upsert({
          where: { userId_role: { userId, role: PlatformRole.FLEET_MANAGER } },
          create: { userId, role: PlatformRole.FLEET_MANAGER },
          update: {},
        });
      }
    }
  });

  return {
    fleetCompanyId: invite.fleetCompanyId,
    fleetName: invite.fleetCompany.legalName,
    kind: invite.memberRole ? 'team' : 'driver',
    accepted: true,
  };
}

export async function rejectFleetInvite(token: string, userId: string) {
  const invite = await prisma.fleetInvite.findUnique({ where: { token } });
  if (!invite) throw new NotFoundError('Invite not found');
  if (invite.acceptedAt) throw new ValidationError('Invite already accepted');
  if (invite.rejectedAt) throw new ValidationError('Invite already rejected');
  if (invite.expiresAt < new Date()) throw new ValidationError('Invite expired');

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) throw new NotFoundError('User not found');
  assertInviteBelongsToUser(invite, user);

  await prisma.fleetInvite.update({
    where: { id: invite.id },
    data: { rejectedAt: new Date(), invitedUserId: userId },
  });

  return { rejected: true, inviteId: invite.id };
}

export async function listFleetDrivers(
  companyId: string,
  requesterId: string,
  query?: { fleetRegionId?: string },
) {
  const access = await assertFleetDriverOps(companyId, requesterId, {
    fleetRegionId: query?.fleetRegionId,
  });

  const drivers = await prisma.driverProfile.findMany({
    where: {
      fleetCompanyId: companyId,
      ...(access.fleetRegionId ? { fleetRegionId: access.fleetRegionId } : {}),
      user: notStaffDriverUserFilter(companyId),
    },
    include: {
      user: { include: { profile: true } },
      vehicle: true,
      fleetRegion: { select: { id: true, name: true } },
    },
  });

  return drivers.map((d) => ({
    userId: d.userId,
    fullName: d.user.profile?.fullName,
    phone: d.user.phone,
    email: d.user.email,
    onboardingStatus: d.onboardingStatus,
    isOnline: d.isOnline,
    fleetRegionId: d.fleetRegionId,
    fleetRegionName: d.fleetRegion?.name ?? null,
    vehicle: d.vehicle,
  }));
}

export async function getFleetDriverDetail(
  companyId: string,
  requesterId: string,
  driverUserId: string,
) {
  const access = await assertFleetAccess(companyId, requesterId);

  const driver = await prisma.driverProfile.findFirst({
    where: {
      userId: driverUserId,
      fleetCompanyId: companyId,
      user: notStaffDriverUserFilter(companyId),
      ...(access.fleetRegionId ? { fleetRegionId: access.fleetRegionId } : {}),
    },
    include: {
      user: { include: { profile: true, wallet: true } },
      vehicle: true,
      fleetRegion: { select: { id: true, name: true } },
    },
  });

  if (!driver) throw new NotFoundError('Driver not found in fleet');

  const allDocs = await prisma.verificationDocument.findMany({
    where: { userId: driverUserId },
    orderBy: [{ submittedAt: 'desc' }],
  });
  const latestDocsByType = new Map<string, (typeof allDocs)[number]>();
  for (const doc of allDocs) {
    if (!latestDocsByType.has(doc.type)) latestDocsByType.set(doc.type, doc);
  }
  const documents = Array.from(latestDocsByType.values()).map((doc) => ({
    id: doc.id,
    type: doc.type,
    status: doc.status,
    fileUrl: doc.fileUrl,
    rejectionReason: doc.rejectionReason,
    submittedAt: doc.submittedAt,
    reviewedAt: doc.reviewedAt,
    expiresAt: doc.expiresAt,
  }));

  const walletId = driver.user.wallet?.id;
  const [trips, tripCount, complaints, walletTransactions] = await Promise.all([
    prisma.ride.findMany({
      where: { fleetCompanyId: companyId, driverUserId },
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: { vehicle: true },
    }),
    prisma.ride.count({ where: { fleetCompanyId: companyId, driverUserId } }),
    prisma.abuseReport.findMany({
      where: { reportedId: driverUserId },
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: { reporter: { include: { profile: true } } },
    }),
    walletId
      ? prisma.walletTransaction.findMany({
          where: { walletId },
          orderBy: { createdAt: 'desc' },
          take: 25,
        })
      : Promise.resolve([]),
  ]);

  const vehicles = driver.vehicle
    ? [
        {
          id: driver.vehicle.id,
          vehicleType: driver.vehicle.vehicleType,
          model: driver.vehicle.model,
          numberPlate: driver.vehicle.numberPlate,
          color: driver.vehicle.color,
          year: driver.vehicle.year,
          availableSeats: driver.vehicle.availableSeats,
          operationalStatus: driver.vehicle.operationalStatus,
          isVerified: driver.vehicle.isVerified,
        },
      ]
    : [];

  return {
    userId: driver.userId,
    fullName: driver.user.profile?.fullName ?? null,
    phone: driver.user.phone,
    email: driver.user.email,
    photoUrl: driver.user.profile?.photoUrl ?? null,
    onboardingStatus: driver.onboardingStatus,
    driverType: driver.driverType,
    isOnline: driver.isOnline,
    serviceModes: driver.serviceModes,
    totalRides: driver.totalRides,
    totalDistanceKm: Number(driver.totalDistanceKm),
    activeHours: Number(driver.activeHours),
    licenseNumber: driver.licenseNumber,
    licenseExpiry: driver.licenseExpiry,
    fleetRegionId: driver.fleetRegionId,
    fleetRegionName: driver.fleetRegion?.name ?? null,
    joinedAt: driver.createdAt,
    wallet: driver.user.wallet
      ? {
          id: driver.user.wallet.id,
          balance: Number(driver.user.wallet.balance),
          currency: driver.user.wallet.currency,
          status: driver.user.wallet.status,
        }
      : null,
    walletTransactions: walletTransactions.map((tx) => ({
      id: tx.id,
      type: tx.type,
      amount: Number(tx.amount),
      currency: tx.currency,
      description: tx.description,
      balanceAfter: Number(tx.balanceAfter),
      createdAt: tx.createdAt,
    })),
    vehicles,
    documents,
    trips: trips.map((t) => ({
      id: t.id,
      status: t.status,
      passengerName: t.passengerName,
      pickupAddress: t.pickupAddress,
      dropoffAddress: t.dropoffAddress,
      fare: Number(t.fare),
      distanceKm: Number(t.distanceKm),
      currency: t.currency,
      vehiclePlate: t.vehicle?.numberPlate ?? null,
      createdAt: t.createdAt,
      completedAt: t.completedAt,
    })),
    tripCount,
    complaints: complaints.map((c) => ({
      id: c.id,
      reason: c.reason,
      description: c.description,
      status: c.status,
      rideId: c.rideId,
      reporterName: c.reporter.profile?.fullName ?? c.reporter.phone,
      createdAt: c.createdAt,
    })),
  };
}

export async function updateFleetDriver(
  companyId: string,
  requesterId: string,
  driverUserId: string,
  data: { onboardingStatus?: DriverOnboardingStatus },
) {
  const access = await assertFleetDriverOps(companyId, requesterId);
  const driver = await prisma.driverProfile.findFirst({
    where: {
      userId: driverUserId,
      fleetCompanyId: companyId,
      ...(access.fleetRegionId ? { fleetRegionId: access.fleetRegionId } : {}),
    },
  });

  if (!driver) throw new NotFoundError('Driver not found in fleet');

  return prisma.driverProfile.update({
    where: { id: driver.id },
    data,
  });
}

export async function removeFleetDriver(
  companyId: string,
  requesterId: string,
  driverUserId: string,
) {
  const access = await assertFleetDriverOps(companyId, requesterId);

  const driver = await prisma.driverProfile.findFirst({
    where: {
      userId: driverUserId,
      fleetCompanyId: companyId,
      ...(access.fleetRegionId ? { fleetRegionId: access.fleetRegionId } : {}),
    },
  });
  if (!driver) throw new NotFoundError('Driver not found in fleet');

  await prisma.$transaction([
    prisma.driverProfile.updateMany({
      where: { userId: driverUserId, fleetCompanyId: companyId },
      data: { fleetCompanyId: null, driverType: DriverType.independent },
    }),
    prisma.fleetMembership.updateMany({
      where: { fleetCompanyId: companyId, userId: driverUserId },
      data: { status: FleetMemberStatus.removed },
    }),
  ]);

  return { removed: true };
}

export async function listFleetInvites(companyId: string, requesterId: string) {
  const access = await assertFleetDriverOps(companyId, requesterId);

  const rows = await prisma.fleetInvite.findMany({
    where: {
      fleetCompanyId: companyId,
      ...(access.fleetRegionId ? { fleetRegionId: access.fleetRegionId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      invitedUser: { include: { profile: true } },
    },
  });

  const now = new Date();
  return rows.map((inv) => ({
    id: inv.id,
    phone: inv.phone,
    email: inv.email,
    invitedUserId: inv.invitedUserId,
    invitedUserName: inv.invitedUser?.profile?.fullName ?? null,
    memberRole: inv.memberRole,
    fleetRegionId: inv.fleetRegionId,
    expiresAt: inv.expiresAt,
    acceptedAt: inv.acceptedAt,
    createdAt: inv.createdAt,
    status: inv.acceptedAt
      ? 'accepted'
      : inv.rejectedAt
        ? 'rejected'
        : inv.expiresAt < now
          ? 'expired'
          : 'pending',
  }));
}

export async function listFleetTeamMembers(companyId: string, requesterId: string) {
  const access = await assertFleetAccess(companyId, requesterId);

  const members = await prisma.fleetMembership.findMany({
    where: {
      fleetCompanyId: companyId,
      status: FleetMemberStatus.active,
      ...(access.fleetRegionId
        ? {
            OR: [
              { fleetRegionId: access.fleetRegionId },
              { role: FleetMemberRole.owner },
            ],
          }
        : {}),
    },
    include: {
      user: { include: { profile: true } },
      fleetRegion: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return members.map((m) => ({
    id: m.id,
    userId: m.userId,
    role: normalizeMemberRole(m.role),
    rawRole: m.role,
    fleetRegionId: m.fleetRegionId,
    fleetRegionName: m.fleetRegion?.name ?? null,
    fullName: m.user.profile?.fullName ?? null,
    email: m.user.email,
    phone: m.user.phone,
    joinedAt: m.createdAt,
  }));
}

export async function getFleetDashboard(
  companyId: string,
  requesterId: string,
  roles: PlatformRole[],
) {
  const access = await assertFleetAccess(companyId, requesterId);

  const { syncFleetVehiclesFromDrivers, ensureFleetDemoRides, ensureFleetNotifications } =
    await import('./fleet-portal.service');
  await syncFleetVehiclesFromDrivers(companyId);
  await ensureFleetDemoRides(companyId);
  await ensureFleetNotifications(companyId, requesterId);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const driverWhere = {
    fleetCompanyId: companyId,
    ...(access.fleetRegionId ? { fleetRegionId: access.fleetRegionId } : {}),
    user: notStaffDriverUserFilter(companyId),
  };

  const drivers = await prisma.driverProfile.findMany({
    where: driverWhere,
    include: { vehicle: true, user: { include: { profile: true } } },
  });

  const vehicles = await prisma.vehicle.findMany({
    where: { fleetCompanyId: companyId },
    select: { id: true, operationalStatus: true, driverProfileId: true },
  });

  const wallet = await prisma.wallet.findUnique({ where: { fleetCompanyId: companyId } });

  const [pendingInvites, pendingPayoutSum, pendingDrivers, recentTx, lifetimeAgg, todayRideAgg, tripsTodayCount] =
    await Promise.all([
      prisma.fleetInvite.count({
        where: {
          fleetCompanyId: companyId,
          acceptedAt: null,
          expiresAt: { gt: new Date() },
          ...(access.fleetRegionId ? { fleetRegionId: access.fleetRegionId } : {}),
        },
      }),
      wallet
        ? prisma.payoutRequest.aggregate({
            where: { walletId: wallet.id, status: 'pending' },
            _sum: { amount: true },
          })
        : Promise.resolve({ _sum: { amount: null } }),
      prisma.driverProfile.count({
        where: { ...driverWhere, onboardingStatus: DriverOnboardingStatus.pending_review },
      }),
      wallet
        ? prisma.walletTransaction.findMany({
            where: { walletId: wallet.id },
            orderBy: { createdAt: 'desc' },
            take: 12,
            include: { createdBy: { include: { profile: true } } },
          })
        : Promise.resolve([]),
      wallet
        ? prisma.walletTransaction.aggregate({
            where: {
              walletId: wallet.id,
              type: { in: ['ride_earnings', 'adjustment_credit', 'topup', 'refund'] },
            },
            _sum: { amount: true },
          })
        : Promise.resolve({ _sum: { amount: null } }),
      prisma.ride.aggregate({
        where: {
          fleetCompanyId: companyId,
          status: RideStatus.completed,
          completedAt: { gte: startOfToday, lte: endOfToday },
        },
        _sum: { fare: true },
      }),
      prisma.ride.count({
        where: {
          fleetCompanyId: companyId,
          createdAt: { gte: startOfToday, lte: endOfToday },
        },
      }),
    ]);

  const balance = wallet ? Number(wallet.balance) : 0;
  const pendingPayout = Number(pendingPayoutSum._sum.amount ?? 0);
  const currency = wallet?.currency ?? 'PKR';

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const chartBuckets = await Promise.all(
    last7Days.map(async (dayStart) => {
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);
      const agg = await prisma.ride.aggregate({
        where: {
          fleetCompanyId: companyId,
          status: RideStatus.completed,
          completedAt: { gte: dayStart, lte: dayEnd },
        },
        _sum: { fare: true },
        _count: { _all: true },
      });
      return {
        date: dayStart.toISOString().slice(0, 10),
        revenue: Number(agg._sum.fare ?? 0),
        trips: agg._count._all,
      };
    }),
  );

  return {
    currency,
    walletBalance: balance,
    availableBalance: Number((balance - pendingPayout).toFixed(2)),
    pendingEarnings: pendingPayout,
    lifetimeEarnings: Number(lifetimeAgg._sum.amount ?? 0),
    todayRevenue: Number(todayRideAgg._sum.fare ?? 0),
    activeDrivers: drivers.filter((d) => d.onboardingStatus === DriverOnboardingStatus.approved).length,
    onlineDrivers: drivers.filter((d) => d.isOnline).length,
    activeVehicles: vehicles.filter((v) => v.operationalStatus === VehicleOperationalStatus.active).length,
    assignedVehicles: vehicles.filter((v) => v.driverProfileId != null).length,
    totalVehicles: vehicles.length,
    totalDrivers: drivers.length,
    tripsToday: tripsTodayCount,
    pendingApprovals: pendingDrivers,
    pendingInvites,
    revenueChart: chartBuckets,
    recentActivities: recentTx.map((tx) => ({
      id: tx.id,
      type: tx.type,
      amount: Number(tx.amount),
      currency: tx.currency,
      description: tx.description,
      createdAt: tx.createdAt,
      actorName: tx.createdBy?.profile?.fullName ?? tx.createdBy?.email ?? null,
    })),
    onlineDriverLocations: await Promise.all(
      drivers
        .filter((d) => d.isOnline)
        .map(async (d) => {
          const raw = await redis.get(RedisKeys.driverLocation(d.userId));
          let lat: number | null = null;
          let lng: number | null = null;
          if (raw) {
            try {
              const parsed = JSON.parse(raw) as { lat?: number; lng?: number };
              if (typeof parsed.lat === 'number') lat = parsed.lat;
              if (typeof parsed.lng === 'number') lng = parsed.lng;
            } catch {
              /* ignore */
            }
          }
          return {
            userId: d.userId,
            fullName: d.user.profile?.fullName ?? d.user.phone,
            lat,
            lng,
          };
        }),
    ),
  };
}

