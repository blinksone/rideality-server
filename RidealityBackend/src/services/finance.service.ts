import {
  FleetMemberRole,
  FleetMemberStatus,
  PlatformRole,
  Prisma,
  PayoutRequestStatus,
  WalletAdjustmentDirection,
  WalletAdjustmentStatus,
  WalletOwnerType,
  WalletStatus,
  WalletTransactionType,
  FleetNotificationType,
  TopupMethod,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';
import type { AdminAssignmentRecord } from './admin-scope.service';
import {
  ensureFleetWallet,
  ensurePlatformWallet,
  ensureUserWallet,
  formatTransaction,
  formatWallet,
  getWalletById,
  listWalletTransactions,
  postLedgerEntry,
  setWalletStatus,
} from './wallet.service';
import { assertFleetAccess as assertFleetMembership } from './fleet-access';

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

export type FinanceActor = {
  userId: string;
  roles: PlatformRole[];
  assignment?: AdminAssignmentRecord | null;
};

function andWalletWhere(
  base: Prisma.WalletWhereInput,
  extra?: Prisma.WalletWhereInput,
): Prisma.WalletWhereInput {
  if (!extra || Object.keys(extra).length === 0) return base;
  if (Object.keys(base).length === 0) return extra;
  return { AND: [base, extra] };
}

async function ownedFleetCompanyIds(userId: string): Promise<string[]> {
  const companies = await prisma.fleetCompany.findMany({
    where: {
      OR: [
        { ownerUserId: userId },
        {
          memberships: {
            some: {
              userId,
              status: FleetMemberStatus.active,
              role: FleetMemberRole.owner,
            },
          },
        },
      ],
    },
    select: { id: true },
  });
  return companies.map((row) => row.id);
}

/** Restrict platform finance lists so Fleet Owner cannot see other fleets or city-admin wallets. */
export async function resolveFinanceWalletWhere(actor: FinanceActor): Promise<Prisma.WalletWhereInput> {
  const role = actor.assignment?.role ?? null;
  const unrestricted =
    actor.roles.includes(PlatformRole.SUPER_ADMIN) ||
    role === 'SUPER_ADMIN' ||
    role === 'GLOBAL_ADMIN' ||
    role === 'SUB_ADMIN' ||
    role === 'FINANCE_USER';
  if (unrestricted) return {};

  const isFleetOwner = role === 'FLEET_OWNER' || actor.roles.includes(PlatformRole.FLEET_OWNER);
  if (isFleetOwner) {
    const ids = await ownedFleetCompanyIds(actor.userId);
    if (!ids.length) return { id: { in: [] } };
    return {
      OR: [
        { fleetCompanyId: { in: ids } },
        { user: { driverProfile: { fleetCompanyId: { in: ids } } } },
      ],
    };
  }

  if (actor.assignment?.scopeType === 'CITY') {
    throw new ForbiddenError('Forbidden: outside your assigned scope');
  }
  if (actor.assignment?.scopeType === 'COUNTRY' && actor.assignment.countryId) {
    return { regionId: actor.assignment.countryId };
  }
  if (actor.assignment?.scopeType === 'REGIONAL' && actor.assignment.countryId) {
    return { regionId: actor.assignment.countryId };
  }
  if (actor.assignment?.scopeType === 'CONTINENT' && actor.assignment.continentId) {
    return { region: { continentId: actor.assignment.continentId } };
  }

  return { id: { in: [] } };
}

export async function assertFinanceWalletAccess(actor: FinanceActor, walletId: string) {
  const access = await resolveFinanceWalletWhere(actor);
  const wallet = await prisma.wallet.findFirst({
    where: andWalletWhere({ id: walletId }, access),
    select: { id: true },
  });
  if (!wallet) throw new ForbiddenError('Forbidden: outside your assigned scope');
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

export async function getFinanceSummary(accessWhere: Prisma.WalletWhereInput = {}) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const txWhere: Prisma.WalletTransactionWhereInput = { wallet: accessWhere };
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

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
        where: accessWhere,
        _count: { _all: true },
        _sum: { balance: true },
      }),
      prisma.wallet.groupBy({
        by: ['currency'],
        where: accessWhere,
        _count: { _all: true },
        _sum: { balance: true },
        orderBy: { currency: 'asc' },
      }),
      prisma.walletAdjustment.count({
        where: { status: WalletAdjustmentStatus.pending, wallet: accessWhere },
      }),
      prisma.payoutRequest.count({
        where: { status: PayoutRequestStatus.pending, wallet: accessWhere },
      }),
      prisma.walletTransaction.aggregate({
        _sum: { amount: true },
        where: { ...txWhere, createdAt: { gte: since24h } },
      }),
      prisma.walletTransaction.groupBy({
        by: ['currency'],
        _sum: { amount: true },
        where: { ...txWhere, createdAt: { gte: since24h } },
        orderBy: { currency: 'asc' },
      }),
      prisma.wallet.count({ where: accessWhere }),
      prisma.wallet.count({ where: andWalletWhere({ balance: { lt: 0 } }, accessWhere) }),
      prisma.wallet.aggregate({
        where: andWalletWhere({ status: WalletStatus.frozen }, accessWhere),
        _count: { _all: true },
        _sum: { balance: true },
      }),
      prisma.walletTransaction.count({
        where: { ...txWhere, createdAt: { gte: startOfToday } },
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
  continentId?: string;
  status?: WalletStatus;
  search?: string;
  fleetCompanyId?: string;
  currency?: string;
  balanceMin?: number;
  balanceMax?: number;
  updatedFrom?: string;
  updatedTo?: string;
  ids?: string;
  accessWhere?: Prisma.WalletWhereInput;
}) {
  const filters: Prisma.WalletWhereInput = {};

  if (query.ids) {
    const idList = query.ids.split(',').map((s) => s.trim()).filter(Boolean);
    if (idList.length) filters.id = { in: idList };
  }

  if (query.ownerType) filters.ownerType = query.ownerType;
  if (query.regionId) filters.regionId = query.regionId;
  if (query.continentId) filters.region = { continentId: query.continentId };
  if (query.status) filters.status = query.status;
  if (query.fleetCompanyId) filters.fleetCompanyId = query.fleetCompanyId;
  if (query.currency) filters.currency = query.currency;

  if (query.balanceMin !== undefined || query.balanceMax !== undefined) {
    filters.balance = {};
    if (query.balanceMin !== undefined) filters.balance.gte = query.balanceMin;
    if (query.balanceMax !== undefined) filters.balance.lte = query.balanceMax;
  }

  if (query.updatedFrom || query.updatedTo) {
    filters.updatedAt = {};
    if (query.updatedFrom) filters.updatedAt.gte = new Date(query.updatedFrom);
    if (query.updatedTo) filters.updatedAt.lte = new Date(query.updatedTo);
  }

  if (query.search) {
    filters.OR = [
      { user: { email: { contains: query.search, mode: 'insensitive' } } },
      { user: { phone: { contains: query.search } } },
      { user: { profile: { fullName: { contains: query.search, mode: 'insensitive' } } } },
      { fleetCompany: { legalName: { contains: query.search, mode: 'insensitive' } } },
      { id: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const where = andWalletWhere(filters, query.accessWhere);

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

export async function lookupWalletsByEmail(email: string, accessWhere: Prisma.WalletWhereInput = {}) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new ValidationError('Email is required');

  const wallets = await prisma.wallet.findMany({
    where: andWalletWhere(
      {
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
      accessWhere,
    ),
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
  accessWhere?: Prisma.WalletWhereInput;
}) {
  const where: Prisma.WalletAdjustmentWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.walletId) where.walletId = query.walletId;
  if (query.accessWhere && Object.keys(query.accessWhere).length) where.wallet = query.accessWhere;

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
  accessWhere?: Prisma.WalletWhereInput;
}) {
  const where: Prisma.PayoutRequestWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.walletId) where.walletId = query.walletId;
  if (query.accessWhere && Object.keys(query.accessWhere).length) where.wallet = query.accessWhere;

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
  accessWhere?: Prisma.WalletWhereInput;
}) {
  const where: Prisma.WalletTransactionWhereInput = {};
  if (query.walletId) where.walletId = query.walletId;
  if (query.type) where.type = query.type;
  if (query.accessWhere && Object.keys(query.accessWhere).length) where.wallet = query.accessWhere;

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
  continentId?: string;
  status?: WalletStatus;
  search?: string;
  currency?: string;
  balanceMin?: number;
  balanceMax?: number;
  updatedFrom?: string;
  updatedTo?: string;
  ids?: string;
  accessWhere?: Prisma.WalletWhereInput;
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
 * Capture passenger payment and split completed-ride proceeds:
 *   platform = bookingFee + commission% × (fare − bookingFee)
 *   fleet/driver = remainder
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

  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    include: {
      passenger: { select: { regionId: true } },
      driver: {
        select: {
          driverProfile: {
            select: { fleetCompanyId: true, commissionRateOverride: true },
          },
        },
      },
      fleetCompany: {
        select: {
          id: true,
          regionId: true,
          fleetTakePercent: true,
          region: { select: { currency: true } },
        },
      },
    },
  });

  const bookingFeeRaw = Number(ride?.bookingFee ?? 0);
  let commissionPercent = Number(ride?.platformCommissionPercent ?? 0);
  if (commissionPercent === 0 && ride?.passenger?.regionId) {
    const region = await prisma.region.findUnique({
      where: { id: ride.passenger.regionId },
      select: { platformCommissionPercent: true },
    });
    commissionPercent = Number(region?.platformCommissionPercent ?? 0);
  }

  const split = splitCompletedRideFare(amount, bookingFeeRaw, commissionPercent);
  const fleetCompanyId = ride?.fleetCompanyId ?? ride?.driver?.driverProfile?.fleetCompanyId ?? null;
  const regionId = ride?.passenger?.regionId ?? ride?.fleetCompany?.regionId ?? null;
  const operatorSplit = splitOperatorShare(
    split.operatorShare,
    ride && fleetCompanyId ? resolveFleetTakePercent(ride) : 0,
  );

  await ensureUserWallet(passengerUserId, input.currency);
  const passengerWallet = await prisma.wallet.findUniqueOrThrow({
    where: { userId: passengerUserId },
  });

  let fleetWalletId: string | null = null;
  let driverWalletId: string | null = null;
  if (split.operatorShare > 0) {
    if (fleetCompanyId && operatorSplit.fleetShare > 0) {
      const fleet =
        ride?.fleetCompany ??
        (await prisma.fleetCompany.findUnique({
          where: { id: fleetCompanyId },
          select: {
            id: true,
            regionId: true,
            fleetTakePercent: true,
            region: { select: { currency: true } },
          },
        }));
      if (!fleet) throw new NotFoundError('Fleet company not found');
      await ensureFleetWallet(
        fleetCompanyId,
        fleet.regionId,
        fleet.region?.currency ?? input.currency,
      );
      const fleetWallet = await prisma.wallet.findUniqueOrThrow({
        where: { fleetCompanyId },
      });
      fleetWalletId = fleetWallet.id;
    }

    if (operatorSplit.driverShare > 0) {
      await ensureUserWallet(driverUserId, input.currency);
      const driverWallet = await prisma.wallet.findUniqueOrThrow({
        where: { userId: driverUserId },
      });
      driverWalletId = driverWallet.id;
    }
  }

  let platformWalletId: string | null = null;
  if (split.platformTotal > 0) {
    if (!regionId) {
      throw new ValidationError('Cannot credit platform commission without a region');
    }
    const platformWallet = await ensurePlatformWallet(regionId, input.currency);
    platformWalletId = platformWallet.id;
  }

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
        metadata: {
          bookingFee: split.bookingFee,
          platformCommission: split.platformCommission,
          platformTotal: split.platformTotal,
          operatorShare: split.operatorShare,
          platformCommissionPercent: split.commissionPercent,
          fleetTakePercent: operatorSplit.fleetTakePercent,
          fleetShare: operatorSplit.fleetShare,
          driverShare: operatorSplit.driverShare,
        },
      },
      tx,
    );

    let commissionTxId: string | null = null;
    let commissionDuplicate = false;
    if (platformWalletId && split.platformTotal > 0) {
      const commission = await postLedgerEntry(
        {
          walletId: platformWalletId,
          type: WalletTransactionType.commission,
          amount: split.platformTotal,
          description: `Trip commission ${rideId}`,
          referenceType: 'ride',
          referenceId: rideId,
          idempotencyKey: `ride_commission:${rideId}`,
          metadata: {
            bookingFee: split.bookingFee,
            commission: split.platformCommission,
            percent: split.commissionPercent,
          },
        },
        tx,
      );
      commissionTxId = commission.transaction.id;
      commissionDuplicate = Boolean(commission.duplicate);
    }

    let fleetCreditTxId: string | null = null;
    let fleetCreditDuplicate = false;
    if (fleetWalletId && operatorSplit.fleetShare > 0) {
      const fleetCredit = await postLedgerEntry(
        {
          walletId: fleetWalletId,
          type: WalletTransactionType.ride_earnings,
          amount: operatorSplit.fleetShare,
          description: `Fleet trip share ${rideId}`,
          referenceType: 'ride',
          referenceId: rideId,
          idempotencyKey: `ride_fleet_earnings:${rideId}`,
          metadata: {
            fleetCompanyId,
            driverUserId,
            fleetTakePercent: operatorSplit.fleetTakePercent,
          },
        },
        tx,
      );
      fleetCreditTxId = fleetCredit.transaction.id;
      fleetCreditDuplicate = Boolean(fleetCredit.duplicate);
    }

    let creditTxId: string | null = null;
    let creditDuplicate = false;
    if (driverWalletId && operatorSplit.driverShare > 0) {
      const credit = await postLedgerEntry(
        {
          walletId: driverWalletId,
          type: WalletTransactionType.ride_earnings,
          amount: operatorSplit.driverShare,
          description: `Trip earnings ${rideId}`,
          referenceType: 'ride',
          referenceId: rideId,
          idempotencyKey: `ride_earnings:${rideId}`,
          metadata: {
            fleetCompanyId,
            driverUserId,
            fleetTakePercent: operatorSplit.fleetTakePercent,
          },
        },
        tx,
      );
      creditTxId = credit.transaction.id;
      creditDuplicate = Boolean(credit.duplicate);
    }

    await tx.auditLog.create({
      data: {
        actorId: passengerUserId,
        targetUserId: driverUserId,
        action: 'finance.ride.captured',
        details: {
          rideId,
          amount,
          bookingFee: split.bookingFee,
          platformCommission: split.platformCommission,
          platformTotal: split.platformTotal,
          operatorShare: split.operatorShare,
          fleetTakePercent: operatorSplit.fleetTakePercent,
          fleetShare: operatorSplit.fleetShare,
          driverShare: operatorSplit.driverShare,
          fleetCompanyId,
          debitTx: debit.transaction.id,
          commissionTx: commissionTxId,
          fleetCreditTx: fleetCreditTxId,
          creditTx: creditTxId,
          debitDuplicate: debit.duplicate,
          commissionDuplicate,
          fleetCreditDuplicate,
          creditDuplicate,
        },
      },
    });

    return {
      applied: true as const,
      amount,
      bookingFee: split.bookingFee,
      platformTotal: split.platformTotal,
      operatorShare: split.operatorShare,
      fleetShare: operatorSplit.fleetShare,
      driverShare: operatorSplit.driverShare,
      debitTransactionId: debit.transaction.id,
      commissionTransactionId: commissionTxId,
      fleetCreditTransactionId: fleetCreditTxId,
      creditTransactionId: creditTxId,
      duplicate: Boolean(
        debit.duplicate || commissionDuplicate || fleetCreditDuplicate || creditDuplicate,
      ),
    };
  });
}

function money(value: number): number {
  return Math.round(Number(value) * 100) / 100;
}

/** Platform keeps booking fee + % of the remaining fare; fleet/driver gets the rest. */
export function splitCompletedRideFare(
  amount: number,
  bookingFee: number,
  commissionPercent: number,
) {
  const fare = money(Math.max(0, amount));
  const fee = money(Math.min(Math.max(0, bookingFee), fare));
  const percent = Math.min(100, Math.max(0, commissionPercent));
  const commissionable = money(fare - fee);
  const platformCommission = money(commissionable * (percent / 100));
  const platformTotal = money(Math.min(fare, fee + platformCommission));
  const operatorShare = money(fare - platformTotal);
  return {
    bookingFee: fee,
    commissionPercent: percent,
    platformCommission,
    platformTotal,
    operatorShare,
  };
}

/** Fleet keeps fleetTakePercent of operator share; driver gets the remainder. */
export function splitOperatorShare(operatorShare: number, fleetTakePercent: number) {
  const net = money(Math.max(0, operatorShare));
  const percent = Math.min(100, Math.max(0, fleetTakePercent));
  const fleetShare = money(net * (percent / 100));
  const driverShare = money(net - fleetShare);
  return { fleetTakePercent: percent, fleetShare, driverShare };
}

function resolveFleetTakePercent(ride: {
  fleetTakePercent?: { toNumber?: () => number } | number | null;
  driver?: {
    driverProfile?: {
      commissionRateOverride?: { toNumber?: () => number } | number | null;
    } | null;
  } | null;
  fleetCompany?: {
    fleetTakePercent?: { toNumber?: () => number } | number | null;
  } | null;
}): number {
  const snap = Number(ride.fleetTakePercent ?? 0);
  if (snap > 0) return snap;
  const override = ride.driver?.driverProfile?.commissionRateOverride;
  if (override != null && Number(override) > 0) return Number(override);
  return Number(ride.fleetCompany?.fleetTakePercent ?? 0);
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

const driverCreditInclude = {
  wallet: {
    include: {
      user: { include: { profile: true } },
      fleetCompany: true,
    },
  },
  requestedBy: { include: { profile: true } },
  reviewedBy: { include: { profile: true } },
} as const;

function formatDriverCredit(row: Parameters<typeof formatAdjustment>[0] & {
  wallet?: {
    user?: {
      id?: string;
      phone?: string;
      profile?: { fullName: string | null } | null;
      email?: string | null;
    } | null;
  };
}) {
  const base = formatAdjustment(row);
  return {
    ...base,
    driverUserId: row.wallet?.user && 'id' in row.wallet.user ? row.wallet.user.id ?? null : null,
    driverPhone: row.wallet?.user && 'phone' in row.wallet.user ? row.wallet.user.phone ?? null : null,
  };
}

async function fleetDriverWalletIds(companyId: string, fleetRegionId: string | null) {
  const drivers = await prisma.driverProfile.findMany({
    where: {
      fleetCompanyId: companyId,
      ...(fleetRegionId ? { fleetRegionId } : {}),
    },
    select: { userId: true },
  });
  const wallets = await prisma.wallet.findMany({
    where: { userId: { in: drivers.map((d) => d.userId) } },
    select: { id: true },
  });
  return wallets.map((w) => w.id);
}

/** Fleet Finance requests a credit to a driver wallet; Fleet Owner must approve before it posts. */
export async function requestFleetDriverCredit(
  companyId: string,
  actorId: string,
  data: {
    driverUserId: string;
    amount: number;
    reason: string;
    topupMethod: TopupMethod | string;
    externalRef?: string;
  },
) {
  const access = await assertFleetMembership(companyId, actorId);
  if (!access.canRequestDriverCredit) {
    throw new ForbiddenError('Only fleet finance can request driver credits');
  }

  const driver = await prisma.driverProfile.findFirst({
    where: {
      userId: data.driverUserId,
      fleetCompanyId: companyId,
      ...(access.fleetRegionId ? { fleetRegionId: access.fleetRegionId } : {}),
    },
    include: {
      user: { select: { id: true, region: { select: { currency: true } }, profile: { select: { fullName: true } } } },
    },
  });
  if (!driver) throw new NotFoundError('Driver not found in this fleet city');

  const wallet = await ensureUserWallet(driver.userId, driver.user.region.currency);
  const adjustment = await prisma.walletAdjustment.create({
    data: {
      walletId: wallet.id,
      direction: WalletAdjustmentDirection.credit,
      amount: data.amount,
      currency: wallet.currency,
      reason: data.reason,
      topupMethod: data.topupMethod as TopupMethod,
      externalRef: data.externalRef,
      requestedById: actorId,
      status: WalletAdjustmentStatus.pending,
    },
    include: driverCreditInclude,
  });

  const company = await prisma.fleetCompany.findUnique({
    where: { id: companyId },
    select: { ownerUserId: true },
  });
  if (company?.ownerUserId) {
    const driverName = driver.user.profile?.fullName ?? 'A driver';
    await prisma.fleetNotification.create({
      data: {
        fleetCompanyId: companyId,
        userId: company.ownerUserId,
        type: FleetNotificationType.payout_status,
        title: 'Driver credit awaiting approval',
        body: `${driverName}: ${data.amount} ${wallet.currency} via ${String(data.topupMethod).replace('_', ' ')}. ${data.reason}`,
        metadata: { adjustmentId: adjustment.id, driverUserId: driver.userId },
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      actorId,
      fleetCompanyId: companyId,
      action: 'fleet.driver_credit.requested',
      details: {
        adjustmentId: adjustment.id,
        driverUserId: driver.userId,
        amount: data.amount,
        topupMethod: data.topupMethod,
      },
    },
  });

  return formatDriverCredit(adjustment);
}

export async function listFleetDriverCredits(
  companyId: string,
  actorId: string,
  query: { status?: 'pending' | 'approved' | 'rejected'; page: number; limit: number },
) {
  const access = await assertFleetMembership(companyId, actorId);
  if (!access.canRequestDriverCredit && !access.canReviewDriverCredit) {
    throw new ForbiddenError('You cannot view driver credits for this fleet');
  }

  const walletIds = await fleetDriverWalletIds(companyId, access.fleetRegionId);
  const where: Prisma.WalletAdjustmentWhereInput = {
    walletId: { in: walletIds.length ? walletIds : ['__none__'] },
    direction: WalletAdjustmentDirection.credit,
    ...(query.status ? { status: query.status } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.walletAdjustment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: driverCreditInclude,
    }),
    prisma.walletAdjustment.count({ where }),
  ]);

  return { credits: rows.map(formatDriverCredit), total };
}

export async function reviewFleetDriverCredit(
  companyId: string,
  actorId: string,
  actorRoles: PlatformRole[],
  adjustmentId: string,
  action: 'approve' | 'reject',
  reviewNote?: string,
) {
  const access = await assertFleetMembership(companyId, actorId);
  if (!access.canReviewDriverCredit) {
    throw new ForbiddenError('Only the fleet owner can approve or reject driver credits');
  }

  const adjustment = await prisma.walletAdjustment.findUnique({
    where: { id: adjustmentId },
    include: { wallet: { select: { userId: true } } },
  });
  if (!adjustment) throw new NotFoundError('Credit request not found');

  const driver = await prisma.driverProfile.findFirst({
    where: {
      userId: adjustment.wallet.userId ?? '__none__',
      fleetCompanyId: companyId,
    },
    select: { userId: true },
  });
  if (!driver) throw new ForbiddenError('This credit is not for a driver in your fleet');

  return reviewWalletAdjustment(actorId, actorRoles, adjustmentId, action, reviewNote);
}

