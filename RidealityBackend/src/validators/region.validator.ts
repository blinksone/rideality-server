import { z } from 'zod';

export const listRegionsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  activeOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

const platformCommissionPercent = z.coerce.number().min(0).max(100);

export const createRegionSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(8)
    .regex(/^[A-Z0-9]+$/, 'Code must be uppercase letters and numbers'),
  name: z.string().min(2).max(120),
  currency: z
    .string()
    .length(3)
    .regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter ISO code'),
  phonePrefix: z
    .string()
    .regex(/^\+\d{1,4}$/, 'Phone prefix must start with + followed by digits'),
  platformCommissionPercent: platformCommissionPercent.default(0),
});

export const updateRegionSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  currency: z
    .string()
    .length(3)
    .regex(/^[A-Z]{3}$/)
    .optional(),
  phonePrefix: z
    .string()
    .regex(/^\+\d{1,4}$/)
    .optional(),
  isActive: z.boolean().optional(),
  platformCommissionPercent: platformCommissionPercent.optional(),
});

export const createCitySchema = z.object({
  name: z.string().trim().min(2).max(120),
  provinceId: z.string().uuid(),
});
