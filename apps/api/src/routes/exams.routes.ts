import { Router } from 'express';
import { z } from 'zod';
import {
  createExamSchema,
  updateExamSchema,
  listExamsQuerySchema,
  hackerRankLinkSchema,
  idSchema,
} from '@apti/shared';
import { isAdmin, requireAdmin, requireAuth } from '../middleware/auth.js';
import { validate, validatedQuery, param } from '../middleware/validate.js';
import { audit } from '../middleware/audit.js';
import { toCsv } from '../lib/csv.js';
import * as examService from '../services/exam.service.js';
import * as antiCheat from '../services/antiCheat.service.js';
import { expireOverdueAttempts } from '../services/attempt.service.js';
import { getFinalResults } from '../services/hackerrank.service.js';

export const examsRouter = Router();
const idParam = z.object({ id: idSchema });

examsRouter.use(requireAuth);

examsRouter.post('/', requireAdmin, validate(createExamSchema), async (req, res) => {
  const exam = await examService.createExam(req.body, req.user!.id);
  audit(req, 'EXAM_CREATED', 'Exam', exam.id, { title: exam.title });
  res.status(201).json(exam);
});

/** Admins see every exam; students see only their assigned, published ones. */
examsRouter.get('/', validate(listExamsQuerySchema, 'query'), async (req, res) => {
  if (!isAdmin(req.user!)) {
    return res.json({ items: await examService.listExamsForStudent(req.user!.id) });
  }
  res.json(await examService.listExamsForAdmin(validatedQuery(req)));
});

examsRouter.get('/:id', validate(idParam, 'params'), async (req, res) => {
  if (!isAdmin(req.user!)) {
    return res.json(await examService.getExamForStudent(param(req, 'id'), req.user!.id));
  }
  res.json(await examService.getExam(param(req, 'id')));
});

examsRouter.patch(
  '/:id',
  requireAdmin,
  validate(idParam, 'params'),
  validate(updateExamSchema),
  async (req, res) => {
    const exam = await examService.updateExam(param(req, 'id'), req.body);
    audit(req, 'EXAM_UPDATED', 'Exam', exam.id);
    res.json(exam);
  },
);

examsRouter.post('/:id/publish', requireAdmin, validate(idParam, 'params'), async (req, res) => {
  const exam = await examService.publishExam(param(req, 'id'));
  audit(req, 'EXAM_PUBLISHED', 'Exam', exam.id);
  res.json(exam);
});

/** Aptitude results. `?format=csv` streams the export the admin UI downloads. */
examsRouter.get(
  '/:id/results',
  requireAdmin,
  validate(idParam, 'params'),
  async (req, res) => {
    // Sweep attempts whose timer ran out unattended so results are never stale.
    await expireOverdueAttempts(param(req, 'id'));
    const data = await examService.getExamResults(param(req, 'id'));

    if (req.query.format === 'csv') {
      const headers = [
        'email',
        'fullName',
        'collegeName',
        'status',
        'score',
        'maxScore',
        'passed',
        'suspiciousScore',
        'startedAt',
        'submittedAt',
      ];
      res.type('text/csv').attachment(`aptitude-results-${param(req, 'id')}.csv`);
      return res.send(toCsv(headers, data.results as unknown as Record<string, unknown>[]));
    }
    res.json(data);
  },
);

/** Live in-progress attempts for the exam monitor. */
examsRouter.get('/:id/live', requireAdmin, validate(idParam, 'params'), async (req, res) => {
  res.json({ items: await examService.getLiveAttempts(param(req, 'id')) });
});

/** Suspicious-activity summary, worst first. */
examsRouter.get('/:id/suspicious', requireAdmin, validate(idParam, 'params'), async (req, res) => {
  res.json({ items: await antiCheat.getSuspiciousReport(param(req, 'id')) });
});

/* ---- HackerRank, exam-scoped ---- */

examsRouter.patch(
  '/:id/hackerrank-link',
  requireAdmin,
  validate(idParam, 'params'),
  validate(hackerRankLinkSchema),
  async (req, res) => {
    const exam = await examService.setHackerRankLink(param(req, 'id'), req.body.hackerRankTestUrl);
    audit(req, 'EXAM_HACKERRANK_LINK_SET', 'Exam', exam.id, { url: req.body.hackerRankTestUrl });
    res.json(exam);
  },
);

/** Combined aptitude + coding ranking. `?format=csv` for the final export. */
examsRouter.get(
  '/:id/final-results',
  requireAdmin,
  validate(idParam, 'params'),
  async (req, res) => {
    await expireOverdueAttempts(param(req, 'id'));
    const data = await getFinalResults(param(req, 'id'));

    if (req.query.format === 'csv') {
      const headers = [
        'rank',
        'email',
        'fullName',
        'collegeName',
        'aptitudeStatus',
        'aptitudeScore',
        'aptitudeMaxScore',
        'aptitudePercent',
        'aptitudePassed',
        'codingScore',
        'codingMaxScore',
        'codingPercent',
        'codingStatus',
        'combinedPercent',
        'suspiciousScore',
      ];
      res.type('text/csv').attachment(`final-results-${param(req, 'id')}.csv`);
      return res.send(toCsv(headers, data.results as unknown as Record<string, unknown>[]));
    }
    res.json(data);
  },
);
