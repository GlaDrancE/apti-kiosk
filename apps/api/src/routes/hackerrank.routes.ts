import { Router } from 'express';
import { importHackerRankSchema } from '@apti/shared';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { importLimiter } from '../middleware/rateLimit.js';
import { audit } from '../middleware/audit.js';
import { importResultsCsv } from '../services/hackerrank.service.js';

export const hackerrankRouter = Router();

hackerrankRouter.use(requireAuth, requireAdmin);

/**
 * Import a HackerRank coding-round export for one exam. Re-running the import
 * is safe — rows upsert on (examId, studentId), so a corrected export simply
 * overwrites the previous one.
 */
hackerrankRouter.post(
  '/import-results-csv',
  importLimiter,
  validate(importHackerRankSchema),
  async (req, res) => {
    const report = await importResultsCsv(req.body.examId, req.body.csv);
    audit(req, 'HACKERRANK_RESULTS_IMPORTED', 'Exam', req.body.examId, {
      imported: report.imported,
      skipped: report.skipped,
    });
    res.json(report);
  },
);
