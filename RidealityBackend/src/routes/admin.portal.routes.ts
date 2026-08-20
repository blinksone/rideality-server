import { Router } from 'express';
import { PlatformRole } from '@prisma/client';
import { authenticate, AuthRequest, requirePasswordResetComplete, requireRoles } from '../middleware/auth';
import { loadAdminPermissions, requirePermission, PERMISSION_KEYS } from '../middleware/permissions';
import { validate } from '../middleware/validate';
import { sendSuccess, sendPaginated } from '../utils/response';
import { ForbiddenError } from '../utils/errors';
import { canAccessPortalAsync, getPortalMe, getDashboardStats } from '../services/portal.service';
import * as adminService from '../services/admin.service';
import * as fleetHierarchy from '../services/fleet-hierarchy.service';
import * as ratingService from '../services/rating.service';
import { param } from '../utils/params';
import {
  globalAuditLogSchema,
  moderateRatingSchema,
  createPlatformStaffSchema,
  listPlatformStaffSchema,
} from '../validators/admin.validator';

const router = Router();

async function requirePortalAccess(req: AuthRequest, _res: unknown, next: (err?: unknown) => void) {
  const roles = req.user?.platformRoles ?? [];
  const userId = req.user?.sub;
  if (!userId) {
    next(new ForbiddenError('Portal access denied'));
    return;
  }
  try {
    const allowed = await canAccessPortalAsync(userId, roles);
    if (!allowed) {
      next(new ForbiddenError('Portal access denied'));
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}

router.use(authenticate, loadAdminPermissions, requirePortalAccess);

router.get('/me', async (req: AuthRequest, res, next) => {
  try {
    const data = await getPortalMe(req.user!.sub);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.use(requirePasswordResetComplete);

router.get('/dashboard/stats', async (req: AuthRequest, res, next) => {
  try {
    const roles = req.user!.platformRoles as PlatformRole[];
    const data = await getDashboardStats(req.user!.sub, roles);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.get(
  '/audit-logs',
  requirePermission(PERMISSION_KEYS.VIEW_REPORTS),
  validate(globalAuditLogSchema, 'query'),
  async (req: AuthRequest, res, next) => {
    try {
      const query = req.query as unknown as {
        page: number;
        limit: number;
        action?: string;
        actorId?: string;
        from?: Date;
        to?: Date;
      };
      const { logs, total } = await adminService.getGlobalAuditLog(query);
      sendPaginated(res, logs, { page: query.page, limit: query.limit, total });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/ratings/:id/moderate',
  requirePermission(PERMISSION_KEYS.MANAGE_USERS),
  validate(moderateRatingSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await ratingService.moderateRating(
        req.user!.sub,
        param(req.params.id),
        req.body.status,
        req.ip,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

const requireSuperAdmin = requireRoles(PlatformRole.SUPER_ADMIN);

router.post(
  '/portal/users',
  requireSuperAdmin,
  validate(createPlatformStaffSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await fleetHierarchy.createPlatformStaffUser(
        req.user!.sub,
        req.user!.platformRoles,
        req.body,
        req.ip,
      );
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/portal/users',
  requireSuperAdmin,
  validate(listPlatformStaffSchema, 'query'),
  async (req: AuthRequest, res, next) => {
    try {
      const query = req.query as unknown as {
        page: number;
        limit: number;
        type?: 'SUB_ADMIN' | 'FLEET_OWNER' | 'FINANCE_USER' | 'PLATFORM_SUPPORT';
        search?: string;
      };
      const { users, total } = await fleetHierarchy.listPlatformStaffUsers(query);
      sendPaginated(res, users, { page: query.page, limit: query.limit, total });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/portal/fleet-owners/:companyId',
  requireSuperAdmin,
  async (req: AuthRequest, res, next) => {
    try {
      const data = await fleetHierarchy.getFleetOwnerCompanyDetail(param(req.params.companyId));
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
