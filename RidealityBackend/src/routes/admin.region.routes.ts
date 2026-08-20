import { Router } from 'express';
import { PlatformRole } from '@prisma/client';
import { authenticate, AuthRequest, requireRoles, requirePasswordResetComplete } from '../middleware/auth';
import { loadAdminPermissions, requirePermissionInScope, PERMISSION_KEYS, AdminAuthRequest } from '../middleware/permissions';
import { validate } from '../middleware/validate';
import { sendSuccess, sendPaginated } from '../utils/response';
import { param } from '../utils/params';
import { ForbiddenError } from '../utils/errors';
import { canAccessPortal } from '../services/portal.service';
import * as regionService from '../services/region.service';
import {
  createRegionSchema,
  createCitySchema,
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

router.get('/active', async (req: AdminAuthRequest, res, next) => {
  try {
    const data = await regionService.listActiveRegions(req.adminAssignment);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.get('/continents', async (req: AdminAuthRequest, res, next) => {
  try {
    const data = await regionService.listContinents(req.adminAssignment);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.get('/provinces', async (req: AdminAuthRequest, res, next) => {
  try {
    const countryId = typeof req.query.countryId === 'string' ? req.query.countryId : '';
    if (!countryId) {
      sendSuccess(res, []);
      return;
    }
    const data = await regionService.listProvinces(countryId, req.adminAssignment);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.get('/cities', async (req: AdminAuthRequest, res, next) => {
  try {
    const data = await regionService.listCities(
      {
        countryId: typeof req.query.countryId === 'string' ? req.query.countryId : undefined,
        provinceId: typeof req.query.provinceId === 'string' ? req.query.provinceId : undefined,
      },
      req.adminAssignment,
    );
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/cities',
  requirePermissionInScope(PERMISSION_KEYS.CITY_CREATE),
  validate(createCitySchema),
  async (req: AdminAuthRequest, res, next) => {
    try {
      const data = await regionService.createCity(req.body, req.adminAssignment);
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  },
);

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
