import {
  PlatformRole,
  Prisma,
  PayoutRequestStatus,
  WalletAdjustmentDirection,
  WalletAdjustmentStatus,
  WalletOwnerType,
  WalletStatus,
  WalletTransactionType,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';
import {
  ensureFleetWallet,
  ensureUserWallet,
  formatTransaction,
  formatWallet,
  getWalletById,
  listWalletTransactions,
  postLedgerEntry,
  setWalletStatus,
} from './wallet.service';

async function assertFleetAccess(fleetCompanyId: string, userId: string, roles: PlatformRole[]) {
  if (roles.includes(PlatformRole.SUPER_ADMIN) || roles.includes(PlatformRole.ADMIN)) {
    return;
  }

  const fleet = await prisma.fleetCompany.findFirst({
    where: {
      id: fleetCompanyId,
      OR: [{ ownerUserId: userId }, { memberships: { some: { userId, status: 'active' } } }],
    },
  });

  if (!fleet) {
    throw new ForbiddenError('Fleet access denied');
  }
}

function formatAdjustment(row: {
  id: string;
  walletId: string;
  direction: WalletAdjustmentDirection;
  amount: Prisma.Decimal;
  currency: string;
  reason: string;
  topupMethod: string | null;
  externalRef: string | null;
  status: WalletAdjustmentStatus;
  requestedById: string;
  reviewedById: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  transactionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  wallet?: {
    id: string;
    ownerType: WalletOwnerType;
    currency: string;
    user?: { profile?: { fullName: string | null } | null; email: string | null } | null;
    fleetCompany?: { legalName: string } | null;
  };
  requestedBy?: { id: string; email: string | null; profile?: { fullName: string | null } | null };
  reviewedBy?: { id: string; email: string | null; profile?: { fullName: string | null } | null } | null;
}) {
  return {
    id: row.id,
    walletId: row.walletId,
    direction: row.direction,
    amount: Number(row.amount),
    currency: row.currency,
    reason: row.reason,
    topupMethod: row.topupMethod,
    externalRef: row.externalRef,
    status: row.status,
    requestedById: row.requestedById,
    reviewedById: row.reviewedById,
    reviewedAt: row.reviewedAt,
    reviewNote: row.reviewNote,
    transactionId: row.transactionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    wallet: row.wallet
      ? {
          id: row.wallet.id,
          ownerType: row.wallet.ownerType,
          currency: row.wallet.currency,
          ownerLabel:
            row.wallet.user?.profile?.fullName ??
            row.wallet.user?.email ??
            row.wallet.fleetCompany?.legalName ??
            'Wallet',
        }
      : undefined,
    requestedBy: row.requestedBy
      ? {
          id: row.requestedBy.id,
          email: row.requestedBy.email,
          fullName: row.requestedBy.profile?.fullName ?? null,
        }
      : undefined,
    reviewedBy: row.reviewedBy
      ? {
          id: row.reviewedBy.id,
          email: row.reviewedBy.email,
          fullName: row.reviewedBy.profile?.fullName ?? null,
        }
      : null,
  };
}

function formatPayout(row: {
  id: string;
  walletId: string;
  amount: Prisma.Decimal;
  currency: string;
  bankName: string | null;
  accountNumber: string | null;
  accountTitle: string | null;
  status: PayoutRequestStatus;
  requestedById: string;
  reviewedById: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  transactionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  wallet?: {
    id: string;
    ownerType: WalletOwnerType;
    currency: string;
    user?: { profile?: { fullName: string | null } | null; email: string | null } | null;
    fleetCompany?: { legalName: string } | null;
  };
  requestedBy?: { id: string; email: string | null; profile?: { fullName: string | null } | null };
  reviewedBy?: { id: string; email: string | null; profile?: { fullName: string | null } | null } | null;
}) {
  return {
    id: row.id,
    walletId: row.walletId,
    amount: Number(row.amount),
    currency: row.currency,
    bankName: row.bankName,
    accountNumber: row.accountNumber,
    accountTitle: row.accountTitle,
    status: row.status,
    requestedById: row.requestedById,
    reviewedById: row.reviewedById,
    reviewedAt: row.reviewedAt,
    reviewNote: row.reviewNote,
    transactionId: row.transactionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    wallet: row.wallet
      ? {
          id: row.wallet.id,
          ownerType: row.wallet.ownerType,
          currency: row.wallet.currency,
          ownerLabel:
            row.wallet.user?.profile?.fullName ??
            row.wallet.user?.email ??
            row.wallet.fleetCompany?.legalName ??
            'Wallet',
        }
      : undefined,
    requestedBy: row.requestedBy
      ? {
          id: row.requestedBy.id,
          email: row.requestedBy.email,
          fullName: row.requestedBy.profile?.fullName ?? null,
        }
      : undefined,
    reviewedBy: row.reviewedBy
      ? {
          id: row.reviewedBy.id,
          email: row.reviewedBy.email,
          fullName: row.reviewedBy.profile?.fullName ?? null,
        }
      : null,
  };
}

export async function getFinanceSummary() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [
    walletCounts,
    walletByCurrency,
    pendingAdjustments,
    pendingPayouts,
    recentVolume,
    volumeByCurrency,
    totalWallets,
    negativeWallets,
    frozenStats,
    todayTransactions,
  ] = await Promise.all([
      prisma.wallet.groupBy({
        by: ['ownerType'],
        _count: { _all: true },
        _sum: { balance: true },
      }),
      prisma.wallet.groupBy({
        by: ['currency'],
        _count: { _all: true },
        _sum: { balance: true },
        orderBy: { currency: 'asc' },
      }),
      prisma.walletAdjustment.count({ where: { status: WalletAdjustmentStatus.pending } }),
      prisma.payoutRequest.count({ where: { status: PayoutRequestStatus.pending } }),
      prisma.walletTransaction.aggregate({
        _sum: { amount: true },
        where: {
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.walletTransaction.groupBy({
        by: ['currency'],
        _sum: { amount: true },
        where: {
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        orderBy: { currency: 'asc' },
      }),
      prisma.wallet.count(),
      prisma.wallet.count({ where: { balance: { lt: 0 } } }),
      prisma.wallet.aggregate({
        where: { status: WalletStatus.frozen },
        _count: { _all: true },
        _sum: { balance: true },
      }),
      prisma.walletTransaction.count({
        where: { createdAt: { gte: startOfToday } },
      }),
    ]);

  return {
    totalWallets,
    negativeWallets,
    frozenWalletCount: frozenStats._count._all,
    frozenBalance: Number(frozenStats._sum.balance ?? 0),
    todayTransactionCount: todayTransactions,
    walletsByType: walletCounts.map((row) => ({
      ownerType: row.ownerType,
      count: row._count._all,
      totalBalance: Number(row._sum.balance ?? 0),
    })),
    balancesByCurrency: walletByCurrency.map((row) => ({
      currency: row.currency,
      count: row._count._all,
      totalBalance: Number(row._sum.balance ?? 0),
    })),
    volumeByCurrency: volumeByCurrency.map((row) => ({
      currency: row.currency,
      totalVolume: Number(row._sum.amount ?? 0),
    })),
    pendingAdjustments,
    pendingPayouts,
    last24hTransactionVolume: Number(recentVolume._sum.amount ?? 0),
  };
}

export async function listWallets(query: {
  page: number;
  limit: number;
  ownerType?: WalletOwnerType;
  regionId?: string;
  status?: WalletStatus;
  search?: string;
  fleetCompanyId?: string;
  currency?: string;
  balanceMin?: number;
  balanceMax?: number;
  updatedFrom?: string;
  updatedTo?: string;
  ids?: string;
}) {
  const where: Prisma.WalletWhereInput = {};

  if (query.ids) {
    const idList = query.ids.split(',').map((s) => s.trim()).filter(Boolean);
    if (idList.length) where.id = { in: idList };
  }

  if (query.ownerType) where.ownerType = query.ownerType;
  if (query.regionId) where.regionId = query.regionId;
  if (query.status) where.status = query.status;
  if (query.fleetCompanyId) where.fleetCompanyId = query.fleetCompanyId;
  if (query.currency) where.currency = query.currency;

  if (query.balanceMin !== undefined || query.balanceMax !== undefined) {
    where.balance = {};
    if (query.balanceMin !== undefined) where.balance.gte = query.balanceMin;
    if (query.balanceMax !== undefined) where.balance.lte = query.balanceMax;
  }

  if (query.updatedFrom || query.updatedTo) {
    where.updatedAt = {};
    if (query.updatedFrom) where.updatedAt.gte = new Date(query.updatedFrom);
    if (query.updatedTo) where.updatedAt.lte = new Date(query.updatedTo);
  }

  if (query.search) {
    where.OR = [
      { user: { email: { contains: query.search, mode: 'insensitive' } } },
      { user: { phone: { contains: query.search } } },
      { user: { profile: { fullName: { contains: query.search, mode: 'insensitive' } } } },
      { fleetCompany: { legalName: { contains: query.search, mode: 'insensitive' } } },
      { id: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const skip = (query.page - 1) * query.limit;
  const [wallets, total] = await Promise.all([
    prisma.wallet.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip,
      take: query.limit,
      include: {
        user: { include: { profile: true } },
        fleetCompany: { include: { region: { select: { code: true, name: true } } } },
        region: { select: { id: true, code: true, name: true } },
      },
    }),
    prisma.wallet.count({ where }),
  ]);

  const walletIds = wallets.map((w) => w.id);
  const [pendingPayouts, lastTransactions] = await Promise.all([
    walletIds.length
      ? prisma.payoutRequest.groupBy({
          by: ['walletId'],
          where: { walletId: { in: walletIds }, status: PayoutRequestStatus.pending },
          _sum: { amount: true },
        })
      : Promise.resolve([]),
    walletIds.length
      ? Promise.all(
          walletIds.map((walletId) =>
            prisma.walletTransaction.findFirst({
              where: { walletId },
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                type: true,
                amount: true,
                currency: true,
                description: true,
                createdAt: true,
              },
            }),
          ),
        )
      : Promise.resolve([]),
  ]);

  const pendingMap = new Map(
    pendingPayouts.map((row) => [row.walletId, Number(row._sum.amount ?? 0)]),
  );
  const lastTxMap = new Map(
    walletIds.map((id, index) => [id, lastTransactions[index] ?? null]),
  );

  return {
    wallets: wallets.map((wallet) => {
      const formatted = formatWallet(wallet);
      const pendingBalance = pendingMap.get(wallet.id) ?? 0;
      const lastTx = lastTxMap.get(wallet.id);
      return {
        ...formatted,
        pendingBalance,
        availableBalance: Number((formatted.balance - pendingBalance).toFixed(2)),
        lastTransaction: lastTx
          ? {
              id: lastTx.id,
              type: lastTx.type,
              amount: Number(lastTx.amount),
              currency: lastTx.currency,
              description: lastTx.description,
              createdAt: lastTx.createdAt,
            }
          : null,
      };
    }),
    total,
  };
}

const walletLookupInclude = {
  user: { include: { profile: true } },
  fleetCompany: { include: { region: { select: { code: true, name: true } } } },
  region: { select: { id: true, code: true, name: true } },
} as const;

export async function lookupWalletsByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new ValidationError('Email is required');

  const wallets = await prisma.wallet.findMany({
    where: {
      OR: [
        {
          ownerType: WalletOwnerType.user,
          user: { email: { equals: normalized, mode: 'insensitive' } },
        },
        {
          ownerType: WalletOwnerType.fleet,
          fleetCompany: {
            owner: { email: { equals: normalized, mode: 'insensitive' } },
          },
        },
      ],
    },
    include: walletLookupInclude,
    orderBy: [{ ownerType: 'asc' }, { updatedAt: 'desc' }],
  });

  return wallets.map(formatWallet);
}

export async function listAdjustments(query: {
  page: number;
  limit: number;
  status?: WalletAdjustmentStatus;
  walletId?: string;
}) {
  const where: Prisma.WalletAdjustmentWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.walletId) where.walletId = query.walletId;

  const skip = (query.page - 1) * query.limit;
  const [rows, total] = await Promise.all([
    prisma.walletAdjustment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: query.limit,
      include: {
        wallet: {
          include: {
            user: { include: { profile: true } },
            fleetCompany: true,
          },
        },
        requestedBy: { include: { profile: true } },
        reviewedBy: { include: { profile: true } },
      },
    }),
    prisma.walletAdjustment.count({ where }),
  ]);

  return {
    adjustments: rows.map(formatAdjustment),
    total,
  };
}

export async function listPayouts(query: {
  page: number;
  limit: number;
  status?: PayoutRequestStatus;
  walletId?: string;
}) {
  const where: Prisma.PayoutRequestWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.walletId) where.walletId = query.walletId;

  const skip = (query.page - 1) * query.limit;
  const [rows, total] = await Promise.all([
    prisma.payoutRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: query.limit,
      include: {
        wallet: {
          include: {
            user: { include: { profile: true } },
            fleetCompany: true,
          },
        },
        requestedBy: { include: { profile: true } },
        reviewedBy: { include: { profile: true } },
      },
    }),
    prisma.payoutRequest.count({ where }),
  ]);

  return {
    payouts: rows.map(formatPayout),
    total,
  };
}

export async function listGlobalTransactions(query: {
  page: number;
  limit: number;
  walletId?: string;
  type?: WalletTransactionType;
}) {
  const where: Prisma.WalletTransactionWhereInput = {};
  if (query.walletId) where.walletId = query.walletId;
  if (query.type) where.type = query.type;

  const skip = (query.page - 1) * query.limit;
  const [rows, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: query.limit,
      include: {
        createdBy: { include: { profile: true } },
        wallet: {
          include: {
            user: { include: { profile: true } },
            fleetCompany: true,
          },
        },
      },
    }),
    prisma.walletTransaction.count({ where }),
  ]);

  return {
    transactions: rows.map((row) => ({
      ...formatTransaction(row),
      wallet: row.wallet
        ? {
            id: row.wallet.id,
            ownerType: row.wallet.ownerType,
            ownerLabel:
              row.wallet.user?.profile?.fullName ??
              row.wallet.user?.email ??
              row.wallet.fleetCompany?.legalName ??
              'Wallet',
          }
        : null,
    })),
    total,
  };
}

export async function createWalletAdjustment(
  actorId: string,
  data: {
    walletId: string;
    direction: WalletAdjustmentDirection;
    amount: number;
    reason: string;
    topupMethod?: string;
    externalRef?: string;
  },
) {
  const wallet = await prisma.wallet.findUnique({ where: { id: data.walletId } });
  if (!wallet) throw new NotFoundError('Wallet not found');

  const adjustment = await prisma.walletAdjustment.create({
    data: {
      walletId: data.walletId,
      direction: data.direction,
      amount: data.amount,
      currency: wallet.currency,
      reason: data.reason,
      topupMethod: data.topupMethod as never,
      externalRef: data.externalRef,
      requestedById: actorId,
      status: WalletAdjustmentStatus.pending,
    },
    include: {
      wallet: {
        include: {
          user: { include: { profile: true } },
          fleetCompany: true,
        },
      },
      requestedBy: { include: { profile: true } },
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId,
      action: 'finance.adjustment.requested',
      details: {
        adjustmentId: adjustment.id,
        walletId: adjustment.walletId,
        direction: adjustment.direction,
        amount: Number(adjustment.amount),
      },
    },
  });

  return formatAdjustment(adjustment);
}

export async function reviewWalletAdjustment(
  actorId: string,
  actorRoles: PlatformRole[],
  adjustmentId: string,
  action: 'approve' | 'reject',
  reviewNote?: string,
) {
  const adjustment = await prisma.walletAdjustment.findUnique({
    where: { id: adjustmentId },
    include: { wallet: true },
  });

  if (!adjustment) throw new NotFoundError('Adjustment not found');
  if (adjustment.status !== WalletAdjustmentStatus.pending) {
    throw new ValidationError('Adjustment is not pending');
  }
  const isSuperAdmin = actorRoles.includes(PlatformRole.SUPER_ADMIN);
  if (adjustment.requestedById === actorId && !isSuperAdmin) {
    throw new ForbiddenError('You cannot approve your own adjustment request');
  }

  if (action === 'reject') {
    const rejected = await prisma.walletAdjustment.update({
      where: { id: adjustmentId },
      data: {
        status: WalletAdjustmentStatus.rejected,
        reviewedById: actorId,
        reviewedAt: new Date(),
        reviewNote,
      },
      include: {
        wallet: { include: { user: { include: { profile: true } }, fleetCompany: true } },
        requestedBy: { include: { profile: true } },
        reviewedBy: { include: { profile: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId,
        action: 'finance.adjustment.rejected',
        details: { adjustmentId, reviewNote },
      },
    });

    return formatAdjustment(rejected);
  }

  const txType =
    adjustment.direction === WalletAdjustmentDirection.credit
      ? WalletTransactionType.adjustment_credit
      : WalletTransactionType.adjustment_debit;

  const result = await prisma.$transaction(async (tx) => {
    const ledger = await postLedgerEntry(
      {
        walletId: adjustment.walletId,
        type: txType,
        amount: Number(adjustment.amount),
        description: adjustment.reason,
        referenceType: 'wallet_adjustment',
        referenceId: adjustment.id,
        metadata: {
          topupMethod: adjustment.topupMethod,
          externalRef: adjustment.externalRef,
        },
        createdById: actorId,
        allowNegative: adjustment.direction === WalletAdjustmentDirection.debit,
      },
      tx,
    );

    const approved = await tx.walletAdjustment.update({
      where: { id: adjustmentId },
      data: {
        status: WalletAdjustmentStatus.approved,
        reviewedById: actorId,
        reviewedAt: new Date(),
        reviewNote,
        transactionId: ledger.transaction.id,
      },
      include: {
        wallet: { include: { user: { include: { profile: true } }, fleetCompany: true } },
        requestedBy: { include: { profile: true } },
        reviewedBy: { include: { profile: true } },
      },
    });

    return approved;
  });

  await prisma.auditLog.create({
    data: {
      actorId,
      action: 'finance.adjustment.approved',
      details: { adjustmentId, transactionId: result.transactionId },
    },
  });

  return formatAdjustment(result);
}

export async function applyWalletPenalty(
  actorId: string,
  userId: string,
  amount: number,
  reason: string,
  ipAddress?: string,
) {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) throw new NotFoundError('Wallet not found');

  const result = await prisma.$transaction(async (tx) => {
    const ledger = await postLedgerEntry(
      {
        walletId: wallet.id,
        type: WalletTransactionType.penalty,
        amount,
        description: reason,
        referenceType: 'user',
        referenceId: userId,
        createdById: actorId,
        allowNegative: true,
      },
      tx,
    );

    await tx.abuseRecord.create({
      data: {
        userId,
        action: 'financial_penalty',
        reason,
        metadata: { amount, transactionId: ledger.transaction.id },
        createdBy: actorId,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        targetUserId: userId,
        action: 'user.penalty',
        details: { amount, reason, transactionId: ledger.transaction.id },
        ipAddress,
      },
    });

    return ledger;
  });

  return {
    applied: true,
    amount,
    wallet: result.wallet,
    transactionId: result.transaction.id,
  };
}

export async function getFleetFinanceForUser(
  fleetCompanyId: string,
  userId: string,
  roles: PlatformRole[],
) {
  await assertFleetAccess(fleetCompanyId, userId, roles);

  const fleet = await prisma.fleetCompany.findUnique({
    where: { id: fleetCompanyId },
    include: { region: true },
  });
  if (!fleet) throw new NotFoundError('Fleet not found');

  let wallet = await prisma.wallet.findUnique({
    where: { fleetCompanyId },
    include: {
      user: { include: { profile: true } },
      fleetCompany: { include: { region: { select: { code: true, name: true } } } },
      region: { select: { id: true, code: true, name: true } },
    },
  });

  if (!wallet) {
    await ensureFleetWallet(fleetCompanyId, fleet.regionId, fleet.region.currency);
    wallet = await prisma.wallet.findUniqueOrThrow({
      where: { fleetCompanyId },
      include: {
        user: { include: { profile: true } },
        fleetCompany: { include: { region: { select: { code: true, name: true } } } },
        region: { select: { id: true, code: true, name: true } },
      },
    });
  }

  return formatWallet(wallet);
}

export async function createPayoutRequest(
  actorId: string,
  roles: PlatformRole[],
  data: {
    walletId: string;
    amount: number;
    bankName?: string;
    accountNumber?: string;
    accountTitle?: string;
  },
) {
  const wallet = await prisma.wallet.findUnique({ where: { id: data.walletId } });
  if (!wallet) throw new NotFoundError('Wallet not found');

  if (wallet.ownerType === WalletOwnerType.fleet && wallet.fleetCompanyId) {
    await assertFleetAccess(wallet.fleetCompanyId, actorId, roles);
  }

  if (Number(wallet.balance) < data.amount) {
    throw new ValidationError('Insufficient wallet balance for payout request');
  }

  return prisma.payoutRequest.create({
    data: {
      walletId: data.walletId,
      amount: data.amount,
      currency: wallet.currency,
      bankName: data.bankName,
      accountNumber: data.accountNumber,
      accountTitle: data.accountTitle,
      requestedById: actorId,
      status: PayoutRequestStatus.pending,
    },
  });
}

export async function reviewPayoutRequest(
  actorId: string,
  actorRoles: PlatformRole[],
  payoutId: string,
  action: 'approve' | 'reject',
  reviewNote?: string,
) {
  const payout = await prisma.payoutRequest.findUnique({ where: { id: payoutId } });
  if (!payout) throw new NotFoundError('Payout request not found');
  if (payout.status !== PayoutRequestStatus.pending) {
    throw new ValidationError('Payout request is not pending');
  }
  const isSuperAdmin = actorRoles.includes(PlatformRole.SUPER_ADMIN);
  if (payout.requestedById === actorId && !isSuperAdmin) {
    throw new ForbiddenError('You cannot approve your own payout request');
  }

  if (action === 'reject') {
    const rejected = await prisma.payoutRequest.update({
      where: { id: payoutId },
      data: {
        status: PayoutRequestStatus.rejected,
        reviewedById: actorId,
        reviewedAt: new Date(),
        reviewNote,
      },
      include: {
        wallet: { include: { user: { include: { profile: true } }, fleetCompany: true } },
        requestedBy: { include: { profile: true } },
        reviewedBy: { include: { profile: true } },
      },
    });

    return formatPayout(rejected);
  }

  const result = await prisma.$transaction(async (tx) => {
    const ledger = await postLedgerEntry(
      {
        walletId: payout.walletId,
        type: WalletTransactionType.payout,
        amount: Number(payout.amount),
        description: `Payout to ${payout.accountTitle ?? 'bank account'}`,
        referenceType: 'payout_request',
        referenceId: payout.id,
        createdById: actorId,
      },
      tx,
    );

    return tx.payoutRequest.update({
      where: { id: payoutId },
      data: {
        status: PayoutRequestStatus.completed,
        reviewedById: actorId,
        reviewedAt: new Date(),
        reviewNote,
        transactionId: ledger.transaction.id,
      },
      include: {
        wallet: { include: { user: { include: { profile: true } }, fleetCompany: true } },
        requestedBy: { include: { profile: true } },
        reviewedBy: { include: { profile: true } },
      },
    });
  });

  return formatPayout(result);
}

export async function getWalletDashboardDetail(walletId: string) {
  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
    include: walletLookupInclude,
  });
  if (!wallet) throw new NotFoundError('Wallet not found');

  const [pendingPayoutSum, recentTransactions, recentAdjustments, recentPayouts, auditLogs, notes] =
    await Promise.all([
      prisma.payoutRequest.aggregate({
        where: { walletId, status: PayoutRequestStatus.pending },
        _sum: { amount: true },
      }),
      prisma.walletTransaction.findMany({
        where: { walletId },
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: { createdBy: { include: { profile: true } } },
      }),
      prisma.walletAdjustment.findMany({
        where: { walletId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          requestedBy: { include: { profile: true } },
          reviewedBy: { include: { profile: true } },
        },
      }),
      prisma.payoutRequest.findMany({
        where: { walletId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          requestedBy: { include: { profile: true } },
          reviewedBy: { include: { profile: true } },
        },
      }),
      prisma.auditLog.findMany({
        where: {
          action: { startsWith: 'finance.' },
          details: { path: ['walletId'], equals: walletId },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: {
          actor: { include: { profile: true } },
        },
      }),
      prisma.auditLog.findMany({
        where: {
          action: 'finance.wallet.note',
          details: { path: ['walletId'], equals: walletId },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { actor: { include: { profile: true } } },
      }),
    ]);

  const pendingBalance = Number(pendingPayoutSum._sum.amount ?? 0);
  const formatted = formatWallet(wallet);

  return {
    wallet: {
      ...formatted,
      pendingBalance,
      availableBalance: Number((formatted.balance - pendingBalance).toFixed(2)),
    },
    recentTransactions: recentTransactions.map(formatTransaction),
    recentAdjustments: recentAdjustments.map(formatAdjustment),
    recentPayouts: recentPayouts.map(formatPayout),
    auditHistory: auditLogs.map((row) => ({
      id: row.id,
      action: row.action,
      details: row.details,
      createdAt: row.createdAt,
      actor: row.actor
        ? {
            id: row.actor.id,
            email: row.actor.email,
            fullName: row.actor.profile?.fullName ?? null,
          }
        : null,
    })),
    notes: notes.map((row) => ({
      id: row.id,
      content: (row.details as { content?: string }).content ?? '',
      createdAt: row.createdAt,
      author: row.actor
        ? {
            id: row.actor.id,
            email: row.actor.email,
            fullName: row.actor.profile?.fullName ?? null,
          }
        : null,
    })),
  };
}

export async function createAdminWallet(
  actorId: string,
  data: { ownerType: 'user' | 'fleet'; userId?: string; fleetCompanyId?: string; currency?: string },
) {
  if (data.ownerType === 'user') {
    if (!data.userId) throw new ValidationError('userId is required for user wallets');
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundError('User not found');
    const existing = await prisma.wallet.findUnique({ where: { userId: data.userId } });
    if (existing) throw new ValidationError('User already has a wallet');

    const wallet = await prisma.wallet.create({
      data: {
        ownerType: WalletOwnerType.user,
        userId: data.userId,
        currency: data.currency ?? 'PKR',
      },
      include: walletLookupInclude,
    });

    await prisma.auditLog.create({
      data: {
        actorId,
        targetUserId: data.userId,
        action: 'finance.wallet.created',
        details: { walletId: wallet.id, ownerType: 'user' },
      },
    });

    return formatWallet(wallet);
  }

  if (!data.fleetCompanyId) throw new ValidationError('fleetCompanyId is required for fleet wallets');
  const fleet = await prisma.fleetCompany.findUnique({
    where: { id: data.fleetCompanyId },
    include: { region: true },
  });
  if (!fleet) throw new NotFoundError('Fleet not found');
  const existing = await prisma.wallet.findUnique({ where: { fleetCompanyId: data.fleetCompanyId } });
  if (existing) throw new ValidationError('Fleet already has a wallet');

  const wallet = await prisma.wallet.create({
    data: {
      ownerType: WalletOwnerType.fleet,
      fleetCompanyId: data.fleetCompanyId,
      regionId: fleet.regionId,
      currency: data.currency ?? fleet.region.currency,
    },
    include: walletLookupInclude,
  });

  await prisma.auditLog.create({
    data: {
      actorId,
      action: 'finance.wallet.created',
      details: { walletId: wallet.id, ownerType: 'fleet', fleetCompanyId: data.fleetCompanyId },
    },
  });

  return formatWallet(wallet);
}

export async function bulkSetWalletStatus(
  actorId: string,
  walletIds: string[],
  status: WalletStatus,
) {
  const results = [];
  for (const walletId of walletIds) {
    const updated = await setWalletStatus(walletId, status, actorId);
    results.push(updated);
  }
  return { updated: results.length, wallets: results };
}

export async function exportWalletsCsv(query: {
  ownerType?: WalletOwnerType;
  regionId?: string;
  status?: WalletStatus;
  search?: string;
  currency?: string;
  balanceMin?: number;
  balanceMax?: number;
  updatedFrom?: string;
  updatedTo?: string;
  ids?: string;
}) {
  const { wallets } = await listWallets({ ...query, page: 1, limit: 10000 });
  const header = [
    'Wallet ID',
    'Owner',
    'Owner Type',
    'Currency',
    'Balance',
    'Available Balance',
    'Pending Balance',
    'Status',
    'Last Transaction',
    'Updated At',
  ];
  const rows = wallets.map((w) => [
    w.id,
    w.ownerLabel,
    w.ownerType,
    w.currency,
    String(w.balance),
    String(w.availableBalance ?? w.balance),
    String(w.pendingBalance ?? 0),
    w.status,
    w.lastTransaction?.createdAt
      ? new Date(w.lastTransaction.createdAt).toISOString()
      : '',
    w.updatedAt instanceof Date ? w.updatedAt.toISOString() : String(w.updatedAt),
  ]);
  const escape = (value: string | Date) => `"${String(value).replace(/"/g, '""')}"`;
  return [header, ...rows].map((row) => row.map(escape).join(',')).join('\n');
}

export async function addWalletNote(actorId: string, walletId: string, content: string) {
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) throw new NotFoundError('Wallet not found');

  const note = await prisma.auditLog.create({
    data: {
      actorId,
      targetUserId: wallet.userId ?? undefined,
      action: 'finance.wallet.note',
      details: { walletId, content },
    },
    include: { actor: { include: { profile: true } } },
  });

  return {
    id: note.id,
    content,
    createdAt: note.createdAt,
    author: note.actor
      ? {
          id: note.actor.id,
          email: note.actor.email,
          fullName: note.actor.profile?.fullName ?? null,
        }
      : null,
  };
}

export { getWalletById, listWalletTransactions, setWalletStatus };

/**
 * Capture passenger payment + credit driver earnings for a completed ride.
 * Idempotent per ride via ledger idempotency keys.
 */
export async function captureRideFare(input: {
  rideId: string;
  passengerUserId: string;
  driverUserId: string;
  amount: number;
  currency: string;
}) {
  const { rideId, passengerUserId, driverUserId, amount } = input;
  if (amount <= 0) {
    return { applied: false, reason: 'zero_amount' as const };
  }

  await ensureUserWallet(passengerUserId, input.currency);
  await ensureUserWallet(driverUserId, input.currency);

  const passengerWallet = await prisma.wallet.findUniqueOrThrow({
    where: { userId: passengerUserId },
  });
  const driverWallet = await prisma.wallet.findUniqueOrThrow({
    where: { userId: driverUserId },
  });

  return prisma.$transaction(async (tx) => {
    const debit = await postLedgerEntry(
      {
        walletId: passengerWallet.id,
        type: WalletTransactionType.ride_payment,
        amount,
        description: `Trip fare ${rideId}`,
        referenceType: 'ride',
        referenceId: rideId,
        idempotencyKey: `ride_payment:${rideId}`,
        allowNegative: true,
      },
      tx,
    );

    const credit = await postLedgerEntry(
      {
        walletId: driverWallet.id,
        type: WalletTransactionType.ride_earnings,
        amount,
        description: `Trip earnings ${rideId}`,
        referenceType: 'ride',
        referenceId: rideId,
        idempotencyKey: `ride_earnings:${rideId}`,
      },
      tx,
    );

    await tx.auditLog.create({
      data: {
        actorId: passengerUserId,
        targetUserId: driverUserId,
        action: 'finance.ride.captured',
        details: {
          rideId,
          amount,
          debitTx: debit.transaction.id,
          creditTx: credit.transaction.id,
          debitDuplicate: debit.duplicate,
          creditDuplicate: credit.duplicate,
        },
      },
    });

    return {
      applied: true as const,
      amount,
      debitTransactionId: debit.transaction.id,
      creditTransactionId: credit.transaction.id,
      duplicate: Boolean(debit.duplicate || credit.duplicate),
    };
  });
}

/**
 * Refund a captured ride payment to the passenger (finance-only wallet writes).
 */
export async function refundRidePayment(input: {
  rideId: string;
  passengerUserId: string;
  amount: number;
  currency: string;
  actorUserId?: string;
}) {
  const { rideId, passengerUserId, amount } = input;
  if (amount <= 0) {
    return { applied: false, reason: 'zero_amount' as const };
  }

  await ensureUserWallet(passengerUserId, input.currency);
  const passengerWallet = await prisma.wallet.findUniqueOrThrow({
    where: { userId: passengerUserId },
  });

  const ledger = await postLedgerEntry({
    walletId: passengerWallet.id,
    type: WalletTransactionType.refund,
    amount,
    description: `Trip refund ${rideId}`,
    referenceType: 'ride',
    referenceId: rideId,
    idempotencyKey: `ride_refund:${rideId}`,
    createdById: input.actorUserId,
  });

  await prisma.auditLog.create({
    data: {
      actorId: input.actorUserId ?? passengerUserId,
      targetUserId: passengerUserId,
      action: 'finance.ride.refunded',
      details: {
        rideId,
        amount,
        transactionId: ledger.transaction.id,
        duplicate: ledger.duplicate,
      },
    },
  });

  return {
    applied: true as const,
    amount,
    transactionId: ledger.transaction.id,
    duplicate: ledger.duplicate,
  };
}

