import { useState } from 'react';
import type { StudentCredential } from '@apti/shared';
import { api, downloadText } from '../../lib/api';
import { useApi } from '../../lib/useApi';

interface StudentRow {
  id: string;
  loginId: string | null;
  fullName: string | null;
  email: string | null;
  collegeName: string | null;
}

interface ImportResult {
  created: number;
  updated: number;
  failed: number;
  errors: { row: number; message: string }[];
  credentials: StudentCredential[];
  credentialsCsv: string;
}

const TEMPLATE = 'loginId,fullName,email,collegeName\n21CS001,Asha R,asha@college.edu,ABC College\n';

export function AdminStudents() {
  const students = useApi<{ items: StudentRow[]; total: number }>(
    '/users?role=STUDENT&pageSize=100',
  );
  const [result, setResult] = useState<ImportResult | null>(null);
  const [reset, setReset] = useState<StudentCredential | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    setReset(null);
    try {
      const res = await api.post<ImportResult>('/users/import-students', {
        csv: await file.text(),
      });
      setResult(res);
      // Offered immediately, and again from the panel below — the server keeps
      // only the hash, so a lost download means reissuing the passwords.
      if (res.credentials.length) downloadText(res.credentialsCsv, 'student-credentials.csv');
      await students.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(s: StudentRow) {
    setError(null);
    setResult(null);
    try {
      setReset(await api.post<StudentCredential>(`/users/${s.id}/reset-password`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Students</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every student here can sit every published exam — there is no per-exam invite list.
        </p>
      </div>

      <div className="card space-y-4">
        <h2 className="font-medium text-slate-900">Bulk create accounts</h2>
        <div>
          <label className="label" htmlFor="csv">Student CSV</label>
          <input
            id="csv"
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])}
          />
          <p className="mt-2 text-xs text-slate-500">
            Columns: <code>loginId</code> (roll number, required), <code>fullName</code>,{' '}
            <code>email</code>, <code>collegeName</code>. Passwords are generated here and shown
            once — download the sheet. Re-uploading a roll number issues a new password for that
            student and leaves their results untouched.
          </p>
          <button
            type="button"
            className="mt-2 text-xs text-slate-600 underline"
            onClick={() => downloadText(TEMPLATE, 'students-template.csv')}
          >
            Download template
          </button>
        </div>

        {busy && <p className="text-sm text-slate-500">Creating accounts…</p>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

        {result && (
          <div className="space-y-3 rounded-md bg-slate-50 p-3 text-sm">
            <p className="text-slate-700">
              {result.created} created · {result.updated} password reset · {result.failed} failed
            </p>
            {result.credentials.length > 0 && (
              <button
                className="btn-secondary"
                onClick={() => downloadText(result.credentialsCsv, 'student-credentials.csv')}
              >
                Download credentials again
              </button>
            )}
            {result.errors.length > 0 && (
              <ul className="list-inside list-disc text-red-700">
                {result.errors.map((e) => (
                  <li key={e.row}>Row {e.row}: {e.message}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {reset && (
          <p role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-900">
            New password for <strong>{reset.loginId}</strong>:{' '}
            <code className="font-mono">{reset.password}</code> — copy it now, it is not shown again.
          </p>
        )}
      </div>

      <div className="card">
        <h2 className="mb-3 font-medium text-slate-900">
          Enrolled students {students.data ? `(${students.data.total})` : ''}
        </h2>
        {students.loading && <p className="text-sm text-slate-500">Loading…</p>}
        {students.error && <p className="text-sm text-red-600">{students.error}</p>}
        {students.data?.items.length === 0 && (
          <p className="text-sm text-slate-500">No students yet — upload a CSV above.</p>
        )}
        {students.data && students.data.items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-4">Roll number</th>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">College</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {students.data.items.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="py-2 pr-4 font-mono">{s.loginId ?? '—'}</td>
                    <td className="py-2 pr-4">{s.fullName ?? '—'}</td>
                    <td className="py-2 pr-4 text-slate-500">{s.collegeName ?? '—'}</td>
                    <td className="py-2 text-right">
                      <button
                        className="text-xs text-slate-600 underline"
                        onClick={() => void resetPassword(s)}
                      >
                        Reset password
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
