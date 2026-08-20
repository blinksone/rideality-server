import { PlatformRole, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { PERMISSION_KEYS, expandPermissionAliases } from '../constants/permissions';
import { assignmentPermissionKeys } from './admin-scope.service';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../utils/errors';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function isSuperAdmin(roles: PlatformRole[]): boolean {
  return roles.includes(PlatformRole.SUPER_ADMIN);
}

async function audit(
  actorId: string,
  targetUserId: string | null,
  action: string,
  details: Record<string, unknown>,
  ipAddress?: string,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId,
      targetUserId,
      action,
      details: details as Prisma.InputJsonValue,
      ipAddress,
    },
  });
}

export async function resolveUserPermissionKeys(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      platformRoles: true,
      adminAssignment: { include: { grants: true } },
      userRoles: {
        include: {
          role: {
            include: {
              permissions: { include: { permission: true } },
            },
          },
        },
      },
      userPermissions: { include: { permission: true } },
    },
  });

  if (!user) return [];

  if (
    user.platformRoles.some((r) => r.role === PlatformRole.SUPER_ADMIN) ||
    user.adminAssignment?.role === 'SUPER_ADMIN'
  ) {
    const all = await prisma.permission.findMany({ select: { key: true } });
    return all.map((p) => p.key);
  }

  const keys = new Set<string>();

  if (user.adminAssignment) {
    assignmentPermissionKeys(
      user.adminAssignment,
      user.adminAssignment.grants.map((g) => g.key),
    ).forEach((k) => keys.add(k));
  }

  const platformDefaults: Partial<Record<PlatformRole, string[]>> = {
    [PlatformRole.FLEET_OWNER]: [
      PERMISSION_KEYS.MANAGE_FLEETS,
      PERMISSION_KEYS.MANAGE_DRIVERS,
      PERMISSION_KEYS.MANAGE_DOCUMENTS,
      PERMISSION_KEYS.VIEW_REPORTS,
    ],
    [PlatformRole.FLEET_MANAGER]: [
      PERMISSION_KEYS.MANAGE_FLEETS,
      PERMISSION_KEYS.MANAGE_DRIVERS,
      PERMISSION_KEYS.MANAGE_DOCUMENTS,
      PERMISSION_KEYS.VIEW_REPORTS,
      PERMISSION_KEYS.VIEW_FINANCE,
    ],
    [PlatformRole.SUPPORT_AGENT]: [
      PERMISSION_KEYS.MANAGE_USERS,
      PERMISSION_KEYS.MANAGE_NOTES,
      PERMISSION_KEYS.VIEW_REPORTS,
    ],
    [PlatformRole.FINANCE_OFFICER]: [
      PERMISSION_KEYS.VIEW_FINANCE,
      PERMISSION_KEYS.MANAGE_WALLET_ADJUSTMENTS,
      PERMISSION_KEYS.MANAGE_PAYOUTS,
      PERMISSION_KEYS.EXPORT_FINANCE_REPORTS,
      PERMISSION_KEYS.VIEW_REPORTS,
    ],
    [PlatformRole.ADMIN]: [
      PERMISSION_KEYS.MANAGE_USERS,
      PERMISSION_KEYS.MANAGE_DRIVERS,
      PERMISSION_KEYS.MANAGE_FLEETS,
      PERMISSION_KEYS.MANAGE_ROLES,
      PERMISSION_KEYS.VIEW_REPORTS,
      PERMISSION_KEYS.MANAGE_DOCUMENTS,
      PERMISSION_KEYS.MANAGE_PENALTIES,
      PERMISSION_KEYS.MANAGE_NOTES,
      PERMISSION_KEYS.VIEW_FINANCE,
      PERMISSION_KEYS.MANAGE_WALLET_ADJUSTMENTS,
      PERMISSION_KEYS.APPROVE_WALLET_ADJUSTMENTS,
      PERMISSION_KEYS.MANAGE_PAYOUTS,
      PERMISSION_KEYS.EXPORT_FINANCE_REPORTS,
    ],
    [PlatformRole.SUB_ADMIN]: [
      PERMISSION_KEYS.MANAGE_USERS,
      PERMISSION_KEYS.MANAGE_DRIVERS,
      PERMISSION_KEYS.MANAGE_FLEETS,
      PERMISSION_KEYS.VIEW_REPORTS,
      PERMISSION_KEYS.MANAGE_DOCUMENTS,
      PERMISSION_KEYS.MANAGE_PENALTIES,
      PERMISSION_KEYS.MANAGE_NOTES,
      PERMISSION_KEYS.VIEW_FINANCE,
      PERMISSION_KEYS.MANAGE_WALLET_ADJUSTMENTS,
      PERMISSION_KEYS.MANAGE_PAYOUTS,
      PERMISSION_KEYS.EXPORT_FINANCE_REPORTS,
    ],
  };

  if (!user.adminAssignment) {
    for (const pr of user.platformRoles) {
      const defaults = platformDefaults[pr.role];
      if (defaults) defaults.forEach((k) => keys.add(k));
    }
  }

  for (const ur of user.userRoles) {
    for (const rp of ur.role.permissions) {
      keys.add(rp.permission.key);
    }
  }
  for (const up of user.userPermissions) {
    keys.add(up.permission.key);
  }

  if (!user.adminAssignment) {
    const memberships = await prisma.fleetMembership.findMany({
      where: { userId, status: 'active' },
      select: { role: true },
    });
    for (const m of memberships) {
      if (m.role === 'owner' || m.role === 'regional' || m.role === 'manager') {
        keys.add(PERMISSION_KEYS.MANAGE_FLEETS);
        keys.add(PERMISSION_KEYS.MANAGE_DRIVERS);
        keys.add(PERMISSION_KEYS.MANAGE_DOCUMENTS);
        keys.add(PERMISSION_KEYS.VIEW_REPORTS);
      }
      if (m.role === 'support' || m.role === 'dispatcher') {
        keys.add(PERMISSION_KEYS.MANAGE_FLEETS);
        keys.add(PERMISSION_KEYS.MANAGE_NOTES);
        keys.add(PERMISSION_KEYS.VIEW_REPORTS);
      }
    }
  }

  return expandPermissionAliases(keys);
}

// ─── Permissions catalog ─────────────────────────────────────────────────────

export async function listPermissions(query: { page: number; limit: number; search?: string }) {
  const { page, limit } = query;
  const skip = (page - 1) * limit;
  const term = query.search?.trim().replace(/\s+/g, ' ');
  const where: Prisma.PermissionWhereInput = term
    ? {
        OR: [
          { key: { contains: term, mode: 'insensitive' } },
          // Keys use underscores (e.g. manage_users) so "Manage Users" still matches
          { key: { contains: term.replace(/ /g, '_'), mode: 'insensitive' } },
          { meaning: { contains: term, mode: 'insensitive' } },
        ],
      }
    : {};

  const [permissions, total] = await Promise.all([
    prisma.permission.findMany({ where, skip, take: limit, orderBy: { key: 'asc' } }),
    prisma.permission.count({ where }),
  ]);

  return {
    permissions: permissions.map((p) => ({
      id: p.id,
      permission: p.key,
      meaning: p.meaning,
      isSystem: p.isSystem,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
    total,
  };
}

export async function getPermission(permissionId: string) {
  const p = await prisma.permission.findUnique({ where: { id: permissionId } });
  if (!p) throw new NotFoundError('Permission not found');
  return { id: p.id, permission: p.key, meaning: p.meaning, isSystem: p.isSystem };
}

export async function createPermission(
  actorId: string,
  data: { key: string; meaning: string },
  ipAddress?: string,
) {
  const existing = await prisma.permission.findUnique({ where: { key: data.key } });
  if (existing) throw new ConflictError('Permission key already exists');

  const permission = await prisma.permission.create({
    data: { key: data.key, meaning: data.meaning, isSystem: false },
  });

  await audit(actorId, null, 'permission.create', { key: permission.key }, ipAddress);
  return { id: permission.id, permission: permission.key, meaning: permission.meaning };
}

export async function updatePermission(
  actorId: string,
  permissionId: string,
  meaning: string,
  ipAddress?: string,
) {
  const existing = await prisma.permission.findUnique({ where: { id: permissionId } });
  if (!existing) throw new NotFoundError('Permission not found');

  const permission = await prisma.permission.update({
    where: { id: permissionId },
    data: { meaning },
  });

  await audit(actorId, null, 'permission.update', { permissionId, key: permission.key }, ipAddress);
  return { id: permission.id, permission: permission.key, meaning: permission.meaning };
}

export async function deletePermission(actorId: string, permissionId: string, ipAddress?: string) {
  const permission = await prisma.permission.findUnique({
    where: { id: permissionId },
    include: {
      _count: { select: { rolePermissions: true, userPermissions: true } },
    },
  });
  if (!permission) throw new NotFoundError('Permission not found');
  if (permission.isSystem) throw new ForbiddenError('System permissions cannot be deleted');
  if (permission._count.rolePermissions > 0 || permission._count.userPermissions > 0) {
    throw new ConflictError('Permission is in use. Remove from roles/users first.');
  }

  await prisma.permission.delete({ where: { id: permissionId } });
  await audit(actorId, null, 'permission.delete', { key: permission.key }, ipAddress);
  return { deleted: true, id: permissionId };
}

// ─── Roles ───────────────────────────────────────────────────────────────────

async function linkRolePermissions(roleId: string, permissionIds: string[]) {
  const permissions = await prisma.permission.findMany({
    where: { id: { in: permissionIds } },
  });
  if (permissions.length !== permissionIds.length) {
    throw new ValidationError('One or more permission IDs are invalid');
  }

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId } }),
    prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
    }),
  ]);
}

function formatRole(role: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
  permissions: { permission: { id: string; key: string; meaning: string } }[];
  _count?: { userRoles: number };
}) {
  return {
    id: role.id,
    name: role.name,
    slug: role.slug,
    description: role.description,
    isSystem: role.isSystem,
    userCount: role._count?.userRoles ?? 0,
    permissions: role.permissions.map((rp) => ({
      id: rp.permission.id,
      permission: rp.permission.key,
      meaning: rp.permission.meaning,
    })),
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
}

export async function listRoles(query: { page: number; limit: number; search?: string }) {
  const { page, limit, search } = query;
  const skip = (page - 1) * limit;
  const where: Prisma.RoleWhereInput = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { slug: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {};

  const [roles, total] = await Promise.all([
    prisma.role.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { userRoles: true } },
      },
    }),
    prisma.role.count({ where }),
  ]);

  return { roles: roles.map(formatRole), total };
}

export async function getRole(roleId: string) {
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: {
      permissions: { include: { permission: true } },
      _count: { select: { userRoles: true } },
    },
  });
  if (!role) throw new NotFoundError('Role not found');
  return formatRole(role);
}

export async function createRole(
  actorId: string,
  data: { name: string; slug?: string; description?: string; permissionIds: string[] },
  ipAddress?: string,
) {
  const slug = data.slug ?? slugify(data.name);
  if (!slug) throw new ValidationError('Invalid role name');

  const taken = await prisma.role.findFirst({
    where: { OR: [{ name: data.name }, { slug }] },
  });
  if (taken) throw new ConflictError('Role name or slug already exists');

  const role = await prisma.$transaction(async (tx) => {
    const created = await tx.role.create({
      data: { name: data.name, slug, description: data.description },
    });
    const permissions = await tx.permission.findMany({
      where: { id: { in: data.permissionIds } },
    });
    if (permissions.length !== data.permissionIds.length) {
      throw new ValidationError('One or more permission IDs are invalid');
    }
    await tx.rolePermission.createMany({
      data: data.permissionIds.map((permissionId) => ({
        roleId: created.id,
        permissionId,
      })),
    });
    return created;
  });

  await audit(actorId, null, 'role.create', { roleId: role.id, name: role.name }, ipAddress);
  return getRole(role.id);
}

export async function updateRole(
  actorId: string,
  roleId: string,
  data: { name?: string; description?: string; permissionIds?: string[] },
  ipAddress?: string,
) {
  const existing = await prisma.role.findUnique({ where: { id: roleId } });
  if (!existing) throw new NotFoundError('Role not found');

  if (data.name && data.name !== existing.name) {
    const nameTaken = await prisma.role.findFirst({
      where: { name: data.name, NOT: { id: roleId } },
    });
    if (nameTaken) throw new ConflictError('Role name already in use');
  }

  await prisma.role.update({
    where: { id: roleId },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
    },
  });

  if (data.permissionIds) {
    await linkRolePermissions(roleId, data.permissionIds);
  }

  await audit(actorId, null, 'role.update', { roleId, changes: data }, ipAddress);
  return getRole(roleId);
}

export async function deleteRole(actorId: string, roleId: string, ipAddress?: string) {
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: { _count: { select: { userRoles: true } } },
  });
  if (!role) throw new NotFoundError('Role not found');
  if (role.isSystem) throw new ForbiddenError('System roles cannot be deleted');
  if (role._count.userRoles > 0) {
    throw new ConflictError('Role is assigned to users. Unassign first.');
  }

  await prisma.role.delete({ where: { id: roleId } });
  await audit(actorId, null, 'role.delete', { roleId, name: role.name }, ipAddress);
  return { deleted: true, id: roleId };
}

// ─── User access (roles + direct permissions) ────────────────────────────────

export async function getUserAccess(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      platformRoles: true,
      userRoles: {
        include: {
          role: {
            include: {
              permissions: { include: { permission: true } },
            },
          },
        },
      },
      userPermissions: { include: { permission: true } },
    },
  });
  if (!user) throw new NotFoundError('User not found');

  const directPermissions = user.userPermissions.map((up) => ({
    id: up.permission.id,
    permission: up.permission.key,
    meaning: up.permission.meaning,
    assignedAt: up.createdAt,
    source: 'direct' as const,
  }));

  const roles = user.userRoles.map((ur) => ({
    id: ur.role.id,
    name: ur.role.name,
    slug: ur.role.slug,
    assignedAt: ur.createdAt,
    permissions: ur.role.permissions.map((rp) => ({
      id: rp.permission.id,
      permission: rp.permission.key,
      meaning: rp.permission.meaning,
    })),
  }));

  const effectiveKeys = await resolveUserPermissionKeys(userId);

  return {
    userId,
    platformRoles: user.platformRoles.map((r) => r.role),
    roles,
    directPermissions,
    effectivePermissions: effectiveKeys,
  };
}

export async function setUserPermissions(
  actorId: string,
  userId: string,
  permissionIds: string[],
  ipAddress?: string,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');

  const permissions = await prisma.permission.findMany({
    where: { id: { in: permissionIds } },
  });
  if (permissions.length !== permissionIds.length) {
    throw new ValidationError('One or more permission IDs are invalid');
  }

  await prisma.$transaction([
    prisma.userPermission.deleteMany({ where: { userId } }),
    prisma.userPermission.createMany({
      data: permissionIds.map((permissionId) => ({
        userId,
        permissionId,
        assignedBy: actorId,
      })),
    }),
  ]);

  await audit(actorId, userId, 'user.permissions.set', { permissionIds }, ipAddress);
  return getUserAccess(userId);
}

export async function addUserPermissions(
  actorId: string,
  userId: string,
  permissionIds: string[],
  ipAddress?: string,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');

  for (const permissionId of permissionIds) {
    const permission = await prisma.permission.findUnique({ where: { id: permissionId } });
    if (!permission) throw new NotFoundError(`Permission not found: ${permissionId}`);

    await prisma.userPermission.upsert({
      where: { userId_permissionId: { userId, permissionId } },
      create: { userId, permissionId, assignedBy: actorId },
      update: { assignedBy: actorId },
    });
  }

  await audit(actorId, userId, 'user.permissions.add', { permissionIds }, ipAddress);
  return getUserAccess(userId);
}

export async function removeUserPermission(
  actorId: string,
  userId: string,
  permissionId: string,
  ipAddress?: string,
) {
  const assignment = await prisma.userPermission.findUnique({
    where: { userId_permissionId: { userId, permissionId } },
    include: { permission: true },
  });
  if (!assignment) throw new NotFoundError('Permission assignment not found');

  await prisma.userPermission.delete({
    where: { userId_permissionId: { userId, permissionId } },
  });

  await audit(
    actorId,
    userId,
    'user.permissions.remove',
    { permissionId, key: assignment.permission.key },
    ipAddress,
  );
  return { removed: true, permissionId };
}

export async function setUserRoles(
  actorId: string,
  userId: string,
  roleIds: string[],
  ipAddress?: string,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');

  const roles = await prisma.role.findMany({ where: { id: { in: roleIds } } });
  if (roles.length !== roleIds.length) {
    throw new ValidationError('One or more role IDs are invalid');
  }

  await prisma.$transaction([
    prisma.userRole.deleteMany({ where: { userId } }),
    prisma.userRole.createMany({
      data: roleIds.map((roleId) => ({ userId, roleId, assignedBy: actorId })),
    }),
  ]);

  await audit(actorId, userId, 'user.roles.set', { roleIds }, ipAddress);
  return getUserAccess(userId);
}

export async function assignUserRole(
  actorId: string,
  userId: string,
  roleId: string,
  ipAddress?: string,
) {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw new NotFoundError('Role not found');

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId } },
    create: { userId, roleId, assignedBy: actorId },
    update: { assignedBy: actorId },
  });

  await audit(actorId, userId, 'user.role.assign', { roleId, roleName: role.name }, ipAddress);
  return getUserAccess(userId);
}

export async function removeUserRole(
  actorId: string,
  userId: string,
  roleId: string,
  ipAddress?: string,
) {
  const assignment = await prisma.userRole.findUnique({
    where: { userId_roleId: { userId, roleId } },
    include: { role: true },
  });
  if (!assignment) throw new NotFoundError('Role assignment not found');

  await prisma.userRole.delete({ where: { userId_roleId: { userId, roleId } } });
  await audit(actorId, userId, 'user.role.remove', { roleId, roleName: assignment.role.name }, ipAddress);
  return { removed: true, roleId };
}

export async function assignPlatformRole(
  actorId: string,
  actorRoles: PlatformRole[],
  userId: string,
  platformRole: PlatformRole,
  ipAddress?: string,
) {
  if (platformRole === PlatformRole.SUPER_ADMIN && !isSuperAdmin(actorRoles)) {
    throw new ForbiddenError('Only SUPER_ADMIN can assign SUPER_ADMIN');
  }
  if (platformRole === PlatformRole.ADMIN && !isSuperAdmin(actorRoles)) {
    throw new ForbiddenError('Only SUPER_ADMIN can assign ADMIN');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');

  await prisma.userPlatformRole.upsert({
    where: { userId_role: { userId, role: platformRole } },
    create: { userId, role: platformRole },
    update: {},
  });

  await audit(actorId, userId, 'user.platform_role.assign', { platformRole }, ipAddress);
  return getUserAccess(userId);
}

export async function revokePlatformRole(
  actorId: string,
  actorRoles: PlatformRole[],
  userId: string,
  platformRole: PlatformRole,
  ipAddress?: string,
) {
  if (
    (platformRole === PlatformRole.SUPER_ADMIN || platformRole === PlatformRole.ADMIN) &&
    !isSuperAdmin(actorRoles)
  ) {
    throw new ForbiddenError('Only SUPER_ADMIN can revoke this platform role');
  }

  if (platformRole === PlatformRole.SUPER_ADMIN) {
    const count = await prisma.userPlatformRole.count({
      where: { role: PlatformRole.SUPER_ADMIN },
    });
    if (count <= 1) throw new ForbiddenError('Cannot remove the last SUPER_ADMIN');
  }

  const assignment = await prisma.userPlatformRole.findUnique({
    where: { userId_role: { userId, role: platformRole } },
  });
  if (!assignment) throw new NotFoundError('Platform role not assigned');

  await prisma.userPlatformRole.delete({
    where: { userId_role: { userId, role: platformRole } },
  });

  await audit(actorId, userId, 'user.platform_role.revoke', { platformRole }, ipAddress);
  return { revoked: true, platformRole };
}
