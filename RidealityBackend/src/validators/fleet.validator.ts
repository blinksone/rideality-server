import { z } from 'zod';

/** Shared field rules used by fleet create/update (RID-17..22). */
export const FLEET_LEGAL_NAME_MAX = 120;
export const FLEET_TAX_ID_MAX = 50;

/** Letters, numbers, spaces, and common business punctuation. Blocks scripts/SQL meta. */
export const legalNameSchema = z
  .string()
  .trim()
  .min(2, 'Legal name must be at least 2 characters')
  .max(FLEET_LEGAL_NAME_MAX, `Legal name must be at most ${FLEET_LEGAL_NAME_MAX} characters`)
  .regex(
    /^[\p{L}\p{N}\s.&'\-]+$/u,
    'Legal name contains invalid characters. Use letters, numbers, spaces, and . & \' - only',
  );

export const taxIdSchema = z
  .string()
  .trim()
  .max(FLEET_TAX_ID_MAX, `Tax ID must be at most ${FLEET_TAX_ID_MAX} characters`)
  .regex(
    /^[A-Za-z0-9\-./]*$/,
    'Tax ID may only contain letters, numbers, hyphens, periods, and slashes',
  )
  .optional()
  .or(z.literal(''));

export const createFleetSchema = z.object({
  legalName: legalNameSchema,
  taxId: taxIdSchema,
  regionId: z.string().uuid(),
});

export const updateFleetSchema = z.object({
  legalName: legalNameSchema.optional(),
  taxId: taxIdSchema.nullable().optional(),
});

export const listFleetsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(['pending', 'active', 'suspended']).optional(),
  regionId: z.string().uuid().optional(),
});

export const adminUpdateFleetSchema = z
  .object({
    legalName: legalNameSchema.optional(),
    taxId: taxIdSchema.nullable().optional(),
    regionId: z.string().uuid().optional(),
    status: z.enum(['pending', 'active', 'suspended']).optional(),
    statusReason: z.string().trim().min(3).max(500).optional().nullable(),
    ownerUserId: z.string().uuid().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.status === 'suspended') {
      const reason = data.statusReason?.trim();
      if (!reason || reason.length < 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['statusReason'],
          message: 'A reason is required when suspending a fleet',
        });
      }
    }
  });

export const adminCreateFleetSchema = z.object({
  legalName: legalNameSchema,
  taxId: taxIdSchema,
  regionId: z.string().uuid(),
  ownerUserId: z.string().uuid(),
});

export const fleetInviteSchema = z
  .object({
    phone: z.string().optional(),
    email: z.string().email().optional(),
    userId: z.string().uuid().optional(),
  })
  .refine((data) => Boolean(data.phone || data.email || data.userId), {
    message: 'Select a user or provide a phone number or email',
  });

export const inviteCandidateSearchSchema = z.object({
  search: z.string().min(2),
});

export const acceptInviteSchema = z.object({
  token: z.string().uuid(),
});

export const updateFleetDriverSchema = z.object({
  onboardingStatus: z
    .enum(['draft', 'pending_review', 'approved', 'rejected', 'suspended'])
    .optional(),
});

export const fleetListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  driverUserId: z.string().uuid().optional(),
  unreadOnly: z.coerce.boolean().optional(),
});

export const updateFleetVehicleSchema = z.object({
  operationalStatus: z.enum(['active', 'maintenance', 'offline']).optional(),
  driverUserId: z.string().uuid().nullable().optional(),
  vehicleType: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  numberPlate: z.string().min(1).optional(),
  color: z.string().optional().nullable(),
  year: z.coerce.number().int().min(1980).max(2100).optional().nullable(),
  availableSeats: z.coerce.number().int().min(1).max(20).optional(),
  isVerified: z.boolean().optional(),
});

export const createFleetVehicleSchema = z.object({
  driverUserId: z.string().uuid().optional(),
  vehicleType: z.string().min(1),
  model: z.string().min(1),
  numberPlate: z.string().min(1),
  color: z.string().optional(),
  year: z.coerce.number().int().min(1980).max(2100).optional(),
  availableSeats: z.coerce.number().int().min(1).max(20).optional(),
});

export const teamInviteSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['manager', 'dispatcher', 'regional', 'support']),
});

export const updateTeamMemberSchema = z.object({
  role: z.enum(['manager', 'dispatcher', 'regional', 'support']).optional(),
  fleetRegionId: z.string().uuid().nullable().optional(),
});

export const createFleetStaffSchema = z
  .object({
    role: z.enum(['REGIONAL', 'SUPPORT', 'regional', 'support']),
    fleetRegionId: z.string().uuid().optional(),
    fullName: z.string().trim().min(2).max(120),
    email: z.string().email().max(254),
    phone: z.string().min(8).max(20),
  })
  .superRefine((data, ctx) => {
    const isRegional = data.role === 'REGIONAL' || data.role === 'regional';
    if (isRegional && !data.fleetRegionId) {
      ctx.addIssue({
        code: 'custom',
        message: 'City is required for regional fleet',
        path: ['fleetRegionId'],
      });
    }
  });

export const fleetReportsQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(90).optional(),
});

export const fleetExportQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  status: z.string().optional(),
});

export const createFleetRegionSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

export const regionInviteSchema = z.object({
  email: z.string().email(),
});

export const reviewFleetDocumentSchema = z.object({
  status: z.enum(['approved', 'rejected', 'APPROVED', 'REJECTED']),
  rejectionReason: z.string().trim().min(3).max(500).optional(),
});

export const publicFleetCompaniesQuerySchema = z.object({
  regionId: z.string().uuid().optional(),
  regionCode: z.string().trim().min(2).max(8).optional(),
});

export const fleetDriversQuerySchema = z.object({
  regionId: z.string().uuid().optional(),
});

export const reviewFleetComplaintSchema = z.object({
  status: z.enum(['in_review', 'resolved']),
});
