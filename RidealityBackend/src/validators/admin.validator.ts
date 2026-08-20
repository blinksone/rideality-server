import { z } from 'zod';

export const listUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum([
      'REGISTERED',
      'PHONE_VERIFIED',
      'PROFILE_INCOMPLETE',
      'ACTIVE',
      'RESTRICTED',
      'SUSPENDED',
      'BANNED',
      'DELETED',
    ])
    .optional(),
  role: z
    .enum([
      'CUSTOMER',
      'DRIVER',
      'FLEET_OWNER',
      'FLEET_MANAGER',
      'SUPPORT_AGENT',
      'ADMIN',
      'SUPER_ADMIN',
      'SUB_ADMIN',
    ])
    .optional(),
  regionId: z.string().uuid().optional(),
  search: z.string().optional(),
  driverStatus: z
    .enum(['draft', 'pending_review', 'approved', 'rejected', 'suspended'])
    .optional(),
});

export const updateStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'RESTRICTED', 'SUSPENDED', 'BANNED']),
  reason: z.string().min(3),
});

export const driverReviewSchema = z.object({
  action: z.enum(['approve', 'reject']),
  reason: z.string().optional(),
});

export const documentReviewSchema = z.object({
  action: z.enum(['approve', 'reject']),
  rejectionReason: z.string().optional(),
});

export const adminNoteSchema = z.object({
  content: z.string().min(1).max(2000),
});

export const penaltySchema = z.object({
  amount: z.coerce.number().positive().max(9_999_999_999.99, 'Amount exceeds maximum allowed'),
  reason: z.string().min(3).max(500),
});

export const auditLogSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const globalAuditLogSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().trim().min(1).optional(),
  actorId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const passengerRidesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'completed', 'cancelled', 'all']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  search: z.string().trim().min(1).optional(),
});

export const passengerRatingsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  direction: z.enum(['given', 'received']).optional(),
});

export const moderateRatingSchema = z.object({
  status: z.enum(['visible', 'hidden', 'flagged']),
});

export const createUserSchema = z.object({
  phone: z.string().min(8).max(20),
  email: z.string().email().max(254),
  password: z.string().min(8).optional(),
  fullName: z.string().min(2).max(120),
  regionId: z.string().uuid(),
  platformRole: z.enum([
    'CUSTOMER',
    'DRIVER',
    'FLEET_OWNER',
    'FLEET_MANAGER',
    'SUPPORT_AGENT',
    'FINANCE_OFFICER',
    'ADMIN',
    'SUPER_ADMIN',
    'SUB_ADMIN',
  ]),
  roleIds: z.array(z.string().uuid()).optional(),
  permissionIds: z.array(z.string().uuid()).optional(),
});

export const createPlatformStaffSchema = z.object({
  type: z.enum([
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
  ]),
  phone: z.string().min(8).max(20),
  email: z.string().email().max(254),
  fullName: z.string().min(2).max(120),
  regionId: z.string().uuid(),
  continentId: z.string().uuid().optional(),
  regionalId: z.string().uuid().optional(),
  cityId: z.string().uuid().optional(),
  legalName: z.string().min(2).max(120).optional(),
  taxId: z.string().max(50).optional(),
});

export const updatePlatformStaffSchema = z.object({
  phone: z.string().min(8).max(20),
  email: z.string().email().max(254),
  fullName: z.string().min(2).max(120),
  regionId: z.string().uuid(),
  continentId: z.string().uuid().optional(),
  regionalId: z.string().uuid().optional(),
  cityId: z.string().uuid().optional(),
});

export const listPlatformStaffSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z
    .enum([
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
    ])
    .optional(),
  search: z.string().optional(),
});
