import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../utils/errors';

type RequestTarget = 'body' | 'query' | 'params';

function assignParsed(req: Request, target: RequestTarget, parsed: unknown): void {
  if (target === 'body') {
    req.body = parsed;
    return;
  }
  if (target === 'params') {
    Object.assign(req.params, parsed as Record<string, string>);
    return;
  }
  Object.defineProperty(req, 'query', {
    value: parsed,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

export function validate(schema: ZodSchema, target: RequestTarget = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      assignParsed(req, target, schema.parse(req[target]));
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(
          new ValidationError('Validation failed', {
            issues: err.errors.map((e) => ({
              path: e.path.join('.'),
              message: e.message,
            })),
          }),
        );
        return;
      }
      next(err);
    }
  };
}
