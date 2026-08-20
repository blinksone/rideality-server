import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { UnauthorizedError } from '../utils/errors';

/**
 * Guards internal service-to-service routes.
 * Expects header: X-Internal-Service-Secret
 */
export function requireInternalService(req: Request, _res: Response, next: NextFunction) {
  const secret = req.header('x-internal-service-secret') ?? req.header('X-Internal-Service-Secret');
  if (!secret || secret !== env.INTERNAL_SERVICE_SECRET) {
    next(new UnauthorizedError('Invalid internal service secret', 'INTERNAL_AUTH_FAILED'));
    return;
  }
  next();
}
