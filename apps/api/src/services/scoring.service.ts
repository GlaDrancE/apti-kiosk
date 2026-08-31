import { prisma } from '@apti/db';
import { NUMERIC_TOLERANCE } from '@apti/shared';
import { notFound } from '../lib/errors.js';

/** Exact set equality, order-insensitive — the MCQ answer-key comparison. */
export const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && new Set(a).size === new Set([...a, ...b]).size;

/**
 * Grade every answer of an attempt and persist score/maxScore.
 *
 * ponytail: MCQ_MULTIPLE is all-or-nothing — an exactly matching option set
 * scores full marks, anything else scores the negative. Add partial credit here
 * if the scoring policy ever calls for it; nothing else needs to change.
 */
export async function scoreAttempt(attemptId: string) {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: { answers: true },
  });
  if (!attempt) throw notFound('Attempt not found');

  const examQuestions = await prisma.examQuestion.findMany({
    where: { examId: attempt.examId },
    include: { question: { include: { options: true } } },
  });

  const answerByQuestion = new Map(attempt.answers.map((a) => [a.questionId, a]));

  let score = 0;
  let maxScore = 0;
  const updates: { id: string; isCorrect: boolean; marksAwarded: number }[] = [];

  for (const eq of examQuestions) {
    const q = eq.question;
    const marks = eq.marksOverride ?? q.marks;
    maxScore += marks;

    const answer = answerByQuestion.get(q.id);
    if (!answer) continue;

    const selected = (answer.selectedOptionIds as string[] | null) ?? [];
    const attempted = q.type === 'NUMERIC' ? answer.numericAnswer !== null : selected.length > 0;
    // A blank answer never earns marks and never costs any.
    if (!attempted) {
      updates.push({ id: answer.id, isCorrect: false, marksAwarded: 0 });
      continue;
    }

    let isCorrect: boolean;
    if (q.type === 'NUMERIC') {
      isCorrect =
        q.numericAnswer !== null &&
        Math.abs((answer.numericAnswer ?? NaN) - q.numericAnswer) <= NUMERIC_TOLERANCE;
    } else {
      const key = q.options.filter((o) => o.isCorrect).map((o) => o.id);
      isCorrect = sameSet(selected, key);
    }

    const marksAwarded = isCorrect ? marks : -q.negativeMarks;
    score += marksAwarded;
    updates.push({ id: answer.id, isCorrect, marksAwarded });
  }

  // Negative marking can push a total below zero; a negative aptitude score is
  // not meaningful downstream, so the floor is 0.
  score = Math.max(0, Number(score.toFixed(4)));
  maxScore = Number(maxScore.toFixed(4));

  await prisma.$transaction([
    ...updates.map((u) =>
      prisma.attemptAnswer.update({
        where: { id: u.id },
        data: { isCorrect: u.isCorrect, marksAwarded: u.marksAwarded },
      }),
    ),
    prisma.attempt.update({ where: { id: attemptId }, data: { score, maxScore } }),
  ]);

  return { score, maxScore };
}
