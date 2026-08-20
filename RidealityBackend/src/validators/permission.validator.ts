import { z } from 'zod';

const permissionKeySchema = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z][a-z0-9_]*$/, 'Key must be snake_case (e.g. manage_users)');

export const listPermissionsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().optional(),
});

export const createPermissionSchema = z.object({
  key: permissionKeySchema,
  meaning: z.string().min(3).max(500),
});

export const updatePermissionSchema = z.object({
  meaning: z.string().min(3).max(500),
});

export const listRolesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

export const createRoleSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  description: z.string().max(500).optional(),
  permissionIds: z.array(z.string().uuid()).min(1),
});

export const updateRoleSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(500).optional(),
  permissionIds: z.array(z.string().uuid()).min(1).optional(),
});

export const permissionIdsSchema = z.object({
  permissionIds: z.array(z.string().uuid()).min(1),
});

export const setPermissionIdsSchema = z.object({
  permissionIds: z.array(z.string().uuid()),
});

export const roleIdsSchema = z.object({
  roleIds: z.array(z.string().uuid()).min(1),
});

export const assignRoleSchema = z.object({
  roleId: z.string().uuid(),
});

export const assignPlatformRoleSchema = z.object({
  platformRole: z.enum([
    'ADMIN',
    'SUPPORT_AGENT',
    'FINANCE_OFFICER',
    'FLEET_MANAGER',
    'FLEET_OWNER',
    'DRIVER',
    'CUSTOMER',
    'SUPER_ADMIN',
    'SUB_ADMIN',
  ]),
});
