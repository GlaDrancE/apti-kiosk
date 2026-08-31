import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodSchema } from 'zod';
import { badRequest } from '../lib/errors.js';

type Source = 'body' | 'query' | 'params';

/**
 * Validate one part of the request and replace it with the parsed value, so
 * handlers get coerced types (dates, numbers) instead of raw strings.
 */
export function validate(schema: ZodSchema, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req[source]);
      if (source === 'query') {
        // Express 5's req.query is a getter — assign onto a stashed field.
        (req as Request & { validatedQuery?: unknown }).validatedQuery = parsed;
      } else {
        req[source] = parsed;
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(badRequest('Validation failed', err.flatten()));
      }
      next(err);
    }
  };
}

/**
 * Express 5 types a route param as `string | string[]`, because a repeated
 * param is legal. Every param here is validated as a single uuid first, so
 * narrow it once in one place rather than casting at each call site.
 */
export function param(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

/** Typed accessor for whatever `validate(schema, 'query')` parsed. */
export function validatedQuery<T>(req: Request): T {
  return (req as Request & { validatedQuery: T }).validatedQuery;
}
