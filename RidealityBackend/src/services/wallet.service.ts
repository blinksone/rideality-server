import {
  Prisma,
  UserStatus,
  WalletOwnerType,
  WalletStatus,
  WalletTransactionType,
} from '@prisma/client';
import { canMutateWalletsLocally } from '../config/env';
import { prisma } from '../lib/prisma';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';

/** Phase 2: only finance-service / monolith may mutate balances. */
function assertLocalWalletMutation() {
  if (!canMutateWalletsLocally()) {
    throw new ForbiddenError(
      'Wallet mutations must go through finance-service (internal finance API)',
      'WALLET_OWNERSHIP_VIOLATION',
    );
  }
}

export interface LedgerEntryInput {
  walletId: string;
  type: WalletTransactionType;
  amount: number;
  description?: string;
  referenceType?: string;
  referenceId?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
  createdById?: string;
  allowNegative?: boolean;
}

function toNumber(value: Prisma.Decimal | number): number {
  return typeof value === 'number' ? value : Number(value);
}

const CREDIT_TYPES: WalletTransactionType[] = [
  WalletTransactionType.topup,
  WalletTransactionType.adjustment_credit,
  WalletTransactionType.ride_earnings,
  WalletTransactionType.commission,
  WalletTransactionType.refund,
  WalletTransactionType.release,
];

function isCreditType(type: WalletTransactionType): boolean {
  return CREDIT_TYPES.includes(type);
}

export function formatWallet(wallet: {
  id: string;
  ownerType: WalletOwnerType;
  userId: string | null;
  fleetCompanyId: string | null;
  regionId: string | null;
  balance: Prisma.Decimal;
  currency: string;
  status: WalletStatus;
  createdAt: Date;
  updatedAt: Date;
  user?: {
    id: string;
    email: string | null;
    phone: string;
    status?: UserStatus;
    profile?: { fullName: string | null } | null;
  } | null;
  fleetCompany?: {
    id: string;
    legalName: string;
    status?: string;
    region?: { code: string; name: string } | null;
  } | null;
  region?: { id: string; code: string; name: string } | null;
}) {
  return {
    id: wallet.id,
    ownerType: wallet.ownerType,
    userId: wallet.userId,
    fleetCompanyId: wallet.fleetCompanyId,
    regionId: wallet.regionId,
    balance: toNumber(wallet.balance),
    currency: wallet.currency,
    status: wallet.status,
    createdAt: wallet.createdAt,
    updatedAt: wallet.updatedAt,
    ownerLabel:
      wallet.user?.profile?.fullName ??
      wallet.user?.email ??
      wallet.user?.phone ??
      wallet.fleetCompany?.legalName ??
      (wallet.region ? `Platform · ${wallet.region.code}` : 'Unknown'),
    ownerStatus:
      wallet.ownerType === WalletOwnerType.user
        ? wallet.user?.status ?? null
        : wallet.ownerType === WalletOwnerType.fleet
          ? wallet.fleetCompany?.status ?? null
          : null,
    user: wallet.user
      ? {
          id: wallet.user.id,
          email: wallet.user.email,
          phone: wallet.user.phone,
          status: wallet.user.status ?? null,
          fullName: wallet.user.profile?.fullName ?? null,
        }
      : null,
    fleetCompany: wallet.fleetCompany
      ? {
          id: wallet.fleetCompany.id,
          legalName: wallet.fleetCompany.legalName,
          region: wallet.fleetCompany.region ?? null,
        }
      : null,
    region: wallet.region ?? null,
  };
}

export function formatTransaction(tx: {
  id: string;
  walletId: string;
  type: WalletTransactionType;
  amount: Prisma.Decimal;
  balanceBefore: Prisma.Decimal;
  balanceAfter: Prisma.Decimal;
  currency: string;
  referenceType: string | null;
  referenceId: string | null;
  description: string | null;
  metadata: Prisma.JsonValue;
  createdById: string | null;
  createdAt: Date;
  createdBy?: { id: string; email: string | null; profile?: { fullName: string | null } | null } | null;
}) {
  return {
    id: tx.id,
    walletId: tx.walletId,
    type: tx.type,
    amount: toNumber(tx.amount),
    balanceBefore: toNumber(tx.balanceBefore),
    balanceAfter: toNumber(tx.balanceAfter),
    currency: tx.currency,
    referenceType: tx.referenceType,
    referenceId: tx.referenceId,
    description: tx.description,
    metadata: tx.metadata,
    createdById: tx.createdById,
    createdAt: tx.createdAt,
    createdBy: tx.createdBy
      ? {
          id: tx.createdBy.id,
          email: tx.createdBy.email,
          fullName: tx.createdBy.profile?.fullName ?? null,
        }
      : null,
  };
}

const walletInclude = {
  user: { include: { profile: true } },
  fleetCompany: { include: { region: { select: { code: true, name: true } } } },
  region: { select: { id: true, code: true, name: true } },
} as const;

export async function ensureUserWallet(userId: string, currency: string, tx: Prisma.TransactionClient = prisma) {
  assertLocalWalletMutation();
  return tx.wallet.upsert({
    where: { userId },
    create: { ownerType: WalletOwnerType.user, userId, currency },
    update: {},
  });
}

export async function ensureFleetWallet(
  fleetCompanyId: string,
  regionId: string,
  currency: string,
  tx: Prisma.TransactionClient = prisma,
) {
  assertLocalWalletMutation();
  return tx.wallet.upsert({
    where: { fleetCompanyId },
    create: {
      ownerType: WalletOwnerType.fleet,
      fleetCompanyId,
      regionId,
      currency,
    },
    update: {},
  });
}

export async function ensurePlatformWallet(
  regionId: string,
  currency: string,
  tx: Prisma.TransactionClient = prisma,
) {
  assertLocalWalletMutation();
  const existing = await tx.wallet.findFirst({
    where: { ownerType: WalletOwnerType.platform, regionId, currency },
  });
  if (existing) return existing;
  try {
    return await tx.wallet.create({
      data: {
        ownerType: WalletOwnerType.platform,
        regionId,
        currency,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const again = await tx.wallet.findFirst({
        where: { ownerType: WalletOwnerType.platform, regionId, currency },
      });
      if (again) return again;
    }
    throw err;
  }
}

export async function getWalletById(walletId: string) {
  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
    include: walletInclude,
  });
  if (!wallet) throw new NotFoundError('Wallet not found');
  return formatWallet(wallet);
}

export async function getUserWallet(userId: string) {
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    include: walletInclude,
  });
  if (!wallet) throw new NotFoundError('Wallet not found');
  return formatWallet(wallet);
}

export async function getFleetWallet(fleetCompanyId: string) {
  const wallet = await prisma.wallet.findUnique({
    where: { fleetCompanyId },
    include: walletInclude,
  });
  if (!wallet) throw new NotFoundError('Fleet wallet not found');
  return formatWallet(wallet);
}

export async function postLedgerEntry(
  input: LedgerEntryInput,
  tx: Prisma.TransactionClient = prisma,
) {
  assertLocalWalletMutation();
  if (input.amount <= 0) {
    throw new ValidationError('Amount must be greater than zero');
  }

  if (input.idempotencyKey) {
    const existing = await tx.walletTransaction.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      const wallet = await tx.wallet.findUniqueOrThrow({
        where: { id: existing.walletId },
        include: walletInclude,
      });
      return { transaction: existing, wallet: formatWallet(wallet), duplicate: true };
    }
  }

  const wallet = await tx.wallet.findUnique({ where: { id: input.walletId } });
  if (!wallet) throw new NotFoundError('Wallet not found');
  if (wallet.status === WalletStatus.frozen) {
    throw new ValidationError('Wallet is frozen');
  }
  if (wallet.status === WalletStatus.closed) {
    throw new ValidationError('Wallet is closed');
  }

  const balanceBefore = toNumber(wallet.balance);
  const delta = isCreditType(input.type) ? input.amount : -input.amount;
  const balanceAfter = Number((balanceBefore + delta).toFixed(2));

  if (balanceAfter < 0 && !input.allowNegative) {
    throw new ValidationError('Insufficient wallet balance');
  }

  const updatedWallet = await tx.wallet.update({
    where: { id: wallet.id },
    data: { balance: balanceAfter },
    include: walletInclude,
  });

  const transaction = await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: input.type,
      amount: input.amount,
      balanceBefore,
      balanceAfter,
      currency: wallet.currency,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      description: input.description,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      idempotencyKey: input.idempotencyKey,
      createdById: input.createdById,
    },
  });

  return { transaction, wallet: formatWallet(updatedWallet), duplicate: false };
}

export async function listWalletTransactions(
  walletId: string,
  page: number,
  limit: number,
) {
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where: { walletId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        createdBy: { include: { profile: true } },
      },
    }),
    prisma.walletTransaction.count({ where: { walletId } }),
  ]);

  return {
    transactions: rows.map(formatTransaction),
    total,
  };
}

export async function setWalletStatus(
  walletId: string,
  status: WalletStatus,
  actorId?: string,
) {
  assertLocalWalletMutation();
  const existing = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!existing) throw new NotFoundError('Wallet not found');

  const wallet = await prisma.wallet.update({
    where: { id: walletId },
    data: { status },
    include: walletInclude,
  });

  if (actorId && existing.status !== status) {
    await prisma.auditLog.create({
      data: {
        actorId,
        targetUserId: wallet.userId ?? undefined,
        action: 'finance.wallet.status_changed',
        details: {
          walletId,
          from: existing.status,
          to: status,
        },
      },
    });
  }

  return formatWallet(wallet);
}
