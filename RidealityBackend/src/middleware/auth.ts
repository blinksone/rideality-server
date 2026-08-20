import { Request, Response, NextFunction } from 'express';
import { PlatformRole } from '@prisma/client';
import { verifyAccessToken, AccessTokenPayload } from '../utils/jwt';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import { prisma } from '../lib/prisma';

export interface AuthRequest extends Request {
  user?: AccessTokenPayload & { platformRoles: PlatformRole[] };
}

export async function authenticate(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid authorization header');
    }

    const token = header.slice(7);
    const payload = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { platformRoles: true },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedError('User not found');
    }

    if (user.status === 'BANNED' || user.status === 'DELETED') {
      throw new ForbiddenError('Account is not active');
    }

    req.user = {
      ...payload,
      platformRoles: user.platformRoles.map((r) => r.role),
    };

    next();
  } catch (err) {
    if (err instanceof UnauthorizedError || err instanceof ForbiddenError) {
      next(err);
      return;
    }
    next(new UnauthorizedError('Invalid or expired token'));
  }
}

export function requireRoles(...roles: PlatformRole[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }

    const hasRole = roles.some((role) => req.user!.platformRoles.includes(role));
    if (!hasRole) {
      next(new ForbiddenError('Insufficient permissions'));
      return;
    }

    next();
  };
}

export function requireAdmin() {
  return requireRoles(
    PlatformRole.ADMIN,
    PlatformRole.SUPER_ADMIN,
    PlatformRole.SUB_ADMIN,
    PlatformRole.FINANCE_OFFICER,
    PlatformRole.FLEET_OWNER,
    PlatformRole.FLEET_MANAGER,
    PlatformRole.SUPPORT_AGENT,
  );
}

export function requireFleetOwnerOrManager() {
  return requireRoles(
    PlatformRole.FLEET_OWNER,
    PlatformRole.FLEET_MANAGER,
    PlatformRole.ADMIN,
    PlatformRole.SUPER_ADMIN,
  );
}

export async function requirePasswordResetComplete(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { mustResetPassword: true },
    });

    if (user?.mustResetPassword) {
      next(new ForbiddenError('Password reset required', 'PASSWORD_RESET_REQUIRED'));
      return;
    }

    next();
  } catch (err) {
    next(err);
  }
}
