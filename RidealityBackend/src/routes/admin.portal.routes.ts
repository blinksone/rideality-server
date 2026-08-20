import { Router } from 'express';
import { PlatformRole } from '@prisma/client';
import { authenticate, AuthRequest, requirePasswordResetComplete, requireRoles } from '../middleware/auth';
import { loadAdminPermissions, requirePermission, requirePermissionInScope, PERMISSION_KEYS, AdminAuthRequest } from '../middleware/permissions';
import { validate } from '../middleware/validate';
import { sendSuccess, sendPaginated } from '../utils/response';
import { ForbiddenError } from '../utils/errors';
import { canAccessPortalAsync, getPortalMe, getDashboardStats } from '../services/portal.service';
import * as adminService from '../services/admin.service';
import * as fleetHierarchy from '../services/fleet-hierarchy.service';
import * as ratingService from '../services/rating.service';
import { listInvitees, scopeAllows, getAdminAssignment } from '../services/admin-scope.service';
import { param } from '../utils/params';
import {
  globalAuditLogSchema,
  moderateRatingSchema,
  createPlatformStaffSchema,
  updatePlatformStaffSchema,
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
  requirePermissionInScope(PERMISSION_KEYS.ADMIN_CREATE),
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

router.patch(
  '/portal/users/:id',
  requirePermissionInScope(PERMISSION_KEYS.ADMIN_UPDATE),
  validate(updatePlatformStaffSchema),
  async (req: AdminAuthRequest, res, next) => {
    try {
      const data = await fleetHierarchy.updatePlatformStaffUser(
        req.user!.sub,
        req.user!.platformRoles,
        param(req.params.id),
        req.body,
        req.ip,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/portal/users',
  requirePermission(PERMISSION_KEYS.ADMIN_VIEW),
  validate(listPlatformStaffSchema, 'query'),
  async (req: AdminAuthRequest, res, next) => {
    try {
      const query = req.query as unknown as {
        page: number;
        limit: number;
        type?: fleetHierarchy.PlatformStaffType;
        search?: string;
      };
      const { users, total } = await fleetHierarchy.listPlatformStaffUsers(query, req.adminAssignment);
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

router.get(
  '/fleet-owners/:id/regional-fleets',
  requirePermissionInScope(PERMISSION_KEYS.ADMIN_VIEW),
  async (req: AuthRequest, res, next) => {
    try {
      const caller = await getAdminAssignment(req.user!.sub);
      const { parent, invitees } = await listInvitees(param(req.params.id), 'REGIONAL_FLEET');
      if (caller && !(await scopeAllows(caller, {
        continentId: parent.continentId,
        countryId: parent.countryId,
        regionalId: parent.regionalId,
        cityId: parent.cityId,
      }))) {
        throw new ForbiddenError('Forbidden: outside your assigned scope');
      }
      sendSuccess(res, { parent, regionalFleets: invitees });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/regional-fleets/:id/support',
  requirePermissionInScope(PERMISSION_KEYS.ADMIN_VIEW),
  async (req: AuthRequest, res, next) => {
    try {
      const caller = await getAdminAssignment(req.user!.sub);
      const { parent, invitees } = await listInvitees(param(req.params.id), 'FLEET_SUPPORT');
      if (caller && !(await scopeAllows(caller, {
        continentId: parent.continentId,
        countryId: parent.countryId,
        regionalId: parent.regionalId,
        cityId: parent.cityId,
      }))) {
        throw new ForbiddenError('Forbidden: outside your assigned scope');
      }
      sendSuccess(res, { parent, support: invitees });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
