import { prisma, type AttemptStatus } from '@apti/db';
import {
  MAX_STRIKES,
  SUBMIT_GRACE_SECONDS,
  type AttemptQuestion,
  type AttemptView,
  type SaveAnswersInput,
} from '@apti/shared';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { seededShuffle, saltFromId } from '../lib/shuffle.js';
import { scoreAttempt } from './scoring.service.js';

/**
 * Start (or resume) an attempt.
 *
 * Any enrolled student may start any published exam inside its window — there
 * is no invite list. The assignment row is created here, so it records who
 * actually sat the exam.
 *
 * Resuming matters: a student who reloads, loses the tab, or drops off wifi
 * must land back on the same attempt with the same clock, not a fresh one.
 * The unique (examId, studentId) index makes that the only possible outcome.
 */
export async function startAttempt(examId: string, studentId: string) {
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) throw notFound('Exam not found');

  const now = new Date();
  if (exam.status !== 'PUBLISHED') throw forbidden('Exam is not open');
  if (now < exam.startsAt) throw badRequest('Exam has not started yet');
  if (now > exam.endsAt) throw badRequest('Exam window has closed');

  const existing = await prisma.attempt.findUnique({
    where: { examId_studentId: { examId, studentId } },
  });
  if (existing) {
    if (existing.status !== 'IN_PROGRESS') throw badRequest('You have already submitted this exam');
    // Resume — clock keeps running from the original start.
    return existing;
  }

  // The attempt can never outlive the exam window, however long the duration is.
  const durationEnd = new Date(now.getTime() + exam.durationMinutes * 60_000);
  const expiresAt = durationEnd < exam.endsAt ? durationEnd : exam.endsAt;

  const [attempt] = await prisma.$transaction([
    prisma.attempt.create({
      data: {
        examId,
        studentId,
        expiresAt,
        shuffleSeed: Math.floor(Math.random() * 2 ** 31),
      },
    }),
    prisma.examAssignment.upsert({
      where: { examId_studentId: { examId, studentId } },
      update: { status: 'STARTED' },
      create: { examId, studentId, status: 'STARTED' },
    }),
  ]);

  return attempt;
}

/** Load an attempt, enforcing that a student can only ever read their own. */
export async function loadAttempt(attemptId: string, studentId: string | null) {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: { exam: true, answers: true },
  });
  if (!attempt) throw notFound('Attempt not found');
  if (studentId && attempt.studentId !== studentId) throw forbidden('Not your attempt');
  return attempt;
}

/**
 * The student-facing attempt payload.
 *
 * Questions and options are shuffled from the attempt's stored seed, so the
 * order is stable across reloads but differs between students. Nothing here
 * carries `isCorrect` — the answer key never leaves the server.
 */
export async function getAttemptView(
  attemptId: string,
  studentId: string | null,
): Promise<AttemptView> {
  const attempt = await loadAttempt(attemptId, studentId);

  const examQuestions = await prisma.examQuestion.findMany({
    where: { examId: attempt.examId },
    include: { question: { include: { options: true } } },
    orderBy: { order: 'asc' },
  });

  const questions: AttemptQuestion[] = seededShuffle(examQuestions, attempt.shuffleSeed).map(
    (eq) => ({
      id: eq.question.id,
      type: eq.question.type,
      topic: eq.question.topic,
      text: eq.question.text,
      marks: eq.marksOverride ?? eq.question.marks,
      negativeMarks: eq.question.negativeMarks,
      options: seededShuffle(
        eq.question.options,
        attempt.shuffleSeed,
        saltFromId(eq.question.id),
      ).map((o) => ({ id: o.id, text: o.text })),
    }),
  );

  const answers: AttemptView['answers'] = {};
  for (const a of attempt.answers) {
    answers[a.questionId] = {
      selectedOptionIds: (a.selectedOptionIds as string[] | null) ?? [],
      numericAnswer: a.numericAnswer,
    };
  }

  return {
    id: attempt.id,
    examId: attempt.examId,
    examTitle: attempt.exam.title,
    status: attempt.status,
    startedAt: attempt.startedAt.toISOString(),
    expiresAt: attempt.expiresAt.toISOString(),
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
    suspiciousScore: attempt.suspiciousScore,
    strikes: attempt.strikes,
    maxStrikes: MAX_STRIKES,
    // Score is withheld until submission so the live paper cannot leak the key.
    score: attempt.status === 'IN_PROGRESS' ? null : attempt.score,
    maxScore: attempt.maxScore,
    hackerRankTestUrl: attempt.exam.hackerRankTestUrl,
    questions,
    answers,
  };
}

/** Guard shared by every write path on a live attempt. */
async function assertWritable(attemptId: string, studentId: string) {
  const attempt = await loadAttempt(attemptId, studentId);
  if (attempt.status !== 'IN_PROGRESS') throw badRequest('Attempt is no longer in progress');
  const deadline = attempt.expiresAt.getTime() + SUBMIT_GRACE_SECONDS * 1000;
  if (Date.now() > deadline) throw badRequest('Attempt has expired');
  return attempt;
}

/**
 * Autosave. Idempotent per (attempt, question) so a retried save after a flaky
 * connection overwrites rather than duplicating.
 */
export async function saveAnswers(
  attemptId: string,
  studentId: string,
  input: SaveAnswersInput,
) {
  const attempt = await assertWritable(attemptId, studentId);

  // Reject question ids that are not on this paper, rather than silently
  // storing junk rows that scoring would then ignore.
  const valid = new Set(
    (
      await prisma.examQuestion.findMany({
        where: { examId: attempt.examId },
        select: { questionId: true },
      })
    ).map((q) => q.questionId),
  );
  const unknown = input.answers.filter((a) => !valid.has(a.questionId));
  if (unknown.length) throw badRequest('Answer submitted for a question not in this exam');

  await prisma.$transaction(
    input.answers.map((a) =>
      prisma.attemptAnswer.upsert({
        where: { attemptId_questionId: { attemptId, questionId: a.questionId } },
        create: {
          attemptId,
          questionId: a.questionId,
          selectedOptionIds: a.selectedOptionIds,
          numericAnswer: a.numericAnswer ?? null,
        },
        update: {
          selectedOptionIds: a.selectedOptionIds,
          numericAnswer: a.numericAnswer ?? null,
        },
      }),
    ),
  );

  return { saved: input.answers.length, savedAt: new Date().toISOString() };
}

/** Called by the events route to verify ownership before logging. */
export const assertAttemptWritable = assertWritable;

/**
 * Submit and grade. `status` distinguishes a student pressing Submit from the
 * timer firing from an anti-cheat auto-submit — all three grade identically,
 * the label is for reporting.
 */
export async function submitAttempt(
  attemptId: string,
  status: Extract<AttemptStatus, 'SUBMITTED' | 'AUTO_SUBMITTED' | 'DISQUALIFIED'> = 'SUBMITTED',
) {
  const attempt = await prisma.attempt.findUnique({ where: { id: attemptId } });
  if (!attempt) throw notFound('Attempt not found');
  // Submitting twice is a no-op, not an error: the timer and the Submit button
  // can genuinely race each other.
  if (attempt.status !== 'IN_PROGRESS') {
    return { score: attempt.score, maxScore: attempt.maxScore, status: attempt.status };
  }

  const { score, maxScore } = await scoreAttempt(attemptId);

  await prisma.$transaction([
    prisma.attempt.update({
      where: { id: attemptId },
      data: { status, submittedAt: new Date() },
    }),
    prisma.examAssignment.update({
      where: { examId_studentId: { examId: attempt.examId, studentId: attempt.studentId } },
      data: { status: 'SUBMITTED' },
    }),
  ]);

  return { score, maxScore, status };
}

/**
 * Grade attempts whose clock ran out while nobody was looking (browser closed,
 * laptop shut). Called before any admin results view so a dead attempt never
 * sits ungraded.
 *
 * ponytail: swept on read rather than by a scheduler. If you need results to be
 * correct without an admin loading the page, call this from a cron instead.
 */
export async function expireOverdueAttempts(examId?: string) {
  const overdue = await prisma.attempt.findMany({
    where: {
      status: 'IN_PROGRESS',
      expiresAt: { lt: new Date(Date.now() - SUBMIT_GRACE_SECONDS * 1000) },
      ...(examId ? { examId } : {}),
    },
    select: { id: true },
  });

  for (const a of overdue) await submitAttempt(a.id, 'AUTO_SUBMITTED');
  return overdue.length;
}
