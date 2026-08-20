import { z } from 'zod';

export const updateProfileSchema = z.object({
  fullName: z.string().min(2).max(100).optional(),
  email: z
    .union([z.string().email().max(254), z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  preferredLanguage: z.string().min(2).max(5).optional(),
  dateOfBirth: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  gender: z.string().optional(),
  profession: z.string().min(1).max(80).optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  role: z.enum(['passenger', 'driver', 'both']).optional(),
  vehicleType: z.string().optional(),
  vehicleModel: z.string().optional(),
  numberPlate: z.string().optional(),
  availableSeats: z.coerce.number().int().min(1).max(20).optional(),
  licenseNumber: z.string().optional(),
  licenseExpiry: z.string().optional(),
});

export const setModeSchema = z.object({
  activeMode: z.enum(['passenger', 'driver']),
});

export const locationsSchema = z.object({
  locations: z
    .array(
      z.object({
        label: z.enum(['home', 'work', 'university', 'custom']),
        address: z.string().min(1),
        latitude: z.coerce.number(),
        longitude: z.coerce.number(),
        isDefault: z.boolean().optional(),
      }),
    )
    .min(1),
});

export const vehicleSchema = z.object({
  vehicleType: z.string().min(1),
  model: z.string().min(1),
  numberPlate: z.string().min(1),
  availableSeats: z.coerce.number().int().min(1).max(20).optional(),
  color: z.string().optional(),
  year: z.coerce.number().int().optional(),
  cargoCapacityKg: z.coerce.number().positive().max(50000).optional(),
});

export const serviceModesSchema = z.object({
  modes: z
    .array(z.enum(['rides', 'cargo']))
    .min(1)
    .max(2),
});

export const documentSchema = z.object({
  type: z.enum([
    'national_id',
    'passport',
    'driver_license',
    'vehicle_registration',
    'vehicle_insurance',
    'selfie',
  ]),
  fileUrl: z.string().url().or(z.string().startsWith('/uploads/')),
  expiresAt: z.string().optional(),
});

export const consentSchema = z.object({
  consents: z
    .array(
      z.object({
        type: z.enum(['terms_of_use', 'privacy_policy', 'marketing']),
        version: z.string().min(1),
        accepted: z.boolean(),
      }),
    )
    .min(1),
});

export const availabilitySchema = z.object({
  isOnline: z.boolean(),
  /** Optional: set modes when going online (same payload as service-modes). */
  modes: z.array(z.enum(['rides', 'cargo'])).min(1).max(2).optional(),
});

export const fcmTokenSchema = z.object({
  fcmToken: z.string().min(1),
  deviceName: z.string().optional(),
  platform: z.string().optional(),
});

export const notificationPrefsSchema = z.object({
  pushEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  rideUpdates: z.boolean().optional(),
  promotions: z.boolean().optional(),
});

export const reportUserSchema = z.object({
  reason: z.string().min(3),
  description: z.string().optional(),
  rideId: z.string().uuid().optional(),
});

export const rideHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'completed', 'cancelled', 'all']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  search: z.string().trim().min(1).optional(),
});

export const walletTxQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z
    .enum([
      'topup',
      'adjustment_credit',
      'adjustment_debit',
      'penalty',
      'payout',
      'ride_payment',
      'ride_earnings',
      'commission',
      'refund',
      'hold',
      'release',
    ])
    .optional(),
});

export const ratingsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const submitRatingSchema = z.object({
  score: z.coerce.number().int().min(1).max(5),
  tags: z.array(z.string()).max(10).optional(),
  comment: z.string().max(500).optional(),
  isAnonymous: z.boolean().optional(),
});
