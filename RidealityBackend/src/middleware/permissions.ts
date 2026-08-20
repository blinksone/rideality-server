import { Response, NextFunction } from 'express';
import { PlatformRole } from '@prisma/client';
import { AuthRequest } from './auth';
import { ForbiddenError } from '../utils/errors';
import { resolveUserPermissionKeys } from '../services/permission.service';
import { PERMISSION_KEYS } from '../constants/permissions';
import { canAccessPortal } from '../services/portal.service';

export interface AdminAuthRequest extends AuthRequest {
  permissionKeys?: string[];
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

    if (!req.user || !canAccessPortal(req.user.platformRoles)) {
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

    if (req.user.platformRoles.includes(PlatformRole.SUPER_ADMIN)) {
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

export { PERMISSION_KEYS };
