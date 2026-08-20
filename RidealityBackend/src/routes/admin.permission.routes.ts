import { Router } from 'express';
import { authenticate, requireAdmin, AuthRequest, requirePasswordResetComplete } from '../middleware/auth';
import { loadAdminPermissions, requirePermission, PERMISSION_KEYS } from '../middleware/permissions';
import { validate } from '../middleware/validate';
import { sendSuccess, sendPaginated } from '../utils/response';
import { param } from '../utils/params';
import * as permissionService from '../services/permission.service';
import {
  listPermissionsSchema,
  createPermissionSchema,
  updatePermissionSchema,
  listRolesSchema,
  createRoleSchema,
  updateRoleSchema,
} from '../validators/permission.validator';

const router = Router();

router.use(authenticate, requireAdmin(), loadAdminPermissions, requirePasswordResetComplete);

router.get('/catalog', async (_req, res, next) => {
  try {
    const { permissions } = await permissionService.listPermissions({
      page: 1,
      limit: 100,
    });
    sendSuccess(res, permissions);
  } catch (err) {
    next(err);
  }
});

// ─── Permissions catalog ─────────────────────────────────────────────────────

router.get(
  '/',
  requirePermission(PERMISSION_KEYS.MANAGE_ROLES),
  validate(listPermissionsSchema, 'query'),
  async (req: AuthRequest, res, next) => {
    try {
      const query = req.query as unknown as { page: number; limit: number; search?: string };
      const { permissions, total } = await permissionService.listPermissions(query);
      sendPaginated(res, permissions, { page: query.page, limit: query.limit, total });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/',
  requirePermission(PERMISSION_KEYS.MANAGE_ROLES),
  validate(createPermissionSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await permissionService.createPermission(req.user!.sub, req.body, req.ip);
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  },
);

router.get('/:id', requirePermission(PERMISSION_KEYS.MANAGE_ROLES), async (req, res, next) => {
  try {
    const data = await permissionService.getPermission(param(req.params.id));
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id',
  requirePermission(PERMISSION_KEYS.MANAGE_ROLES),
  validate(updatePermissionSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await permissionService.updatePermission(
        req.user!.sub,
        param(req.params.id),
        req.body.meaning,
        req.ip,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/:id', requirePermission(PERMISSION_KEYS.MANAGE_ROLES), async (req: AuthRequest, res, next) => {
  try {
    const data = await permissionService.deletePermission(req.user!.sub, param(req.params.id), req.ip);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

export default router;

export const roleRouter = Router();

roleRouter.use(authenticate, requireAdmin(), loadAdminPermissions);

roleRouter.get(
  '/',
  requirePermission(PERMISSION_KEYS.MANAGE_ROLES),
  validate(listRolesSchema, 'query'),
  async (req: AuthRequest, res, next) => {
    try {
      const query = req.query as unknown as { page: number; limit: number; search?: string };
      const { roles, total } = await permissionService.listRoles(query);
      sendPaginated(res, roles, { page: query.page, limit: query.limit, total });
    } catch (err) {
      next(err);
    }
  },
);

roleRouter.post(
  '/',
  requirePermission(PERMISSION_KEYS.MANAGE_ROLES),
  validate(createRoleSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await permissionService.createRole(req.user!.sub, req.body, req.ip);
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  },
);

roleRouter.get('/:id', requirePermission(PERMISSION_KEYS.MANAGE_ROLES), async (req, res, next) => {
  try {
    const data = await permissionService.getRole(param(req.params.id));
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

roleRouter.patch(
  '/:id',
  requirePermission(PERMISSION_KEYS.MANAGE_ROLES),
  validate(updateRoleSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await permissionService.updateRole(
        req.user!.sub,
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

roleRouter.delete('/:id', requirePermission(PERMISSION_KEYS.MANAGE_ROLES), async (req: AuthRequest, res, next) => {
  try {
    const data = await permissionService.deleteRole(req.user!.sub, param(req.params.id), req.ip);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});
