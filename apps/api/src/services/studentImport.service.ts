import { prisma } from '@apti/db';
import type { StudentCredential } from '@apti/shared';
import { parseCsv } from '../lib/csv.js';
import { generatePassword, hashPassword } from '../lib/password.js';

export interface StudentImportReport {
  created: number;
  updated: number;
  failed: number;
  errors: { row: number; message: string }[];
  /** Plaintext passwords — returned once, never stored or retrievable again. */
  credentials: StudentCredential[];
}

/**
 * Bulk-create student accounts.
 *
 * Header (case-insensitive):
 *   loginid,fullname,email,collegename
 *
 * Only `loginid` is required — it is the roll number the student signs in
 * with. Email is optional and is never verified: these accounts are handed
 * out by the college, not self-registered.
 *
 * Re-importing a roll number resets that student's password rather than
 * failing, so a "lost my password" batch is the same operation as the first
 * upload. Rows are independent: one bad row does not roll back the file.
 */
export async function importStudentsCsv(csv: string): Promise<StudentImportReport> {
  const rows = parseCsv(csv);
  const report: StudentImportReport = {
    created: 0,
    updated: 0,
    failed: 0,
    errors: [],
    credentials: [],
  };

  const seen = new Set<string>();

  for (const [i, row] of rows.entries()) {
    const rowNo = i + 2; // +1 header, +1 for 1-based line numbers
    try {
      const loginId = (row.loginid ?? row.rollno ?? '').trim();
      if (!loginId) throw new Error('loginId (roll number) is required');
      if (seen.has(loginId)) throw new Error(`duplicate loginId "${loginId}" in this file`);
      seen.add(loginId);

      const email = row.email?.trim().toLowerCase() || null;
      const fullName = row.fullname?.trim() || null;
      const collegeName = row.collegename?.trim() || null;

      const password = generatePassword();
      const passwordHash = await hashPassword(password);

      const existing = await prisma.userProfile.findUnique({ where: { loginId } });

      await prisma.userProfile.upsert({
        where: { loginId },
        // A re-import must not silently blank a name that is already on file.
        update: {
          passwordHash,
          ...(fullName ? { fullName } : {}),
          ...(email ? { email } : {}),
          ...(collegeName ? { collegeName } : {}),
        },
        create: { loginId, passwordHash, email, fullName, collegeName, role: 'STUDENT' },
      });

      if (existing) report.updated++;
      else report.created++;
      report.credentials.push({ loginId, fullName, password });
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

/** Reset one student's password and return the new one. */
export async function resetStudentPassword(id: string): Promise<StudentCredential> {
  const password = generatePassword();
  const user = await prisma.userProfile.update({
    where: { id },
    data: { passwordHash: await hashPassword(password) },
  });
  return { loginId: user.loginId ?? '', fullName: user.fullName, password };
}
