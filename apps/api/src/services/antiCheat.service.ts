import { prisma } from '@apti/db';
import {
  SUSPICION_WEIGHTS,
  MAX_STRIKES,
  STRIKE_COALESCE_MS,
  isStrike,
  type AttemptEventsInput,
} from '@apti/shared';

/**
 * Browser-activity monitoring. This is NOT proctoring and NOT lockdown: a
 * second device, a phone, or a disabled JS listener defeats every signal here.
 *
 * Two separate things come out of it:
 *  - suspiciousScore, a weighted total that only ever ranks attempts for human
 *    review. It never ends an exam on its own.
 *  - strikes, a count of discrete "left the exam" acts. MAX_STRIKES of those
 *    submits the attempt, so the consequence arrives on the third tab switch
 *    rather than after a long slow climb.
 */
export async function recordEvents(attemptId: string, input: AttemptEventsInput) {
  const delta = input.events.reduce((sum, e) => sum + (SUSPICION_WEIGHTS[e.eventType] ?? 0), 0);

  const before = await prisma.attempt.findUniqueOrThrow({
    where: { id: attemptId },
    select: { lastStrikeAt: true },
  });

  // One alt-tab fires several listeners at once. Count a burst as one strike,
  // otherwise "3 strikes" would really mean "one and a half tab switches".
  const strikeTimes = input.events
    .filter((e) => isStrike(e.eventType))
    .map((e) => e.occurredAt?.getTime() ?? Date.now())
    .sort((a, b) => a - b);

  let lastCounted = before.lastStrikeAt?.getTime() ?? -Infinity;
  let newStrikes = 0;
  for (const t of strikeTimes) {
    if (t - lastCounted < STRIKE_COALESCE_MS) continue;
    newStrikes++;
    lastCounted = t;
  }

  const [, attempt] = await prisma.$transaction([
    prisma.attemptEvent.createMany({
      data: input.events.map((e) => ({
        attemptId,
        eventType: e.eventType,
        metadata: { ...e.metadata, occurredAt: e.occurredAt?.toISOString() ?? null },
      })),
    }),
    prisma.attempt.update({
      where: { id: attemptId },
      data: {
        suspiciousScore: { increment: delta },
        ...(newStrikes > 0
          ? { strikes: { increment: newStrikes }, lastStrikeAt: new Date(lastCounted) }
          : {}),
      },
      select: { suspiciousScore: true, strikes: true },
    }),
  ]);

  const remaining = Math.max(0, MAX_STRIKES - attempt.strikes);

  return {
    suspiciousScore: attempt.suspiciousScore,
    strikes: attempt.strikes,
    maxStrikes: MAX_STRIKES,
    /** Strikes left before the attempt is submitted. */
    remaining,
    /** True on a strike that did not yet end the attempt — the student is warned. */
    warn: newStrikes > 0 && remaining > 0,
    shouldAutoSubmit: attempt.strikes >= MAX_STRIKES,
  };
}

/** Full event timeline for one attempt — the admin suspicious-activity view. */
export function getAttemptTimeline(attemptId: string) {
  return prisma.attemptEvent.findMany({
    where: { attemptId },
    orderBy: { createdAt: 'asc' },
  });
}

/** Per-exam suspicion summary, worst first. */
export async function getSuspiciousReport(examId: string) {
  const attempts = await prisma.attempt.findMany({
    where: { examId },
    orderBy: { suspiciousScore: 'desc' },
    include: {
      student: { select: { id: true, email: true, fullName: true } },
      _count: { select: { events: true } },
    },
  });

  const grouped = await prisma.attemptEvent.groupBy({
    by: ['attemptId', 'eventType'],
    where: { attempt: { examId } },
    _count: { _all: true },
  });

  const counts = new Map<string, Record<string, number>>();
  for (const g of grouped) {
    const bucket = counts.get(g.attemptId) ?? {};
    bucket[g.eventType] = g._count._all;
    counts.set(g.attemptId, bucket);
  }

  return attempts.map((a) => ({
    attemptId: a.id,
    student: a.student,
    status: a.status,
    suspiciousScore: a.suspiciousScore,
    strikes: a.strikes,
    totalEvents: a._count.events,
    eventCounts: counts.get(a.id) ?? {},
  }));
}
