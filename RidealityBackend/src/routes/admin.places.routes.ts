import { Router } from 'express';
import { authenticate, requirePasswordResetComplete } from '../middleware/auth';
import {
  loadAdminPermissions,
  requirePermissionInScope,
  PERMISSION_KEYS,
  AdminAuthRequest,
} from '../middleware/permissions';
import { validate } from '../middleware/validate';
import { sendPaginated, sendSuccess } from '../utils/response';
import { param } from '../utils/params';
import { ForbiddenError } from '../utils/errors';
import { canAccessPortal } from '../services/portal.service';
import * as placesService from '../services/places.service';
import {
  adminCreatePlaceSchema,
  adminListPlacesQuerySchema,
  adminUpdatePlaceSchema,
} from '../validators/places.validator';

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
  '/',
  requirePermissionInScope(PERMISSION_KEYS.FARE_MANAGE),
  validate(adminListPlacesQuerySchema, 'query'),
  async (req: AdminAuthRequest, res, next) => {
    try {
      const query = req.query as unknown as {
        city?: string;
        search?: string;
        page: number;
        limit: number;
      };
      const result = await placesService.listAdminPlaces(query);
      sendPaginated(res, result.data, result.pagination);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/',
  requirePermissionInScope(PERMISSION_KEYS.FARE_MANAGE),
  validate(adminCreatePlaceSchema),
  async (req: AdminAuthRequest, res, next) => {
    try {
      const data = await placesService.createAdminPlace(req.body);
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id',
  requirePermissionInScope(PERMISSION_KEYS.FARE_MANAGE),
  validate(adminUpdatePlaceSchema),
  async (req: AdminAuthRequest, res, next) => {
    try {
      const data = await placesService.updateAdminPlace(param(req.params.id), req.body);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
