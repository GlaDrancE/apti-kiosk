import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@apti/db';
import { env } from '../env.js';
import { HttpError } from '../lib/errors.js';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: 'Route not found' });
}

/** Central error handler. Express 5 forwards rejected async handlers here. */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Record already exists' });
    if (err.code === 'P2025') return res.status(404).json({ error: 'Record not found' });
    if (err.code === 'P2003') return res.status(400).json({ error: 'Referenced record missing' });
  }

  console.error('Unhandled error:', err);
  // Internals never leak to the client in production.
  res.status(500).json({
    error: 'Internal server error',
    ...(env.NODE_ENV === 'development' && err instanceof Error ? { message: err.message } : {}),
  });
}
