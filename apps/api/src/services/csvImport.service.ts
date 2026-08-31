import { createQuestionSchema, type QuestionType, type Difficulty } from '@apti/shared';
import { parseCsv } from '../lib/csv.js';
import { createQuestion } from './question.service.js';

export interface ImportReport {
  created: number;
  failed: number;
  errors: { row: number; message: string }[];
}

/**
 * Question bank CSV.
 *
 * Header (case-insensitive):
 *   type,topic,difficulty,text,explanation,marks,negativemarks,
 *   option1,option2,option3,option4,option5,option6,correct,numericanswer
 *
 * `correct` is 1-based option numbers for MCQs, pipe- or comma-separated
 * ("2" or "1|3"). `numericanswer` is used for NUMERIC rows instead.
 *
 * Rows are imported independently: a bad row is reported and skipped rather
 * than rolling back the whole file, so a 400-row upload with two typos still
 * lands 398 questions.
 */
export async function importQuestionsCsv(csv: string): Promise<ImportReport> {
  const rows = parseCsv(csv);
  const report: ImportReport = { created: 0, failed: 0, errors: [] };

  for (const [i, row] of rows.entries()) {
    const rowNo = i + 2; // +1 for the header, +1 for 1-based line numbers
    try {
      const correctIdx = new Set(
        (row.correct ?? '')
          .split(/[|,;]/)
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isInteger(n) && n > 0),
      );

      const options: { text: string; isCorrect: boolean }[] = [];
      for (let n = 1; n <= 6; n++) {
        const text = row[`option${n}`]?.trim();
        if (text) options.push({ text, isCorrect: correctIdx.has(n) });
      }

      const parsed = createQuestionSchema.parse({
        type: (row.type ?? 'MCQ_SINGLE').trim().toUpperCase() as QuestionType,
        topic: row.topic ?? 'General',
        difficulty: (row.difficulty ?? 'MEDIUM').trim().toUpperCase() as Difficulty,
        text: row.text ?? '',
        explanation: row.explanation?.trim() || null,
        marks: row.marks ? Number(row.marks) : 1,
        negativeMarks: row.negativemarks ? Number(row.negativemarks) : 0,
        numericAnswer: row.numericanswer ? Number(row.numericanswer) : null,
        options,
      });

      await createQuestion(parsed);
      report.created++;
    } catch (err) {
      report.failed++;
      report.errors.push({
        row: rowNo,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return report;
}
