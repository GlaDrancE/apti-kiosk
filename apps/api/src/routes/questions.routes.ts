import { Router } from 'express';
import { z } from 'zod';
import {
  createQuestionSchema,
  updateQuestionSchema,
  listQuestionsQuerySchema,
  importQuestionsCsvSchema,
  idSchema,
} from '@apti/shared';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { validate, validatedQuery, param } from '../middleware/validate.js';
import { importLimiter } from '../middleware/rateLimit.js';
import { audit } from '../middleware/audit.js';
import * as questionService from '../services/question.service.js';
import { importQuestionsCsv } from '../services/csvImport.service.js';

export const questionsRouter = Router();
const idParam = z.object({ id: idSchema });

// The whole question bank is admin-only: it contains the answer key.
questionsRouter.use(requireAuth, requireAdmin);

questionsRouter.post('/', validate(createQuestionSchema), async (req, res) => {
  const question = await questionService.createQuestion(req.body);
  audit(req, 'QUESTION_CREATED', 'Question', question.id);
  res.status(201).json(question);
});

questionsRouter.get('/', validate(listQuestionsQuerySchema, 'query'), async (req, res) => {
  res.json(await questionService.listQuestions(validatedQuery(req)));
});

questionsRouter.post(
  '/import-csv',
  importLimiter,
  validate(importQuestionsCsvSchema),
  async (req, res) => {
    const report = await importQuestionsCsv(req.body.csv);
    audit(req, 'QUESTIONS_IMPORTED', 'Question', null, {
      created: report.created,
      failed: report.failed,
    });
    res.json(report);
  },
);

questionsRouter.get('/:id', validate(idParam, 'params'), async (req, res) => {
  res.json(await questionService.getQuestion(param(req, 'id')));
});

questionsRouter.patch(
  '/:id',
  validate(idParam, 'params'),
  validate(updateQuestionSchema),
  async (req, res) => {
    const question = await questionService.updateQuestion(param(req, 'id'), req.body);
    audit(req, 'QUESTION_UPDATED', 'Question', question.id);
    res.json(question);
  },
);

questionsRouter.delete('/:id', validate(idParam, 'params'), async (req, res) => {
  const question = await questionService.deleteQuestion(param(req, 'id'));
  audit(req, 'QUESTION_DEACTIVATED', 'Question', question.id);
  res.json(question);
});
