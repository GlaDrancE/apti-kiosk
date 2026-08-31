import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  startAttemptSchema,
  saveAnswersSchema,
  attemptEventsSchema,
  submitAttemptSchema,
  idSchema,
} from '@apti/shared';
import { isAdmin, requireAuth } from '../middleware/auth.js';
import { validate, param } from '../middleware/validate.js';
import { attemptWriteLimiter } from '../middleware/rateLimit.js';
import * as attemptService from '../services/attempt.service.js';
import * as antiCheat from '../services/antiCheat.service.js';

export const attemptsRouter = Router();
const attemptParam = z.object({ attemptId: idSchema });

attemptsRouter.use(requireAuth);

/**
 * Students act on their own attempts only. Admins may read any attempt (for the
 * monitor) but never write to one — passing null here means "no ownership
 * filter", so it is only ever used on read paths.
 */
const ownerFilter = (req: Request) => (isAdmin(req.user!) ? null : req.user!.id);

attemptsRouter.post('/start', validate(startAttemptSchema), async (req, res) => {
  const attempt = await attemptService.startAttempt(req.body.examId, req.user!.id);
  res.status(201).json({ attemptId: attempt.id, expiresAt: attempt.expiresAt });
});

attemptsRouter.get('/:attemptId', validate(attemptParam, 'params'), async (req, res) => {
  res.json(await attemptService.getAttemptView(param(req, 'attemptId'), ownerFilter(req)));
});

/** Autosave. Called every ~15s by the test runner, hence its own rate limit. */
attemptsRouter.patch(
  '/:attemptId/answers',
  attemptWriteLimiter,
  validate(attemptParam, 'params'),
  validate(saveAnswersSchema),
  async (req, res) => {
    res.json(await attemptService.saveAnswers(param(req, 'attemptId'), req.user!.id, req.body));
  },
);

/**
 * Batched browser-activity events. Returns the running suspicion score so the
 * client can warn the student, and auto-submits when the exam's threshold is
 * crossed.
 */
attemptsRouter.post(
  '/:attemptId/events',
  attemptWriteLimiter,
  validate(attemptParam, 'params'),
  validate(attemptEventsSchema),
  async (req, res) => {
    const attemptId = param(req, 'attemptId');
    await attemptService.assertAttemptWritable(attemptId, req.user!.id);
    const result = await antiCheat.recordEvents(attemptId, req.body);

    if (result.shouldAutoSubmit) {
      await attemptService.submitAttempt(attemptId, 'AUTO_SUBMITTED');
      return res.json({ ...result, autoSubmitted: true });
    }
    res.json({ ...result, autoSubmitted: false });
  },
);

/** Admin view of one attempt's full event timeline. */
attemptsRouter.get('/:attemptId/events', validate(attemptParam, 'params'), async (req, res) => {
  // Reuse the ownership check: a student may replay their own timeline.
  await attemptService.loadAttempt(param(req, 'attemptId'), ownerFilter(req));
  res.json({ items: await antiCheat.getAttemptTimeline(param(req, 'attemptId')) });
});

attemptsRouter.post(
  '/:attemptId/submit',
  validate(attemptParam, 'params'),
  validate(submitAttemptSchema),
  async (req, res) => {
    const attemptId = param(req, 'attemptId');
    await attemptService.loadAttempt(attemptId, req.user!.id);
    const status = req.body.reason === 'MANUAL' ? 'SUBMITTED' : 'AUTO_SUBMITTED';
    res.json(await attemptService.submitAttempt(attemptId, status));
  },
);
