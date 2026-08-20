import {
  AbuseActionType,
  DocumentStatus,
  DriverOnboardingStatus,
  PlatformRole,
  UserStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { redis, RedisKeys } from '../lib/redis';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';
import { generateTemporaryPassword, hashPassword, maskSensitive } from '../utils/crypto';
import { isValidE164, normalizePhone } from '../utils/phone';
import { syncUserStatus } from './onboarding.service';
import { applyWalletPenalty } from '../clients/finance.client';
import { canAccessPortal } from './portal.service';
import {
  platformRoleToAdminRole,
  scopedVisibleUserWhere,
  invitedRolesFor,
  upsertAdminAssignment,
  type AdminAssignmentRecord,
} from './admin-scope.service';
import { listMyFleetMemberships } from './fleet-access';

interface ListUsersQuery {
  page: number;
  limit: number;
  status?: UserStatus;
  role?: PlatformRole;
  regionId?: string;
  search?: string;
  driverStatus?: DriverOnboardingStatus;
}

export async function listUsers(query: ListUsersQuery, assignment?: AdminAssignmentRecord | null) {
  const { page, limit, status, role, regionId, search, driverStatus } = query;
  const skip = (page - 1) * limit;

  const scopeWhere = scopedVisibleUserWhere(assignment ?? null, {
    excludeUserId: assignment?.userId,
  });
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    AND: [
      scopeWhere,
      {
        ...(status && { status }),
        ...(regionId && !scopeWhere.regionId ? { regionId } : {}),
        ...(role && { platformRoles: { some: { role } } }),
        ...(driverStatus && { driverProfile: { onboardingStatus: driverStatus } }),
        ...(search && {
          OR: [
            { phone: { contains: search } },
            { email: { contains: search, mode: 'insensitive' } },
            { profile: { fullName: { contains: search, mode: 'insensitive' } } },
          ],
        }),
      },
    ],
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        profile: true,
        platformRoles: true,
        driverProfile: true,
        passengerProfile: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users: users.map((u) => ({
      id: u.id,
      phone: u.phone,
      email: u.email,
      status: u.status,
      activeMode: u.activeMode,
      regionId: u.regionId,
      fullName: u.profile?.fullName,
      roles: u.platformRoles.map((r) => r.role),
      driverStatus: u.driverProfile?.onboardingStatus,
      loyaltyTier: u.passengerProfile?.loyaltyTier,
      createdAt: u.createdAt,
    })),
    total,
  };
}

export async function getAdminUserDetail(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      passengerProfile: true,
      driverProfile: { include: { vehicle: true, fleetCompany: true } },
      platformRoles: true,
      documents: true,
      abuseRecords: { orderBy: { createdAt: 'desc' }, take: 20 },
      wallet: true,
      region: { select: { id: true, code: true, name: true } },
      adminNotes: { orderBy: { createdAt: 'desc' }, take: 10, include: { author: { include: { profile: true } } } },
      adminAssignment: {
        include: {
          continent: { select: { id: true, code: true, name: true } },
          country: { select: { id: true, code: true, name: true } },
          province: { select: { id: true, name: true, code: true } },
          city: { select: { id: true, name: true } },
          invitedBy: {
            include: { user: { include: { profile: true } } },
          },
          invitees: {
            include: {
              user: { include: { profile: true } },
              continent: { select: { name: true } },
              country: { select: { name: true, code: true } },
              province: { select: { name: true } },
              city: { select: { name: true } },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      },
    },
  });

  if (!user) throw new NotFoundError('User not found');

  const fleetMemberships = await listMyFleetMemberships(userId);
  const assignment = user.adminAssignment;
  const adminAssignment = assignment
    ? {
        role: assignment.role,
        scopeType: assignment.scopeType,
        continent: assignment.continent,
        country: assignment.country,
        province: assignment.province,
        city: assignment.city,
        canInvite: invitedRolesFor(assignment.role),
        invitedBy: assignment.invitedBy
          ? {
              userId: assignment.invitedBy.userId,
              role: assignment.invitedBy.role,
              fullName: assignment.invitedBy.user.profile?.fullName ?? null,
              email: assignment.invitedBy.user.email,
            }
          : null,
        team: assignment.invitees.map((row) => ({
          userId: row.userId,
          role: row.role,
          fullName: row.user.profile?.fullName ?? null,
          email: row.user.email,
          phone: row.user.phone,
          scopeLabel: [row.continent?.name, row.country ? `${row.country.name} (${row.country.code})` : null, row.province?.name, row.city?.name]
            .filter(Boolean)
            .join(' / '),
          createdAt: row.createdAt,
        })),
      }
    : null;

  return {
    ...user,
    passwordHash: undefined,
    adminAssignment,
    adminRole: assignment?.role ?? null,
    scopeType: assignment?.scopeType ?? null,
    fleetMemberships,
    driverProfile: user.driverProfile
      ? {
          ...user.driverProfile,
          licenseNumber: maskSensitive(user.driverProfile.licenseNumber),
        }
      : null,
    adminNotes: user.adminNotes.map((n) => ({
      id: n.id,
      content: n.content,
      authorName: n.author.profile?.fullName ?? 'Admin',
      createdAt: n.createdAt,
    })),
  };
}

export async function updateUserStatus(
  actorId: string,
  userId: string,
  status: UserStatus,
  reason: string,
  ipAddress?: string,
) {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) throw new NotFoundError('User not found');

  const user = await prisma.user.update({
    where: { id: userId },
    data: { status },
  });

  if (status === UserStatus.SUSPENDED || status === UserStatus.BANNED) {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await prisma.driverProfile.updateMany({
      where: { userId },
      data: { isOnline: false },
    });

    await redis.del(RedisKeys.driverOnline(userId), RedisKeys.driverLocation(userId));
  }

  const abuseStatuses: UserStatus[] = [
    UserStatus.SUSPENDED,
    UserStatus.BANNED,
    UserStatus.RESTRICTED,
  ];
  if (abuseStatuses.includes(status)) {
    await prisma.abuseRecord.create({
      data: {
        userId,
        action:
          status === UserStatus.BANNED
            ? AbuseActionType.ban
            : status === UserStatus.SUSPENDED
              ? AbuseActionType.suspension
              : AbuseActionType.restriction,
        reason,
        createdBy: actorId,
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      actorId,
      targetUserId: userId,
      action: `user.status.${status.toLowerCase()}`,
      details: { reason, previousStatus: existing.status },
      ipAddress,
    },
  });

  return { id: user.id, status: user.status };
}

export async function reviewDriver(
  actorId: string,
  userId: string,
  action: 'approve' | 'reject',
  reason?: string,
  ipAddress?: string,
) {
  const driver = await prisma.driverProfile.findUnique({ where: { userId } });
  if (!driver) throw new NotFoundError('Driver profile not found');

  const onboardingStatus =
    action === 'approve'
      ? DriverOnboardingStatus.approved
      : DriverOnboardingStatus.rejected;

  await prisma.driverProfile.update({
    where: { userId },
    data: { onboardingStatus },
  });

  if (action === 'approve') {
    await syncUserStatus(userId);
  }

  await prisma.auditLog.create({
    data: {
      actorId,
      targetUserId: userId,
      action: `driver.review.${action}`,
      details: { reason },
      ipAddress,
    },
  });

  return { userId, onboardingStatus };
}

export async function reviewDocument(
  actorId: string,
  userId: string,
  docId: string,
  action: 'approve' | 'reject',
  rejectionReason?: string,
  ipAddress?: string,
) {
  const doc = await prisma.verificationDocument.findFirst({
    where: { id: docId, userId },
  });
  if (!doc) throw new NotFoundError('Document not found');

  const updated = await prisma.verificationDocument.update({
    where: { id: docId },
    data: {
      status: action === 'approve' ? DocumentStatus.approved : DocumentStatus.rejected,
      reviewedBy: actorId,
      rejectionReason: action === 'reject' ? rejectionReason : null,
      reviewedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId,
      targetUserId: userId,
      action: `document.review.${action}`,
      details: { docId, type: doc.type },
      ipAddress,
    },
  });

  return updated;
}

export async function addAdminNote(actorId: string, userId: string, content: string) {
  return prisma.adminNote.create({
    data: { targetUserId: userId, authorId: actorId, content },
  });
}

export async function applyPenalty(
  actorId: string,
  userId: string,
  amount: number,
  reason: string,
  ipAddress?: string,
) {
  return applyWalletPenalty(actorId, userId, amount, reason, ipAddress);
}

export async function getAuditLog(userId: string, page: number, limit: number) {
  const skip = (page - 1) * limit;
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: { targetUserId: userId },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { actor: { include: { profile: true } } },
    }),
    prisma.auditLog.count({ where: { targetUserId: userId } }),
  ]);

  return {
    logs: logs.map((l) => ({
      id: l.id,
      action: l.action,
      details: l.details,
      actorName: l.actor.profile?.fullName ?? l.actorId,
      createdAt: l.createdAt,
    })),
    total,
  };
}

export async function getGlobalAuditLog(query: {
  page: number;
  limit: number;
  action?: string;
  actorId?: string;
  from?: Date;
  to?: Date;
}) {
  const { page, limit, action, actorId, from, to } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.AuditLogWhereInput = {
    ...(action && { action: { contains: action, mode: 'insensitive' } }),
    ...(actorId && { actorId }),
    ...((from || to) && {
      createdAt: {
        ...(from && { gte: from }),
        ...(to && { lte: to }),
      },
    }),
  };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: { include: { profile: true } },
        targetUser: { include: { profile: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    logs: logs.map((l) => ({
      id: l.id,
      action: l.action,
      details: l.details,
      actorId: l.actorId,
      actorName: l.actor.profile?.fullName ?? l.actor.email ?? l.actorId,
      targetUserId: l.targetUserId,
      targetName: l.targetUser
        ? l.targetUser.profile?.fullName ?? l.targetUser.email ?? l.targetUserId
        : null,
      ipAddress: l.ipAddress,
      createdAt: l.createdAt,
    })),
    total,
  };
}

const PORTAL_PLATFORM_ROLES: PlatformRole[] = [
  PlatformRole.SUPER_ADMIN,
  PlatformRole.ADMIN,
  PlatformRole.SUB_ADMIN,
  PlatformRole.FINANCE_OFFICER,
  PlatformRole.FLEET_OWNER,
  PlatformRole.FLEET_MANAGER,
  PlatformRole.SUPPORT_AGENT,
];

export async function createAdminUser(
  actorId: string,
  actorRoles: PlatformRole[],
  data: {
    phone: string;
    email: string;
    password?: string;
    fullName: string;
    regionId: string;
    platformRole: PlatformRole;
    roleIds?: string[];
    permissionIds?: string[];
  },
  ipAddress?: string,
  options?: { allowDelegatedCreate?: boolean },
) {
  if (data.platformRole === PlatformRole.SUPER_ADMIN && !actorRoles.includes(PlatformRole.SUPER_ADMIN)) {
    throw new ForbiddenError('Only SUPER_ADMIN can create SUPER_ADMIN users');
  }
  if (data.platformRole === PlatformRole.ADMIN && !actorRoles.includes(PlatformRole.SUPER_ADMIN)) {
    throw new ForbiddenError('Only SUPER_ADMIN can create ADMIN users');
  }
  if (
    data.platformRole === PlatformRole.SUB_ADMIN &&
    !actorRoles.includes(PlatformRole.SUPER_ADMIN) &&
    !options?.allowDelegatedCreate
  ) {
    throw new ForbiddenError('Only SUPER_ADMIN can create SUB_ADMIN users');
  }

  const region = await prisma.region.findUnique({ where: { id: data.regionId } });
  if (!region || !region.isActive) throw new NotFoundError('Region not found');

  const phone = normalizePhone(data.phone);
  if (!isValidE164(phone)) {
    throw new ValidationError('Invalid phone number. Use international format, e.g. +14155552671');
  }

  // RID-5 — must match region phone prefix; national part must be reasonable length
  const prefix = region.phonePrefix?.replace(/\s/g, '') || '';
  if (prefix && !phone.startsWith(prefix)) {
    throw new ValidationError(
      `Phone must start with region prefix ${prefix}`,
      { regionCode: region.code, phonePrefix: prefix },
    );
  }
  const nationalDigits = phone.replace(/\D/g, '').slice(prefix.replace(/\D/g, '').length);
  if (nationalDigits.length < 7) {
    throw new ValidationError(
      'Phone number is too short for the selected region',
      { minNationalDigits: 7 },
    );
  }

  const email = data.email.trim().toLowerCase();
  if (email.length > 254) {
    throw new ValidationError('Email exceeds maximum length');
  }

  const existingPhone = await prisma.user.findFirst({
    where: { phone, regionId: data.regionId, deletedAt: null },
  });
  if (existingPhone) {
    throw new ConflictError('Phone already registered in this region', 'PHONE_EXISTS');
  }

  const existingEmail = await prisma.user.findFirst({
    where: { email, deletedAt: null },
  });
  if (existingEmail) {
    throw new ConflictError('Email already in use', 'EMAIL_EXISTS');
  }

  if (data.roleIds?.length) {
    const roles = await prisma.role.findMany({ where: { id: { in: data.roleIds } } });
    if (roles.length !== data.roleIds.length) {
      throw new ValidationError('One or more role IDs are invalid');
    }
  }

  if (data.permissionIds?.length) {
    const permissions = await prisma.permission.findMany({ where: { id: { in: data.permissionIds } } });
    if (permissions.length !== data.permissionIds.length) {
      throw new ValidationError('One or more permission IDs are invalid');
    }
  }

  const temporaryPassword = data.password ? undefined : generateTemporaryPassword();
  const password = data.password ?? temporaryPassword!;
  const mustResetPassword = !data.password;
  const passwordHash = await hashPassword(password);

  const user = await prisma.$transaction(async (tx) => {
    const userData: Prisma.UserCreateInput = {
      phone,
      email,
      passwordHash,
      phoneVerifiedAt: new Date(),
      status: UserStatus.ACTIVE,
      region: { connect: { id: data.regionId } },
      profile: { create: { fullName: data.fullName } },
      passengerProfile: { create: {} },
      notificationPrefs: { create: {} },
      wallet: { create: { currency: region.currency } },
      platformRoles: { create: { role: data.platformRole } },
    };

    const created = await tx.user.create({ data: userData });

    const withPasswordFlag =
      mustResetPassword
        ? await tx.user.update({
            where: { id: created.id },
            data: { mustResetPassword: true as boolean },
          })
        : created;

    if (data.roleIds?.length) {
      await tx.userRole.createMany({
        data: data.roleIds.map((roleId) => ({
          userId: created.id,
          roleId,
          assignedBy: actorId,
        })),
        skipDuplicates: true,
      });
    }

    if (data.permissionIds?.length) {
      await tx.userPermission.createMany({
        data: data.permissionIds.map((permissionId) => ({
          userId: created.id,
          permissionId,
          assignedBy: actorId,
        })),
        skipDuplicates: true,
      });
    }

    return withPasswordFlag;
  });

  await prisma.auditLog.create({
    data: {
      actorId,
      targetUserId: user.id,
      action: 'user.create',
      details: {
        platformRole: data.platformRole,
        email: data.email,
        portalAccess: PORTAL_PLATFORM_ROLES.includes(data.platformRole),
        mustResetPassword,
        temporaryPasswordGenerated: Boolean(temporaryPassword),
      },
      ipAddress,
    },
  });

  const adminRole = platformRoleToAdminRole(data.platformRole);
  if (adminRole) {
    await upsertAdminAssignment({
      userId: user.id,
      role: adminRole,
      countryId: adminRole === 'FLEET_OWNER' ? data.regionId : null,
      continentId: adminRole === 'FLEET_OWNER' ? region.continentId : null,
      invitedByUserId: actorId,
    });
  }

  const userDetail = await getAdminUserDetail(user.id);
  return temporaryPassword ? { ...userDetail, temporaryPassword } : userDetail;
}

export async function resetAdminUserPassword(
  actorId: string,
  actorRoles: PlatformRole[],
  targetUserId: string,
  ipAddress?: string,
) {
  if (!actorRoles.includes(PlatformRole.SUPER_ADMIN)) {
    throw new ForbiddenError('Only SUPER_ADMIN can reset user passwords');
  }

  if (actorId === targetUserId) {
    throw new ForbiddenError('Use change password for your own account');
  }

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    include: { platformRoles: true },
  });

  if (!user || user.deletedAt) {
    throw new NotFoundError('User not found');
  }

  if (!user.email || !user.passwordHash) {
    throw new ValidationError('User does not have portal login credentials');
  }

  const roles = user.platformRoles.map((r) => r.role);
  if (!canAccessPortal(roles)) {
    throw new ValidationError('User does not have portal access');
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: targetUserId },
      data: { passwordHash, mustResetPassword: true },
    });

    await tx.refreshToken.updateMany({
      where: { userId: targetUserId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });

  await prisma.auditLog.create({
    data: {
      actorId,
      targetUserId,
      action: 'user.password_reset',
      details: { temporaryPasswordGenerated: true },
      ipAddress,
    },
  });

  return {
    userId: targetUserId,
    email: user.email,
    temporaryPassword,
  };
}
