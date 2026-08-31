import { prisma, type Prisma } from '@apti/db';
import type { z } from 'zod';
import type {
  createQuestionSchema,
  updateQuestionSchema,
  listQuestionsQuerySchema,
} from '@apti/shared';
import { conflict, notFound } from '../lib/errors.js';

type CreateInput = z.infer<typeof createQuestionSchema>;
type UpdateInput = z.infer<typeof updateQuestionSchema>;
type ListQuery = z.infer<typeof listQuestionsQuerySchema>;

export async function createQuestion(input: CreateInput) {
  const { options, ...rest } = input;
  return prisma.question.create({
    data: {
      ...rest,
      numericAnswer: rest.type === 'NUMERIC' ? (rest.numericAnswer ?? null) : null,
      options: { create: rest.type === 'NUMERIC' ? [] : options },
    },
    include: { options: true },
  });
}

export async function listQuestions(q: ListQuery) {
  const where: Prisma.QuestionWhereInput = {
    ...(q.topic ? { topic: q.topic } : {}),
    ...(q.difficulty ? { difficulty: q.difficulty } : {}),
    ...(q.type ? { type: q.type } : {}),
    ...(q.isActive === undefined ? {} : { isActive: q.isActive }),
    ...(q.search ? { text: { contains: q.search, mode: 'insensitive' } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.question.findMany({
      where,
      include: { options: true },
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.question.count({ where }),
  ]);

  return { items, total, page: q.page, pageSize: q.pageSize };
}

export async function getQuestion(id: string) {
  const question = await prisma.question.findUnique({ where: { id }, include: { options: true } });
  if (!question) throw notFound('Question not found');
  return question;
}

export async function updateQuestion(id: string, input: UpdateInput) {
  const { options, ...rest } = input;
  await getQuestion(id);

  // Options are replaced wholesale when supplied. Answers reference option ids,
  // so replacing them on a question already used in a submitted attempt would
  // orphan those references — refuse instead.
  if (options) {
    const used = await prisma.attemptAnswer.count({ where: { questionId: id } });
    if (used > 0) {
      throw conflict('Question already answered in an attempt; options cannot be replaced');
    }
  }

  return prisma.question.update({
    where: { id },
    data: {
      ...rest,
      ...(options ? { options: { deleteMany: {}, create: options } } : {}),
    },
    include: { options: true },
  });
}

/**
 * Soft delete. A hard delete would break AttemptAnswer/ExamQuestion history,
 * so a "deleted" question is simply deactivated and hidden from new exams.
 */
export async function deleteQuestion(id: string) {
  await getQuestion(id);
  return prisma.question.update({ where: { id }, data: { isActive: false } });
}
