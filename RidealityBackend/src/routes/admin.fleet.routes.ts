import { Router } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest, requirePasswordResetComplete } from '../middleware/auth';
import { loadAdminPermissions, requirePermission, PERMISSION_KEYS, AdminAuthRequest } from '../middleware/permissions';
import { validate } from '../middleware/validate';
import { sendSuccess, sendPaginated } from '../utils/response';
import { param } from '../utils/params';
import * as fleetService from '../services/fleet.service';
import * as fleetHierarchy from '../services/fleet-hierarchy.service';
import { adminUpdateFleetSchema, adminCreateFleetSchema, listFleetsSchema } from '../validators/fleet.validator';

const router = Router();

router.use(authenticate, loadAdminPermissions, requirePasswordResetComplete);

router.get(
  '/',
  requirePermission(PERMISSION_KEYS.MANAGE_FLEETS),
  validate(listFleetsSchema, 'query'),
  async (req: AdminAuthRequest, res, next) => {
    try {
      const query = req.query as unknown as {
        page: number;
        limit: number;
        search?: string;
        status?: 'pending' | 'active' | 'suspended';
        regionId?: string;
      };
      const { companies, total } = await fleetService.listFleetCompanies(query, {
        userId: req.user!.sub,
        roles: req.user!.platformRoles,
        assignment: req.adminAssignment,
      });
      sendPaginated(res, companies, { page: query.page, limit: query.limit, total });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/',
  requirePermission(PERMISSION_KEYS.FLEET_CREATE),
  validate(adminCreateFleetSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await fleetService.adminCreateFleetCompany(req.user!.sub, req.body);
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id',
  requirePermission(PERMISSION_KEYS.MANAGE_FLEETS),
  validate(adminUpdateFleetSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await fleetService.adminUpdateFleetCompany(
        param(req.params.id),
        req.user!.sub,
        req.body,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/:id/regions',
  requirePermission(PERMISSION_KEYS.MANAGE_FLEETS),
  async (req: AdminAuthRequest, res, next) => {
    try {
      const data = await fleetHierarchy.adminListFleetRegions(param(req.params.id), req.user!.sub);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/:id/regions/:regionId/services',
  requirePermission(PERMISSION_KEYS.MANAGE_FLEETS),
  async (req: AdminAuthRequest, res, next) => {
    try {
      const data = await fleetHierarchy.getFleetCityServicesForAdmin(
        param(req.params.id),
        req.user!.sub,
        param(req.params.regionId),
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  '/:id/regions/:regionId/services',
  requirePermission(PERMISSION_KEYS.FLEET_UPDATE),
  validate(
    z.object({
      products: z
        .array(z.object({ code: z.string().min(1).max(32), enabled: z.boolean() }))
        .min(1)
        .max(20),
    }),
  ),
  async (req: AdminAuthRequest, res, next) => {
    try {
      const data = await fleetHierarchy.setFleetCityServices(
        param(req.params.id),
        req.user!.sub,
        param(req.params.regionId),
        req.body.products,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
