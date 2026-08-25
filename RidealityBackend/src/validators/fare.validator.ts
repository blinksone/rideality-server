import { z } from 'zod';

const moneyField = z.coerce.number().min(0).max(1_000_000);

export const fareProductSchema = z.enum(['ride', 'cargo']);

export const listFareConfigsQuerySchema = z.object({
  countryId: z.string().uuid().optional(),
  cityId: z.string().uuid().optional(),
  product: fareProductSchema.optional(),
  serviceProductCode: z.string().min(1).max(32).optional(),
});

export const createFareConfigSchema = z.object({
  countryId: z.string().uuid(),
  cityId: z.string().uuid().nullable().optional(),
  product: fareProductSchema.optional(),
  serviceProductCode: z.string().min(1).max(32).optional(),
  baseFare: moneyField,
  perKm: moneyField,
  perMinute: moneyField,
  minimumFare: moneyField,
  bookingFee: moneyField,
  cancellationFee: moneyField.optional(),
  cargoPerKg: moneyField.optional(),
}).refine((d) => Boolean(d.product || d.serviceProductCode), {
  message: 'Provide product or serviceProductCode',
});

export const updateFareConfigSchema = z.object({
  baseFare: moneyField.optional(),
  perKm: moneyField.optional(),
  perMinute: moneyField.optional(),
  minimumFare: moneyField.optional(),
  bookingFee: moneyField.optional(),
  cancellationFee: moneyField.optional(),
  cargoPerKg: moneyField.optional(),
});
