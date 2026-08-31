import { Router } from 'express';
import { studentLoginSchema, type MeResponse, type Role } from '@apti/shared';
import type { UserProfile } from '@apti/db';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loginLimiter } from '../middleware/rateLimit.js';
import { loginStudent } from '../services/auth.service.js';

export const authRouter = Router();

const toMe = (u: UserProfile): MeResponse => ({
  id: u.id,
  loginId: u.loginId,
  email: u.email,
  fullName: u.fullName,
  role: u.role as Role,
  collegeName: u.collegeName,
});

/**
 * POST /auth/login — student sign-in with the roll number and password an
 * admin issued. Admins do not use this route; they come in via Supabase Auth.
 */
authRouter.post('/login', loginLimiter, validate(studentLoginSchema), async (req, res) => {
  const { token, user } = await loginStudent(req.body.loginId, req.body.password);
  res.json({ token, user: toMe(user) });
});

/**
 * GET /auth/me — verifies the bearer token and returns the local profile.
 * The web app uses this as its login handshake for both kinds of account.
 */
authRouter.get('/me', requireAuth, (req, res) => {
  res.json(toMe(req.user!));
});
