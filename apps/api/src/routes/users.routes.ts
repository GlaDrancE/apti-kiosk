import { Router } from 'express';
import { z } from 'zod';
import { listUsersQuerySchema, updateUserRoleSchema, importStudentsCsvSchema, idSchema } from '@apti/shared';
import { requireAdmin, requireAuth, requireRole } from '../middleware/auth.js';
import { validate, validatedQuery, param } from '../middleware/validate.js';
import { audit } from '../middleware/audit.js';
import { importLimiter } from '../middleware/rateLimit.js';
import { toCsv } from '../lib/csv.js';
import * as userService from '../services/user.service.js';
import { importStudentsCsv, resetStudentPassword } from '../services/studentImport.service.js';
import { badRequest } from '../lib/errors.js';

export const usersRouter = Router();
const idParam = z.object({ id: idSchema });

usersRouter.use(requireAuth, requireAdmin);

usersRouter.get('/', validate(listUsersQuerySchema, 'query'), async (req, res) => {
  res.json(await userService.listUsers(validatedQuery(req)));
});

usersRouter.get('/:id', validate(idParam, 'params'), async (req, res) => {
  res.json(await userService.getUser(param(req, 'id')));
});

/**
 * Role changes are SUPER_ADMIN only — a plain ADMIN promoting themselves or a
 * peer would make the role boundary meaningless.
 */
usersRouter.patch(
  '/:id/role',
  requireRole('SUPER_ADMIN'),
  validate(idParam, 'params'),
  validate(updateUserRoleSchema),
  async (req, res) => {
    if (param(req, 'id') === req.user!.id) {
      throw badRequest('You cannot change your own role');
    }
    const user = await userService.updateUserRole(param(req, 'id'), req.body.role);
    audit(req, 'USER_ROLE_CHANGED', 'UserProfile', user.id, { role: req.body.role });
    res.json(user);
  },
);

/**
 * Bulk-create student accounts from a CSV of roll numbers.
 *
 * The generated passwords come back in the response and are never recoverable
 * afterwards — only the scrypt hash is stored — so the admin UI downloads them
 * immediately as a sheet to hand out.
 */
usersRouter.post(
  '/import-students',
  importLimiter,
  validate(importStudentsCsvSchema),
  async (req, res) => {
    const report = await importStudentsCsv(req.body.csv);
    audit(req, 'STUDENTS_IMPORTED', 'UserProfile', null, {
      created: report.created,
      updated: report.updated,
      failed: report.failed,
    });
    res.json({
      ...report,
      credentialsCsv: toCsv(
        ['loginId', 'fullName', 'password'],
        report.credentials as unknown as Record<string, unknown>[],
      ),
    });
  },
);

/** Issue a new password for one student who lost theirs. */
usersRouter.post('/:id/reset-password', validate(idParam, 'params'), async (req, res) => {
  const user = await userService.getUser(param(req, 'id'));
  if (user.role !== 'STUDENT') throw badRequest('Only student accounts have a local password');
  const credential = await resetStudentPassword(user.id);
  audit(req, 'STUDENT_PASSWORD_RESET', 'UserProfile', user.id);
  res.json(credential);
});
