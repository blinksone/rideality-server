import { z } from 'zod';

const dateOfBirthField = z
  .string()
  .datetime()
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

const locationField = z.object({
  label: z.enum(['home', 'work', 'university', 'custom']).default('home'),
  address: z.string().min(1),
  latitude: z.coerce.number(),
  longitude: z.coerce.number(),
  isDefault: z.boolean().optional(),
});

const commonProfileFields = {
  fullName: z.string().min(2).max(100),
  email: z.string().email().optional(),
  dateOfBirth: dateOfBirthField.optional(),
  gender: z.string().min(1).max(30).optional(),
  profession: z.string().min(1).max(80).optional(),
  preferredLanguage: z.string().min(2).max(5).optional(),
  emergencyContactName: z.string().min(1).max(100).optional(),
  emergencyContactPhone: z.string().min(8).max(20).optional(),
  location: locationField.optional(),
  acceptTerms: z.boolean().optional(),
  acceptPrivacy: z.boolean().optional(),
  acceptMarketing: z.boolean().optional(),
  consentVersion: z.string().min(1).max(20).optional(),
};

/** POST /onboarding/passenger */
export const passengerOnboardingSchema = z.object({
  ...commonProfileFields,
  promoOptIn: z.boolean().optional(),
});

/** POST /onboarding/driver */
export const driverOnboardingSchema = z.object({
  ...commonProfileFields,
  fullName: z.string().min(2).max(100),
  dateOfBirth: dateOfBirthField,
  licenseNumber: z.string().min(1).max(50).optional(),
  licenseExpiry: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .optional(),
  companyId: z.string().uuid(),
  regionId: z.string().uuid(),
});

export type PassengerOnboardingInput = z.infer<typeof passengerOnboardingSchema>;
export type DriverOnboardingInput = z.infer<typeof driverOnboardingSchema>;
