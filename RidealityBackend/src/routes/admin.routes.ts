import { Router } from 'express';
import { PlatformRole } from '@prisma/client';
import { authenticate, requireAdmin, AuthRequest, requirePasswordResetComplete, requireRoles } from '../middleware/auth';
import { loadAdminPermissions, requirePermission, requirePermissionInScope, PERMISSION_KEYS, AdminAuthRequest } from '../middleware/permissions';
import { validate } from '../middleware/validate';
import { sendSuccess, sendPaginated } from '../utils/response';
import { param } from '../utils/params';
import * as adminService from '../services/admin.service';
import * as permissionService from '../services/permission.service';
import * as passengerService from '../services/passenger.service';
import * as ratingService from '../services/rating.service';
import { assertTargetUserInScope } from '../services/admin-scope.service';
import {
  listUsersSchema,
  updateStatusSchema,
  driverReviewSchema,
  documentReviewSchema,
  adminNoteSchema,
  penaltySchema,
  auditLogSchema,
  createUserSchema,
  passengerRidesQuerySchema,
  passengerRatingsQuerySchema,
} from '../validators/admin.validator';
import {
  permissionIdsSchema,
  roleIdsSchema,
  assignRoleSchema,
  assignPlatformRoleSchema,
  setPermissionIdsSchema,
} from '../validators/permission.validator';

const router = Router();
const requireSuperAdmin = requireRoles(PlatformRole.SUPER_ADMIN);

router.use(authenticate, requireAdmin(), loadAdminPermissions, requirePasswordResetComplete);

router.post(
  '/',
  requirePermissionInScope(PERMISSION_KEYS.ADMIN_CREATE),
  validate(createUserSchema),
  async (req: AdminAuthRequest, res, next) => {
    try {
      const data = await adminService.createAdminUser(
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

router.get('/', validate(listUsersSchema, 'query'), requirePermission(PERMISSION_KEYS.MANAGE_USERS), async (req: AdminAuthRequest, res, next) => {
  try {
    const query = req.query as unknown as {
      page: number;
      limit: number;
      status?: string;
      role?: string;
      regionId?: string;
      search?: string;
      driverStatus?: string;
    };
    const { users, total } = await adminService.listUsers(
      query as Parameters<typeof adminService.listUsers>[0],
      req.adminAssignment,
    );
    sendPaginated(res, users, { page: query.page, limit: query.limit, total });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/access', requirePermission(PERMISSION_KEYS.MANAGE_ROLES), async (req: AuthRequest, res, next) => {
  try {
    const data = await permissionService.getUserAccess(param(req.params.id));
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.put('/:id/permissions', validate(setPermissionIdsSchema), requirePermission(PERMISSION_KEYS.MANAGE_ROLES), async (req: AuthRequest, res, next) => {
  try {
    const data = await permissionService.setUserPermissions(
      req.user!.sub,
      param(req.params.id),
      req.body.permissionIds,
      req.ip,
    );
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/permissions', validate(permissionIdsSchema), requirePermission(PERMISSION_KEYS.MANAGE_ROLES), async (req: AuthRequest, res, next) => {
  try {
    const data = await permissionService.addUserPermissions(
      req.user!.sub,
      param(req.params.id),
      req.body.permissionIds,
      req.ip,
    );
    sendSuccess(res, data, 201);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/permissions/:permissionId', requirePermission(PERMISSION_KEYS.MANAGE_ROLES), async (req: AuthRequest, res, next) => {
  try {
    const data = await permissionService.removeUserPermission(
      req.user!.sub,
      param(req.params.id),
      param(req.params.permissionId),
      req.ip,
    );
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.put('/:id/roles', validate(roleIdsSchema), requirePermission(PERMISSION_KEYS.MANAGE_ROLES), async (req: AuthRequest, res, next) => {
  try {
    const data = await permissionService.setUserRoles(
      req.user!.sub,
      param(req.params.id),
      req.body.roleIds,
      req.ip,
    );
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/roles', validate(assignRoleSchema), requirePermission(PERMISSION_KEYS.MANAGE_ROLES), async (req: AuthRequest, res, next) => {
  try {
    const data = await permissionService.assignUserRole(
      req.user!.sub,
      param(req.params.id),
      req.body.roleId,
      req.ip,
    );
    sendSuccess(res, data, 201);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/roles/:roleId', requirePermission(PERMISSION_KEYS.MANAGE_ROLES), async (req: AuthRequest, res, next) => {
  try {
    const data = await permissionService.removeUserRole(
      req.user!.sub,
      param(req.params.id),
      param(req.params.roleId),
      req.ip,
    );
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/platform-roles', validate(assignPlatformRoleSchema), requirePermission(PERMISSION_KEYS.MANAGE_ROLES), async (req: AuthRequest, res, next) => {
  try {
    const data = await permissionService.assignPlatformRole(
      req.user!.sub,
      req.user!.platformRoles,
      param(req.params.id),
      req.body.platformRole,
      req.ip,
    );
    sendSuccess(res, data, 201);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/platform-roles/:platformRole', requirePermission(PERMISSION_KEYS.MANAGE_ROLES), async (req: AuthRequest, res, next) => {
  try {
    const data = await permissionService.revokePlatformRole(
      req.user!.sub,
      req.user!.platformRoles,
      param(req.params.id),
      param(req.params.platformRole) as Parameters<typeof permissionService.revokePlatformRole>[3],
      req.ip,
    );
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/status', validate(updateStatusSchema), requirePermission(PERMISSION_KEYS.MANAGE_USERS), async (req: AuthRequest, res, next) => {
  try {
    const data = await adminService.updateUserStatus(
      req.user!.sub,
      param(req.params.id),
      req.body.status,
      req.body.reason,
      req.ip,
    );
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id/driver/review',
  validate(driverReviewSchema),
  requirePermissionInScope(PERMISSION_KEYS.DRIVER_APPROVE),
  async (req: AdminAuthRequest, res, next) => {
    try {
      await assertTargetUserInScope(req.adminAssignment ?? null, param(req.params.id));
      const data = await adminService.reviewDriver(
        req.user!.sub,
        param(req.params.id),
        req.body.action,
        req.body.reason,
        req.ip,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id/documents/:docId',
  validate(documentReviewSchema),
  requirePermissionInScope(PERMISSION_KEYS.DRIVER_APPROVE),
  async (req: AdminAuthRequest, res, next) => {
    try {
      await assertTargetUserInScope(req.adminAssignment ?? null, param(req.params.id));
      const data = await adminService.reviewDocument(
        req.user!.sub,
        param(req.params.id),
        param(req.params.docId),
        req.body.action,
        req.body.rejectionReason,
        req.ip,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.post('/:id/notes', validate(adminNoteSchema), requirePermission(PERMISSION_KEYS.MANAGE_NOTES), async (req: AuthRequest, res, next) => {
  try {
    const data = await adminService.addAdminNote(req.user!.sub, param(req.params.id), req.body.content);
    sendSuccess(res, data, 201);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/penalties', validate(penaltySchema), requirePermission(PERMISSION_KEYS.MANAGE_PENALTIES), async (req: AuthRequest, res, next) => {
  try {
    const data = await adminService.applyPenalty(
      req.user!.sub,
      param(req.params.id),
      req.body.amount,
      req.body.reason,
      req.ip,
    );
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.get(
  '/:id/audit-log',
  validate(auditLogSchema, 'query'),
  requirePermission(PERMISSION_KEYS.VIEW_REPORTS),
  async (req: AdminAuthRequest, res, next) => {
    try {
      const query = req.query as unknown as { page: number; limit: number };
      const { logs, total } = await adminService.getAuditLog(
        param(req.params.id),
        query.page,
        query.limit,
      );
      sendPaginated(res, logs, { page: query.page, limit: query.limit, total });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/:id/passenger-summary',
  requirePermission(PERMISSION_KEYS.MANAGE_USERS),
  async (req: AdminAuthRequest, res, next) => {
    try {
      const data = await passengerService.getPassengerSummaryAdmin(param(req.params.id));
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/:id/rides',
  validate(passengerRidesQuerySchema, 'query'),
  requirePermission(PERMISSION_KEYS.MANAGE_USERS),
  async (req: AdminAuthRequest, res, next) => {
    try {
      const query = req.query as unknown as Parameters<typeof passengerService.listPassengerRidesAdmin>[1];
      const { rides, total } = await passengerService.listPassengerRidesAdmin(
        param(req.params.id),
        query,
      );
      sendPaginated(res, rides, { page: query.page, limit: query.limit, total });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/:id/wallet',
  validate(auditLogSchema, 'query'),
  requirePermission(PERMISSION_KEYS.VIEW_FINANCE),
  async (req: AdminAuthRequest, res, next) => {
    try {
      const query = req.query as unknown as { page: number; limit: number };
      const data = await passengerService.getPassengerWalletAdmin(param(req.params.id), query);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/:id/ratings',
  validate(passengerRatingsQuerySchema, 'query'),
  requirePermission(PERMISSION_KEYS.VIEW_REPORTS),
  async (req: AdminAuthRequest, res, next) => {
    try {
      const query = req.query as unknown as Parameters<typeof ratingService.listUserRatingsAdmin>[1];
      const data = await ratingService.listUserRatingsAdmin(param(req.params.id), query);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.get('/:id', requirePermission(PERMISSION_KEYS.ADMIN_VIEW), async (req: AdminAuthRequest, res, next) => {
  try {
    await assertTargetUserInScope(req.adminAssignment ?? null, param(req.params.id));
    const data = await adminService.getAdminUserDetail(param(req.params.id));
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reset-password', requireSuperAdmin, async (req: AdminAuthRequest, res, next) => {
  try {
    const data = await adminService.resetAdminUserPassword(
      req.user!.sub,
      req.user!.platformRoles,
      param(req.params.id),
      req.ip,
    );
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

export default router;
