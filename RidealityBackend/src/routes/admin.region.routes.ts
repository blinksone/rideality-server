import { Router } from 'express';
import { PlatformRole } from '@prisma/client';
import { authenticate, AuthRequest, requireRoles, requirePasswordResetComplete } from '../middleware/auth';
import { loadAdminPermissions } from '../middleware/permissions';
import { validate } from '../middleware/validate';
import { sendSuccess, sendPaginated } from '../utils/response';
import { param } from '../utils/params';
import { ForbiddenError } from '../utils/errors';
import { canAccessPortal } from '../services/portal.service';
import * as regionService from '../services/region.service';
import {
  createRegionSchema,
  listRegionsSchema,
  updateRegionSchema,
} from '../validators/region.validator';

const router = Router();

function requirePortalAccess(req: AuthRequest, _res: unknown, next: (err?: unknown) => void) {
  const roles = req.user?.platformRoles ?? [];
  if (!canAccessPortal(roles)) {
    next(new ForbiddenError('Portal access denied'));
    return;
  }
  next();
}

const requireSuperAdmin = requireRoles(PlatformRole.SUPER_ADMIN);

router.use(authenticate, loadAdminPermissions, requirePortalAccess, requirePasswordResetComplete);

router.get('/active', async (_req, res, next) => {
  try {
    const data = await regionService.listActiveRegions();
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.get(
  '/',
  requireSuperAdmin,
  validate(listRegionsSchema, 'query'),
  async (req: AuthRequest, res, next) => {
    try {
      const query = req.query as unknown as {
        page: number;
        limit: number;
        search?: string;
        activeOnly?: boolean;
      };
      const { regions, total } = await regionService.listRegions(query);
      sendPaginated(res, regions, { page: query.page, limit: query.limit, total });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/',
  requireSuperAdmin,
  validate(createRegionSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await regionService.createRegion(req.body);
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  },
);

router.get('/:id', requireSuperAdmin, async (req, res, next) => {
  try {
    const data = await regionService.getRegion(param(req.params.id));
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id',
  requireSuperAdmin,
  validate(updateRegionSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await regionService.updateRegion(param(req.params.id), req.body);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
