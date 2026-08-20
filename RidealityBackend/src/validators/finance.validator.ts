import { z } from 'zod';

const listWalletsBaseSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  ownerType: z.enum(['user', 'fleet', 'platform']).optional(),
  regionId: z.string().uuid().optional(),
  status: z.enum(['active', 'frozen', 'closed']).optional(),
  search: z.string().optional(),
  currency: z.string().min(3).max(3).optional(),
  balanceMin: z.coerce.number().optional(),
  balanceMax: z.coerce.number().optional(),
  updatedFrom: z.string().datetime().optional(),
  updatedTo: z.string().datetime().optional(),
  ids: z.string().optional(),
});

const dateRangeRefine = <T extends { updatedFrom?: string; updatedTo?: string }>(schema: z.ZodType<T>) =>
  schema.refine((d) => !d.updatedFrom || !d.updatedTo || d.updatedFrom <= d.updatedTo, {
    message: 'Updated From must be on or before Updated To',
    path: ['updatedFrom'],
  });

export const listWalletsSchema = dateRangeRefine(listWalletsBaseSchema);

export const exportWalletsSchema = dateRangeRefine(
  listWalletsBaseSchema.omit({ page: true, limit: true }),
);

export const createWalletSchema = z
  .object({
    ownerType: z.enum(['user', 'fleet']),
    userId: z.string().uuid().optional(),
    fleetCompanyId: z.string().uuid().optional(),
    currency: z.string().min(3).max(3).optional(),
  })
  .refine((data) => Boolean(data.userId) !== Boolean(data.fleetCompanyId), {
    message: 'Provide either userId or fleetCompanyId',
  });

export const bulkWalletStatusSchema = z.object({
  walletIds: z.array(z.string().uuid()).min(1).max(100),
  status: z.enum(['active', 'frozen', 'closed']),
});

export const walletNoteSchema = z.object({
  content: z.string().min(1).max(2000),
});

export const walletLookupSchema = z.object({
  email: z.string().trim().email(),
});

export const listFinanceTransactionsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  walletId: z.string().uuid().optional(),
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

export const listAdjustmentsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(),
  walletId: z.string().uuid().optional(),
});

export const listPayoutsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['pending', 'approved', 'processing', 'completed', 'rejected', 'cancelled']).optional(),
  walletId: z.string().uuid().optional(),
});

export const createAdjustmentSchema = z.object({
  walletId: z.string().uuid(),
  direction: z.enum(['credit', 'debit']),
  // RID-7 — cap to Decimal(12,2) range
  amount: z.coerce.number().positive().max(9_999_999_999.99, 'Amount exceeds maximum allowed'),
  reason: z.string().min(3).max(500),
  topupMethod: z.enum(['cash', 'bank_transfer', 'admin_manual', 'gateway']).optional(),
  externalRef: z.string().max(120).optional(),
});

export const reviewAdjustmentSchema = z.object({
  action: z.enum(['approve', 'reject']),
  reviewNote: z.string().max(500).optional(),
});

export const walletStatusSchema = z.object({
  status: z.enum(['active', 'frozen', 'closed']),
});

export const createPayoutRequestSchema = z.object({
  walletId: z.string().uuid(),
  amount: z.coerce.number().positive().max(9_999_999_999.99, 'Amount exceeds maximum allowed'),
  bankName: z.string().max(120).optional(),
  accountNumber: z.string().max(64).optional(),
  accountTitle: z.string().max(120).optional(),
});

export const reviewPayoutSchema = z.object({
  action: z.enum(['approve', 'reject']),
  reviewNote: z.string().max(500).optional(),
});

export const fleetPayoutBodySchema = z.object({
  amount: z.coerce.number().positive().max(9_999_999_999.99, 'Amount exceeds maximum allowed'),
  bankName: z.string().max(120).optional(),
  accountNumber: z.string().max(64).optional(),
  accountTitle: z.string().max(120).optional(),
});

export const listWalletTransactionsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
