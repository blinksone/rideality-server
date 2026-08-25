import { Router } from 'express';
import { authenticate, AuthRequest, requirePasswordResetComplete } from '../middleware/auth';
import { loadAdminPermissions, requirePermission, PERMISSION_KEYS, AdminAuthRequest } from '../middleware/permissions';
import { validate } from '../middleware/validate';
import { sendPaginated, sendSuccess } from '../utils/response';
import { param } from '../utils/params';
import { canAccessPortal } from '../services/portal.service';
import { ForbiddenError } from '../utils/errors';
import * as financeService from '../services/finance.service';
import {
  bulkWalletStatusSchema,
  createAdjustmentSchema,
  createPayoutRequestSchema,
  createWalletSchema,
  exportWalletsSchema,
  listAdjustmentsSchema,
  listFinanceTransactionsSchema,
  listPayoutsSchema,
  listWalletTransactionsSchema,
  listWalletsSchema,
  reviewAdjustmentSchema,
  reviewPayoutSchema,
  walletLookupSchema,
  walletNoteSchema,
  walletStatusSchema,
} from '../validators/finance.validator';

const router = Router();

function financeActor(req: AdminAuthRequest): financeService.FinanceActor {
  return {
    userId: req.user!.sub,
    roles: req.user!.platformRoles ?? [],
    assignment: req.adminAssignment,
  };
}

function requirePortalAccess(req: AuthRequest, _res: unknown, next: (err?: unknown) => void) {
  const roles = req.user?.platformRoles ?? [];
  if (!canAccessPortal(roles)) {
    next(new ForbiddenError('Portal access denied'));
    return;
  }
  next();
}

router.use(authenticate, loadAdminPermissions, requirePortalAccess, requirePasswordResetComplete);

router.get(
  '/summary',
  requirePermission(PERMISSION_KEYS.VIEW_FINANCE),
  async (req: AdminAuthRequest, res, next) => {
    try {
      const accessWhere = await financeService.resolveFinanceWalletWhere(financeActor(req));
      const data = await financeService.getFinanceSummary(accessWhere);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/wallets',
  requirePermission(PERMISSION_KEYS.VIEW_FINANCE),
  validate(listWalletsSchema, 'query'),
  async (req: AdminAuthRequest, res, next) => {
    try {
      const query = req.query as unknown as {
        page: number;
        limit: number;
        ownerType?: 'user' | 'fleet' | 'platform';
        regionId?: string;
        continentId?: string;
        status?: 'active' | 'frozen' | 'closed';
        search?: string;
        currency?: string;
        balanceMin?: number;
        balanceMax?: number;
        updatedFrom?: string;
        updatedTo?: string;
        ids?: string;
      };
      const accessWhere = await financeService.resolveFinanceWalletWhere(financeActor(req));
      const { wallets, total } = await financeService.listWallets({ ...query, accessWhere });
      sendPaginated(res, wallets, { page: query.page, limit: query.limit, total });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/wallets/export',
  requirePermission(PERMISSION_KEYS.EXPORT_FINANCE_REPORTS),
  validate(exportWalletsSchema, 'query'),
  async (req: AdminAuthRequest, res, next) => {
    try {
      const query = req.query as unknown as Parameters<typeof financeService.exportWalletsCsv>[0];
      const accessWhere = await financeService.resolveFinanceWalletWhere(financeActor(req));
      const csv = await financeService.exportWalletsCsv({ ...query, accessWhere });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="wallets-export.csv"');
      res.send(csv);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/wallets/bulk-status',
  requirePermission(PERMISSION_KEYS.APPROVE_WALLET_ADJUSTMENTS),
  validate(bulkWalletStatusSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const { walletIds, status } = req.body as { walletIds: string[]; status: 'active' | 'frozen' | 'closed' };
      const data = await financeService.bulkSetWalletStatus(req.user!.sub, walletIds, status);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/wallets',
  requirePermission(PERMISSION_KEYS.MANAGE_WALLET_ADJUSTMENTS),
  validate(createWalletSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await financeService.createAdminWallet(req.user!.sub, req.body);
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/wallets/lookup',
  requirePermission(PERMISSION_KEYS.VIEW_FINANCE),
  validate(walletLookupSchema, 'query'),
  async (req: AdminAuthRequest, res, next) => {
    try {
      const { email } = req.query as unknown as { email: string };
      const accessWhere = await financeService.resolveFinanceWalletWhere(financeActor(req));
      const wallets = await financeService.lookupWalletsByEmail(email, accessWhere);
      sendSuccess(res, { wallets });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/wallets/:id/dashboard',
  requirePermission(PERMISSION_KEYS.VIEW_FINANCE),
  async (req: AdminAuthRequest, res, next) => {
    try {
      const walletId = param(req.params.id);
      await financeService.assertFinanceWalletAccess(financeActor(req), walletId);
      const data = await financeService.getWalletDashboardDetail(walletId);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/wallets/:id',
  requirePermission(PERMISSION_KEYS.VIEW_FINANCE),
  async (req: AdminAuthRequest, res, next) => {
    try {
      const walletId = param(req.params.id);
      await financeService.assertFinanceWalletAccess(financeActor(req), walletId);
      const data = await financeService.getWalletById(walletId);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/wallets/:id/transactions',
  requirePermission(PERMISSION_KEYS.VIEW_FINANCE),
  validate(listWalletTransactionsSchema, 'query'),
  async (req: AdminAuthRequest, res, next) => {
    try {
      const walletId = param(req.params.id);
      await financeService.assertFinanceWalletAccess(financeActor(req), walletId);
      const query = req.query as unknown as { page: number; limit: number };
      const { transactions, total } = await financeService.listWalletTransactions(
        walletId,
        query.page,
        query.limit,
      );
      sendPaginated(res, transactions, { page: query.page, limit: query.limit, total });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/wallets/:id/status',
  requirePermission(PERMISSION_KEYS.APPROVE_WALLET_ADJUSTMENTS),
  validate(walletStatusSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await financeService.setWalletStatus(
        param(req.params.id),
        req.body.status,
        req.user!.sub,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/wallets/:id/notes',
  requirePermission(PERMISSION_KEYS.MANAGE_WALLET_ADJUSTMENTS),
  validate(walletNoteSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await financeService.addWalletNote(
        req.user!.sub,
        param(req.params.id),
        req.body.content,
      );
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/transactions',
  requirePermission(PERMISSION_KEYS.VIEW_FINANCE),
  validate(listFinanceTransactionsSchema, 'query'),
  async (req: AdminAuthRequest, res, next) => {
    try {
      const query = req.query as unknown as {
        page: number;
        limit: number;
        walletId?: string;
        type?: import('@prisma/client').WalletTransactionType;
      };
      const accessWhere = await financeService.resolveFinanceWalletWhere(financeActor(req));
      const { transactions, total } = await financeService.listGlobalTransactions({
        ...query,
        accessWhere,
      });
      sendPaginated(res, transactions, { page: query.page, limit: query.limit, total });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/adjustments',
  requirePermission(PERMISSION_KEYS.VIEW_FINANCE),
  validate(listAdjustmentsSchema, 'query'),
  async (req: AdminAuthRequest, res, next) => {
    try {
      const query = req.query as unknown as {
        page: number;
        limit: number;
        status?: 'pending' | 'approved' | 'rejected' | 'cancelled';
        walletId?: string;
      };
      const accessWhere = await financeService.resolveFinanceWalletWhere(financeActor(req));
      const { adjustments, total } = await financeService.listAdjustments({ ...query, accessWhere });
      sendPaginated(res, adjustments, { page: query.page, limit: query.limit, total });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/adjustments',
  requirePermission(PERMISSION_KEYS.MANAGE_WALLET_ADJUSTMENTS),
  validate(createAdjustmentSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await financeService.createWalletAdjustment(req.user!.sub, req.body);
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/adjustments/:id/review',
  requirePermission(PERMISSION_KEYS.APPROVE_WALLET_ADJUSTMENTS),
  validate(reviewAdjustmentSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await financeService.reviewWalletAdjustment(
        req.user!.sub,
        req.user!.platformRoles,
        param(req.params.id),
        req.body.action,
        req.body.reviewNote,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/payouts',
  requirePermission(PERMISSION_KEYS.VIEW_FINANCE),
  validate(listPayoutsSchema, 'query'),
  async (req: AdminAuthRequest, res, next) => {
    try {
      const query = req.query as unknown as {
        page: number;
        limit: number;
        status?: 'pending' | 'approved' | 'processing' | 'completed' | 'rejected' | 'cancelled';
        walletId?: string;
      };
      const accessWhere = await financeService.resolveFinanceWalletWhere(financeActor(req));
      const { payouts, total } = await financeService.listPayouts({ ...query, accessWhere });
      sendPaginated(res, payouts, { page: query.page, limit: query.limit, total });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/payouts',
  requirePermission(PERMISSION_KEYS.MANAGE_PAYOUTS),
  validate(createPayoutRequestSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await financeService.createPayoutRequest(
        req.user!.sub,
        req.user!.platformRoles,
        req.body,
      );
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/payouts/:id/review',
  requirePermission(PERMISSION_KEYS.APPROVE_WALLET_ADJUSTMENTS),
  validate(reviewPayoutSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await financeService.reviewPayoutRequest(
        req.user!.sub,
        req.user!.platformRoles,
        param(req.params.id),
        req.body.action,
        req.body.reviewNote,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
