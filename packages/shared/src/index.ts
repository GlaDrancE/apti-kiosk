import { z } from 'zod';

/* ------------------------------------------------------------------ *
 * Enums — mirrored 1:1 by the Prisma enums in packages/db.
 * ------------------------------------------------------------------ */

export const ROLES = ['STUDENT', 'ADMIN', 'SUPER_ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const EXAM_STATUSES = ['DRAFT', 'PUBLISHED', 'CLOSED'] as const;
export type ExamStatus = (typeof EXAM_STATUSES)[number];

export const QUESTION_TYPES = ['MCQ_SINGLE', 'MCQ_MULTIPLE', 'NUMERIC'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const ASSIGNMENT_STATUSES = ['INVITED', 'STARTED', 'SUBMITTED', 'EXPIRED'] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const ATTEMPT_STATUSES = [
  'IN_PROGRESS',
  'SUBMITTED',
  'AUTO_SUBMITTED',
  'DISQUALIFIED',
] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

export const EVENT_TYPES = [
  'TAB_HIDDEN',
  'TAB_VISIBLE',
  'WINDOW_BLUR',
  'WINDOW_FOCUS',
  'FULLSCREEN_EXIT',
  'FULLSCREEN_ENTER',
  'COPY',
  'PASTE',
  'RIGHT_CLICK',
  'DEVTOOLS_SUSPECTED',
  'NETWORK_DISCONNECT',
  'NETWORK_RECONNECT',
  'MULTIPLE_SESSION_DETECTED',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/* ------------------------------------------------------------------ *
 * Anti-cheat scoring.
 *
 * This is browser monitoring, NOT lockdown. A determined cheater with a
 * second device defeats all of it. Treat suspiciousScore as a flag for
 * human review, never as proof.
 * ------------------------------------------------------------------ */

export const SUSPICION_WEIGHTS: Record<EventType, number> = {
  TAB_HIDDEN: 5,
  TAB_VISIBLE: 0,
  WINDOW_BLUR: 3,
  WINDOW_FOCUS: 0,
  FULLSCREEN_EXIT: 4,
  FULLSCREEN_ENTER: 0,
  COPY: 6,
  PASTE: 8,
  RIGHT_CLICK: 1,
  DEVTOOLS_SUSPECTED: 10,
  NETWORK_DISCONNECT: 2,
  NETWORK_RECONNECT: 0,
  MULTIPLE_SESSION_DETECTED: 15,
};

/* ------------------------------------------------------------------ *
 * Strikes — the part that actually ends an exam.
 *
 * A score that creeps up by 3s and 5s gives a cheater a long runway before
 * anything happens. Leaving the exam window is instead counted as a discrete
 * strike: two warnings, then the attempt is submitted. suspiciousScore above
 * stays, but only to rank attempts for human review.
 * ------------------------------------------------------------------ */

/**
 * Events that mean "the student left the exam".
 *
 * Deliberately NOT TAB_HIDDEN: switching tabs fires WINDOW_BLUR *and*
 * TAB_HIDDEN, and counting both would burn two strikes for one action.
 */
export const STRIKE_EVENTS: readonly EventType[] = [
  'WINDOW_BLUR',
  'FULLSCREEN_EXIT',
  'MULTIPLE_SESSION_DETECTED',
];

export const isStrike = (e: EventType) => STRIKE_EVENTS.includes(e);

/** Strikes allowed before the attempt is submitted. 3 = two warnings, then out. */
export const MAX_STRIKES = 3;

/**
 * Strike events landing within this window of each other count once — one
 * alt-tab can fire blur and a fullscreen exit together, and that is one act.
 */
export const STRIKE_COALESCE_MS = 2_000;

/** Client timings. */
export const AUTOSAVE_INTERVAL_MS = 15_000;
export const EVENT_FLUSH_INTERVAL_MS = 10_000;
/** Grace period added to expiresAt so a slow submit is not rejected. */
export const SUBMIT_GRACE_SECONDS = 30;
/** Tolerance for NUMERIC answers (absolute). */
export const NUMERIC_TOLERANCE = 1e-6;

/* ------------------------------------------------------------------ *
 * Shared primitives
 * ------------------------------------------------------------------ */

export const idSchema = z.string().uuid();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type Pagination = z.infer<typeof paginationSchema>;

/* ------------------------------------------------------------------ *
 * Users
 * ------------------------------------------------------------------ */

export const updateUserRoleSchema = z.object({ role: z.enum(ROLES) });

/** Students sign in with the roll number and password an admin handed them. */
export const studentLoginSchema = z.object({
  loginId: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(200),
});

export const importStudentsCsvSchema = z.object({
  csv: z.string().min(1).max(5_000_000),
});

/** One row of the credentials sheet handed back after a bulk import. */
export interface StudentCredential {
  loginId: string;
  fullName: string | null;
  password: string;
}

export const listUsersQuerySchema = paginationSchema.extend({
  role: z.enum(ROLES).optional(),
  search: z.string().trim().min(1).max(120).optional(),
});

/* ------------------------------------------------------------------ *
 * Questions
 * ------------------------------------------------------------------ */

const questionOptionInput = z.object({
  text: z.string().trim().min(1).max(2000),
  isCorrect: z.boolean(),
});

const questionBase = z.object({
  type: z.enum(QUESTION_TYPES),
  topic: z.string().trim().min(1).max(120),
  difficulty: z.enum(DIFFICULTIES).default('MEDIUM'),
  text: z.string().trim().min(1).max(8000),
  explanation: z.string().trim().max(8000).nullish(),
  marks: z.number().min(0).max(100).default(1),
  negativeMarks: z.number().min(0).max(100).default(0),
  isActive: z.boolean().default(true),
  options: z.array(questionOptionInput).max(10).default([]),
  /** Required for NUMERIC, ignored otherwise. */
  numericAnswer: z.number().nullish(),
});

/** A question is only usable if its answer key is coherent with its type. */
function checkAnswerKey(
  q: { type: QuestionType; options: { isCorrect: boolean }[]; numericAnswer?: number | null },
  ctx: z.RefinementCtx,
) {
  const correct = q.options.filter((o) => o.isCorrect).length;
  if (q.type === 'NUMERIC') {
    if (q.numericAnswer === undefined || q.numericAnswer === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['numericAnswer'],
        message: 'NUMERIC questions require numericAnswer',
      });
    }
    return;
  }
  if (q.options.length < 2) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['options'],
      message: 'MCQ questions need at least 2 options',
    });
  }
  if (q.type === 'MCQ_SINGLE' && correct !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['options'],
      message: 'MCQ_SINGLE needs exactly 1 correct option',
    });
  }
  if (q.type === 'MCQ_MULTIPLE' && correct < 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['options'],
      message: 'MCQ_MULTIPLE needs at least 1 correct option',
    });
  }
}

export const createQuestionSchema = questionBase.superRefine(checkAnswerKey);
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

/** Patch: every field optional, but if type/options are touched the key is re-checked. */
export const updateQuestionSchema = questionBase.partial().superRefine((q, ctx) => {
  if (!q.type) return;
  checkAnswerKey(
    { type: q.type, options: q.options ?? [], numericAnswer: q.numericAnswer },
    ctx,
  );
});

export const listQuestionsQuerySchema = paginationSchema.extend({
  topic: z.string().trim().min(1).max(120).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  type: z.enum(QUESTION_TYPES).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  search: z.string().trim().min(1).max(200).optional(),
});

/* ------------------------------------------------------------------ *
 * Exams
 * ------------------------------------------------------------------ */

export const createExamSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(4000).nullish(),
    durationMinutes: z.number().int().min(1).max(600),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    passingScore: z.number().min(0).default(0),
    hackerRankTestUrl: z.string().url().nullish(),
    questions: z
      .array(z.object({ questionId: idSchema, marksOverride: z.number().min(0).nullish() }))
      .default([]),
  })
  .refine((e) => e.endsAt > e.startsAt, {
    path: ['endsAt'],
    message: 'endsAt must be after startsAt',
  });
export type CreateExamInput = z.infer<typeof createExamSchema>;

export const updateExamSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(4000).nullish(),
    durationMinutes: z.number().int().min(1).max(600).optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    status: z.enum(EXAM_STATUSES).optional(),
    passingScore: z.number().min(0).optional(),
    hackerRankTestUrl: z.string().url().nullish(),
    questions: z
      .array(z.object({ questionId: idSchema, marksOverride: z.number().min(0).nullish() }))
      .optional(),
  })
  .refine((e) => !e.startsAt || !e.endsAt || e.endsAt > e.startsAt, {
    path: ['endsAt'],
    message: 'endsAt must be after startsAt',
  });

export const listExamsQuerySchema = paginationSchema.extend({
  status: z.enum(EXAM_STATUSES).optional(),
});

export const hackerRankLinkSchema = z.object({
  hackerRankTestUrl: z.string().url().nullable(),
});

/* ------------------------------------------------------------------ *
 * Attempts
 * ------------------------------------------------------------------ */

export const startAttemptSchema = z.object({ examId: idSchema });

export const saveAnswersSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: idSchema,
        selectedOptionIds: z.array(idSchema).max(10).default([]),
        numericAnswer: z.number().nullish(),
      }),
    )
    .min(1)
    .max(200),
});
export type SaveAnswersInput = z.infer<typeof saveAnswersSchema>;

export const attemptEventsSchema = z.object({
  events: z
    .array(
      z.object({
        eventType: z.enum(EVENT_TYPES),
        metadata: z.record(z.unknown()).default({}),
        occurredAt: z.coerce.date().optional(),
      }),
    )
    .min(1)
    .max(100),
});
export type AttemptEventsInput = z.infer<typeof attemptEventsSchema>;

export const submitAttemptSchema = z.object({
  reason: z.enum(['MANUAL', 'TIMER', 'VIOLATION']).default('MANUAL'),
});

/* ------------------------------------------------------------------ *
 * HackerRank import
 * ------------------------------------------------------------------ */

export const importHackerRankSchema = z.object({
  examId: idSchema,
  csv: z.string().min(1).max(5_000_000),
});

export const importQuestionsCsvSchema = z.object({
  csv: z.string().min(1).max(5_000_000),
});

/* ------------------------------------------------------------------ *
 * API response shapes used by the web app
 * ------------------------------------------------------------------ */

export interface MeResponse {
  id: string;
  loginId: string | null;
  email: string | null;
  fullName: string | null;
  role: Role;
  collegeName: string | null;
}

export interface StudentLoginResponse {
  token: string;
  user: MeResponse;
}

/** A question as sent to a student mid-attempt — no answer key. */
export interface AttemptQuestion {
  id: string;
  type: QuestionType;
  topic: string;
  text: string;
  marks: number;
  negativeMarks: number;
  options: { id: string; text: string }[];
}

export interface AttemptView {
  id: string;
  examId: string;
  examTitle: string;
  status: AttemptStatus;
  startedAt: string;
  expiresAt: string;
  submittedAt: string | null;
  suspiciousScore: number;
  strikes: number;
  maxStrikes: number;
  score: number | null;
  maxScore: number;
  hackerRankTestUrl: string | null;
  questions: AttemptQuestion[];
  answers: Record<string, { selectedOptionIds: string[]; numericAnswer: number | null }>;
}
