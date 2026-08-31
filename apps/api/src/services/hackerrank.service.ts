import { prisma } from '@apti/db';
import { parseCsv } from '../lib/csv.js';
import { notFound } from '../lib/errors.js';

export interface HackerRankImportReport {
  imported: number;
  skipped: number;
  errors: { row: number; email: string; message: string }[];
}

const pick = (row: Record<string, string>, ...keys: string[]) => {
  for (const k of keys) if (row[k]?.trim()) return row[k]!.trim();
  return '';
};

/**
 * Import a HackerRank test-result export for one exam.
 *
 * Column names differ between HackerRank exports, so the common aliases are
 * accepted: email / candidate email, score / total score, max score, status.
 * Students are matched by email against UserProfile — a row for someone with no
 * profile is reported and skipped, never auto-created, because a typo'd email
 * would otherwise silently create a ghost candidate.
 */
export async function importResultsCsv(
  examId: string,
  csv: string,
): Promise<HackerRankImportReport> {
  const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { id: true } });
  if (!exam) throw notFound('Exam not found');

  const rows = parseCsv(csv);
  const report: HackerRankImportReport = { imported: 0, skipped: 0, errors: [] };

  for (const [i, row] of rows.entries()) {
    const rowNo = i + 2;
    const email = pick(row, 'email', 'candidate email', 'candidate_email', 'login').toLowerCase();

    try {
      if (!email) throw new Error('Missing email column');

      const student = await prisma.userProfile.findUnique({ where: { email } });
      if (!student) throw new Error('No student profile with this email');

      const score = Number(pick(row, 'score', 'total score', 'total_score') || 0);
      const maxScore = Number(pick(row, 'max score', 'max_score', 'maximum score') || 0);
      if (!Number.isFinite(score) || !Number.isFinite(maxScore)) {
        throw new Error('Score columns are not numeric');
      }

      await prisma.hackerRankResult.upsert({
        where: { examId_studentId: { examId, studentId: student.id } },
        create: {
          examId,
          studentId: student.id,
          hackerRankEmail: email,
          score,
          maxScore,
          status: pick(row, 'status', 'result') || 'IMPORTED',
        },
        update: {
          hackerRankEmail: email,
          score,
          maxScore,
          status: pick(row, 'status', 'result') || 'IMPORTED',
          importedAt: new Date(),
        },
      });
      report.imported++;
    } catch (err) {
      report.skipped++;
      report.errors.push({
        row: rowNo,
        email,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return report;
}

const percent = (score: number, max: number) => (max > 0 ? (score / max) * 100 : 0);

/**
 * Combined aptitude + coding ranking for one exam.
 *
 * The two rounds are marked out of different totals, so ranking on raw sums
 * would let whichever round has the bigger denominator dominate. Each round is
 * converted to a percentage and averaged with equal weight; a student with no
 * coding result is ranked on aptitude alone and flagged.
 */
export async function getFinalResults(examId: string) {
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) throw notFound('Exam not found');

  const assignments = await prisma.examAssignment.findMany({
    where: { examId },
    include: {
      student: { select: { id: true, email: true, fullName: true, collegeName: true } },
    },
  });

  const [attempts, hrResults] = await Promise.all([
    prisma.attempt.findMany({ where: { examId } }),
    prisma.hackerRankResult.findMany({ where: { examId } }),
  ]);

  const attemptBy = new Map(attempts.map((a) => [a.studentId, a]));
  const hrBy = new Map(hrResults.map((h) => [h.studentId, h]));

  const rows = assignments.map((a) => {
    const attempt = attemptBy.get(a.studentId);
    const hr = hrBy.get(a.studentId);

    const aptitudePercent = attempt ? percent(attempt.score, attempt.maxScore) : 0;
    const codingPercent = hr ? percent(hr.score, hr.maxScore) : 0;
    const combinedPercent = hr ? (aptitudePercent + codingPercent) / 2 : aptitudePercent;

    return {
      studentId: a.studentId,
      email: a.student.email,
      fullName: a.student.fullName,
      collegeName: a.student.collegeName,
      aptitudeStatus: attempt?.status ?? 'NOT_STARTED',
      aptitudeScore: attempt?.score ?? null,
      aptitudeMaxScore: attempt?.maxScore ?? null,
      aptitudePercent: Number(aptitudePercent.toFixed(2)),
      aptitudePassed: attempt ? attempt.score >= exam.passingScore : false,
      suspiciousScore: attempt?.suspiciousScore ?? 0,
      codingScore: hr?.score ?? null,
      codingMaxScore: hr?.maxScore ?? null,
      codingStatus: hr?.status ?? null,
      codingPercent: hr ? Number(codingPercent.toFixed(2)) : null,
      combinedPercent: Number(combinedPercent.toFixed(2)),
      hasCodingResult: Boolean(hr),
    };
  });

  rows.sort((a, b) => b.combinedPercent - a.combinedPercent);
  return {
    exam: { id: exam.id, title: exam.title, passingScore: exam.passingScore },
    results: rows.map((r, i) => ({ rank: i + 1, ...r })),
  };
}
