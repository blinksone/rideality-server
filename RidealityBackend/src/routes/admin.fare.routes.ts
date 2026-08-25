import { Router } from 'express';
import { authenticate, requirePasswordResetComplete } from '../middleware/auth';
import {
  loadAdminPermissions,
  requirePermissionInScope,
  PERMISSION_KEYS,
  AdminAuthRequest,
} from '../middleware/permissions';
import { validate } from '../middleware/validate';
import { sendSuccess } from '../utils/response';
import { param } from '../utils/params';
import { ForbiddenError } from '../utils/errors';
import { canAccessPortal } from '../services/portal.service';
import * as fareService from '../services/fare.service';
import { listServiceCatalog } from '../services/service-product.service';
import {
  createFareConfigSchema,
  listFareConfigsQuerySchema,
  updateFareConfigSchema,
} from '../validators/fare.validator';

const router = Router();

function requirePortalAccess(req: AdminAuthRequest, _res: unknown, next: (err?: unknown) => void) {
  const roles = req.user?.platformRoles ?? [];
  if (!canAccessPortal(roles) && !req.adminAssignment) {
    next(new ForbiddenError('Portal access denied'));
    return;
  }
  next();
}

router.use(authenticate, loadAdminPermissions, requirePortalAccess, requirePasswordResetComplete);

router.get(
  '/products',
  requirePermissionInScope(PERMISSION_KEYS.FARE_MANAGE),
  async (_req: AdminAuthRequest, res, next) => {
    try {
      sendSuccess(res, await listServiceCatalog());
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/',
  requirePermissionInScope(PERMISSION_KEYS.FARE_MANAGE),
  validate(listFareConfigsQuerySchema, 'query'),
  async (req: AdminAuthRequest, res, next) => {
    try {
      const query = req.query as {
        countryId?: string;
        cityId?: string;
        product?: 'ride' | 'cargo';
        serviceProductCode?: string;
      };
      const data = await fareService.listFareConfigs(query, req.adminAssignment);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/',
  requirePermissionInScope(PERMISSION_KEYS.FARE_MANAGE),
  validate(createFareConfigSchema),
  async (req: AdminAuthRequest, res, next) => {
    try {
      const data = await fareService.createFareConfig(req.body, req.adminAssignment);
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id',
  requirePermissionInScope(PERMISSION_KEYS.FARE_MANAGE),
  validate(updateFareConfigSchema),
  async (req: AdminAuthRequest, res, next) => {
    try {
      const data = await fareService.updateFareConfig(param(req.params.id), req.body, req.adminAssignment);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:id',
  requirePermissionInScope(PERMISSION_KEYS.FARE_MANAGE),
  async (req: AdminAuthRequest, res, next) => {
    try {
      const data = await fareService.deleteFareConfig(param(req.params.id), req.adminAssignment);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
