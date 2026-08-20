import { Response, NextFunction } from 'express';
import { PlatformRole } from '@prisma/client';
import { AuthRequest } from './auth';
import { ForbiddenError } from '../utils/errors';
import { resolveUserPermissionKeys } from '../services/permission.service';
import { PERMISSION_KEYS } from '../constants/permissions';
import { canAccessPortal } from '../services/portal.service';
import {
  type AdminAssignmentRecord,
  type ScopeParams,
  extractScopeParams,
  getAdminAssignment,
  isSuperAdminRole,
  scopeAllows,
} from '../services/admin-scope.service';
import { prisma } from '../lib/prisma';

export interface AdminAuthRequest extends AuthRequest {
  permissionKeys?: string[];
  adminAssignment?: AdminAssignmentRecord | null;
}

export async function loadAdminPermissions(
  req: AdminAuthRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      next();
      return;
    }

    req.adminAssignment = await getAdminAssignment(req.user.sub);

    const hasPortalRole = canAccessPortal(req.user.platformRoles);
    if (!hasPortalRole && !req.adminAssignment) {
      next();
      return;
    }

    req.permissionKeys = await resolveUserPermissionKeys(req.user.sub);
    next();
  } catch (err) {
    next(err);
  }
}

export function requirePermission(...required: string[]) {
  return (req: AdminAuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new ForbiddenError('Authentication required'));
      return;
    }

    if (
      req.user.platformRoles.includes(PlatformRole.SUPER_ADMIN) ||
      isSuperAdminRole(req.adminAssignment?.role)
    ) {
      next();
      return;
    }

    const keys = req.permissionKeys ?? [];
    const hasAll = required.every((p) => keys.includes(p));
    if (!hasAll) {
      next(
        new ForbiddenError('Missing required permission', 'FORBIDDEN', {
          required,
          granted: keys,
        }),
      );
      return;
    }

    next();
  };
}

async function requestedScopeFrom(req: AdminAuthRequest): Promise<ScopeParams> {
  const params = extractScopeParams({
    params: req.params as Record<string, unknown>,
    query: req.query as Record<string, unknown>,
    body: req.body as Record<string, unknown>,
  });

  const regionId =
    (typeof req.params.regionId === 'string' && req.params.regionId) ||
    (typeof req.query.regionId === 'string' && req.query.regionId) ||
    (typeof req.body?.regionId === 'string' && req.body.regionId) ||
    undefined;

  if (regionId && !params.countryId && !params.cityId && !params.regionalId) {
    const city = await prisma.fleetRegion.findUnique({
      where: { id: regionId },
      select: {
        id: true,
        provinceId: true,
        fleetCompany: { select: { region: { select: { id: true, continentId: true } } } },
      },
    });
    if (city) {
      params.cityId = city.id;
      params.regionalId = city.provinceId;
      params.countryId = city.fleetCompany.region.id;
      params.continentId = city.fleetCompany.region.continentId;
    } else {
      const province = await prisma.province.findUnique({
        where: { id: regionId },
        select: { id: true, countryId: true, country: { select: { continentId: true } } },
      });
      if (province) {
        params.regionalId = province.id;
        params.countryId = province.countryId;
        params.continentId = province.country.continentId;
      } else {
        params.countryId = regionId;
      }
    }
  }

  const companyId =
    (typeof req.params.id === 'string' && req.params.id) ||
    (typeof req.params.companyId === 'string' && req.params.companyId) ||
    undefined;
  if (companyId && !params.countryId) {
    const company = await prisma.fleetCompany.findUnique({
      where: { id: companyId },
      select: { region: { select: { id: true, continentId: true } } },
    });
    if (company) {
      params.countryId = company.region.id;
      params.continentId = params.continentId ?? company.region.continentId;
    }
  }

  return params;
}

export function requirePermissionInScope(...required: string[]) {
  return async (req: AdminAuthRequest, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        next(new ForbiddenError('Authentication required'));
        return;
      }

      const assignment = req.adminAssignment ?? (await getAdminAssignment(req.user.sub));
      req.adminAssignment = assignment;

      if (
        req.user.platformRoles.includes(PlatformRole.SUPER_ADMIN) ||
        isSuperAdminRole(assignment?.role)
      ) {
        next();
        return;
      }

      if (!assignment) {
        next(new ForbiddenError('Forbidden: missing admin assignment'));
        return;
      }

      const keys = req.permissionKeys ?? (await resolveUserPermissionKeys(req.user.sub));
      req.permissionKeys = keys;
      const hasAll = required.every((p) => keys.includes(p));
      if (!hasAll) {
        next(
          new ForbiddenError('Forbidden: missing permission', 'FORBIDDEN', {
            required,
            granted: keys,
          }),
        );
        return;
      }

      const requested = await requestedScopeFrom(req);
      const allowed = await scopeAllows(assignment, requested);
      if (!allowed) {
        next(new ForbiddenError('Forbidden: outside your assigned scope'));
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

export { PERMISSION_KEYS };
