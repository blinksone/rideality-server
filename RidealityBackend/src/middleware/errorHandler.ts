import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { AppError, ConflictError } from '../utils/errors';
import { sendError } from '../utils/response';
import { isDev } from '../config/env';
import { logger } from '../lib/logger';

/** Duck-type P2002 so dual @prisma/client copies still map unique conflicts cleanly. */
function uniqueConstraintField(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as { code?: string; meta?: { target?: string[] | string } };
  if (e.code !== 'P2002') return null;
  const target = e.meta?.target;
  if (Array.isArray(target) && target.length) return String(target[0]);
  if (typeof target === 'string' && target) return target;
  // Postgres unique on email often surfaces in message
  const msg = String((err as Error).message || '');
  if (/email/i.test(msg)) return 'email';
  return 'field';
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    sendError(res, err);
    return;
  }

  const uniqueField =
    uniqueConstraintField(err) ??
    (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
      ? 'field'
      : null);

  if (uniqueField) {
    sendError(
      res,
      new ConflictError(
        uniqueField === 'email'
          ? 'This email is already registered to another account'
          : `A record with this ${uniqueField} already exists`,
        uniqueField === 'email' ? 'EMAIL_ALREADY_EXISTS' : 'UNIQUE_CONSTRAINT',
      ),
    );
    return;
  }

  logger.error('Unhandled error', { error: err.message, stack: err.stack });

  const appErr = new AppError(
    500,
    'INTERNAL_ERROR',
    isDev ? err.message : 'Internal server error',
  );
  sendError(res, appErr);
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: { code: 'ROUTE_NOT_FOUND', message: 'Route not found' },
  });
}
