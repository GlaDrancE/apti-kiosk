import type { NextFunction, Request, Response } from 'express';
import type { UserProfile } from '@apti/db';
import type { Role } from '@apti/shared';
import { forbidden, unauthorized } from '../lib/errors.js';
import { authenticate } from '../services/auth.service.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserProfile;
    }
  }
}

/**
 * Verify the bearer token (student-local or Supabase) and attach the profile.
 *
 * ponytail: one profile lookup per request. Cache by supabaseUserId if the DB
 * round-trip ever shows up in latency — invalidation only matters on role
 * change, which is rare.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(unauthorized('Missing bearer token'));

  try {
    req.user = await authenticate(header.slice(7));
    next();
  } catch (err) {
    next(err);
  }
}

/** Role gate. Must run after requireAuth. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role as Role)) return next(forbidden('Insufficient role'));
    next();
  };
}

export const requireAdmin = requireRole('ADMIN', 'SUPER_ADMIN');
export const requireStudent = requireRole('STUDENT');

/** True for admins — used where a route serves both roles with different scope. */
export const isAdmin = (user: UserProfile) =>
  user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
