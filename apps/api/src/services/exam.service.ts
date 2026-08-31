import { prisma, type Prisma } from '@apti/db';
import type { z } from 'zod';
import type { createExamSchema, updateExamSchema, ExamStatus } from '@apti/shared';
import { badRequest, forbidden, notFound } from '../lib/errors.js';

type CreateInput = z.infer<typeof createExamSchema>;
type UpdateInput = z.infer<typeof updateExamSchema>;

export async function createExam(input: CreateInput, createdById: string) {
  const { questions, ...rest } = input;
  return prisma.exam.create({
    data: {
      ...rest,
      createdById,
      questions: {
        create: questions.map((q, i) => ({
          questionId: q.questionId,
          marksOverride: q.marksOverride ?? null,
          order: i,
        })),
      },
    },
    include: { questions: { include: { question: true } } },
  });
}

export async function listExamsForAdmin(params: {
  page: number;
  pageSize: number;
  status?: ExamStatus;
}) {
  const where: Prisma.ExamWhereInput = params.status ? { status: params.status } : {};
  const [items, total] = await Promise.all([
    prisma.exam.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: { _count: { select: { questions: true, assignments: true, attempts: true } } },
    }),
    prisma.exam.count({ where }),
  ]);
  return { items, total, page: params.page, pageSize: params.pageSize };
}

/**
 * Every published exam is offered to every enrolled student — there is no
 * per-student invite list to maintain, and a student enrolled after the exam
 * was published still sees it.
 *
 * ExamAssignment is still written, but only when a student actually starts, so
 * it tracks participation rather than intent.
 */
export async function listExamsForStudent(studentId: string) {
  const exams = await prisma.exam.findMany({
    where: { status: 'PUBLISHED' },
    select: {
      id: true,
      title: true,
      description: true,
      durationMinutes: true,
      startsAt: true,
      endsAt: true,
      passingScore: true,
      hackerRankTestUrl: true,
      _count: { select: { questions: true } },
    },
    orderBy: { startsAt: 'asc' },
  });

  const attempts = await prisma.attempt.findMany({
    where: { studentId, examId: { in: exams.map((e) => e.id) } },
    select: { id: true, examId: true, status: true, submittedAt: true, expiresAt: true },
  });
  const attemptByExam = new Map(attempts.map((a) => [a.examId, a]));

  return exams.map(({ _count, ...exam }) => ({
    ...exam,
    questionCount: _count.questions,
    attempt: attemptByExam.get(exam.id) ?? null,
  }));
}

export async function getExam(id: string) {
  const exam = await prisma.exam.findUnique({
    where: { id },
    include: {
      questions: { include: { question: { include: { options: true } } }, orderBy: { order: 'asc' } },
      _count: { select: { assignments: true, attempts: true } },
    },
  });
  if (!exam) throw notFound('Exam not found');
  return exam;
}

/** Instructions page payload — no questions, and only for a published exam. */
export async function getExamForStudent(examId: string, studentId: string) {
  const found = await prisma.exam.findUnique({
    where: { id: examId },
    include: { _count: { select: { questions: true } } },
  });
  if (!found) throw notFound('Exam not found');
  if (found.status !== 'PUBLISHED') throw forbidden('Exam is not open');

  const attempt = await prisma.attempt.findUnique({
    where: { examId_studentId: { examId, studentId } },
    select: { id: true, status: true, expiresAt: true, submittedAt: true },
  });

  const { _count, ...exam } = found;
  return { ...exam, questionCount: _count.questions, attempt };
}

export async function updateExam(id: string, input: UpdateInput) {
  const exam = await getExam(id);
  const { questions, ...rest } = input;

  // Changing the question set after someone has started would change their paper
  // mid-flight and invalidate maxScore. Refuse once attempts exist.
  if (questions && exam._count.attempts > 0) {
    throw badRequest('Cannot change questions after attempts have started');
  }

  return prisma.exam.update({
    where: { id },
    data: {
      ...rest,
      ...(questions
        ? {
            questions: {
              deleteMany: {},
              create: questions.map((q, i) => ({
                questionId: q.questionId,
                marksOverride: q.marksOverride ?? null,
                order: i,
              })),
            },
          }
        : {}),
    },
    include: { questions: { include: { question: true } } },
  });
}

export async function publishExam(id: string) {
  const exam = await getExam(id);
  if (exam.questions.length === 0) throw badRequest('Cannot publish an exam with no questions');
  if (exam.endsAt <= new Date()) throw badRequest('Cannot publish an exam whose window has passed');
  return prisma.exam.update({ where: { id }, data: { status: 'PUBLISHED' } });
}

export function setHackerRankLink(examId: string, url: string | null) {
  return prisma.exam.update({ where: { id: examId }, data: { hackerRankTestUrl: url } });
}

/** Aptitude results for one exam, best score first. */
export async function getExamResults(examId: string) {
  const exam = await getExam(examId);
  const attempts = await prisma.attempt.findMany({
    where: { examId },
    include: { student: { select: { id: true, email: true, fullName: true, collegeName: true } } },
    orderBy: [{ score: 'desc' }, { submittedAt: 'asc' }],
  });

  return {
    exam: { id: exam.id, title: exam.title, passingScore: exam.passingScore },
    results: attempts.map((a) => ({
      attemptId: a.id,
      studentId: a.studentId,
      email: a.student.email,
      fullName: a.student.fullName,
      collegeName: a.student.collegeName,
      status: a.status,
      score: a.score,
      maxScore: a.maxScore,
      passed: a.submittedAt !== null && a.score >= exam.passingScore,
      suspiciousScore: a.suspiciousScore,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt,
    })),
  };
}

/** Attempts still running — the admin "live" view. */
export function getLiveAttempts(examId: string) {
  return prisma.attempt.findMany({
    where: { examId, status: 'IN_PROGRESS' },
    include: { student: { select: { id: true, email: true, fullName: true } } },
    orderBy: { suspiciousScore: 'desc' },
  });
}
