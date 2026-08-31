import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';

interface ExamRow {
  id: string;
  title: string;
}

interface Report {
  imported: number;
  skipped: number;
  errors: { row: number; email: string; message: string }[];
}

export function AdminHackerRankImport() {
  const { data } = useApi<{ items: ExamRow[] }>('/exams?pageSize=100');
  const [examId, setExamId] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (!examId) return setError('Pick the exam this export belongs to first');
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const csv = await file.text();
      setReport(await api.post<Report>('/hackerrank/import-results-csv', { examId, csv }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Import HackerRank results</h1>

      <div className="card space-y-4">
        <div>
          <label className="label" htmlFor="exam">Exam</label>
          <select id="exam" className="input" value={examId} onChange={(e) => setExamId(e.target.value)}>
            <option value="">Select an exam…</option>
            {(data?.items ?? []).map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="csv">HackerRank CSV export</label>
          <input id="csv" type="file" accept=".csv,text/csv" disabled={busy || !examId}
            onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
          <p className="mt-2 text-xs text-slate-500">
            Recognised columns: email (or candidate email / login), score, max score, status.
            Students are matched by email, so a candidate must use the same address they signed in
            with. Re-importing a corrected export overwrites the previous one.
          </p>
        </div>

        {busy && <p className="text-sm text-slate-500">Importing…</p>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </div>

      {report && (
        <div className="card">
          <p className="font-medium text-slate-900">
            Imported {report.imported}, skipped {report.skipped}
          </p>
          {report.errors.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-red-600">
              {report.errors.slice(0, 20).map((e) => (
                <li key={e.row}>Row {e.row} ({e.email || 'no email'}): {e.message}</li>
              ))}
            </ul>
          )}
          {examId && (
            <Link to={`/admin/exams/${examId}/results`} className="btn-secondary mt-4">
              View combined ranking
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
