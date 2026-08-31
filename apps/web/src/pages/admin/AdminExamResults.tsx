import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { downloadCsv } from '../../lib/api';
import { useApi } from '../../lib/useApi';

interface ResultRow {
  attemptId: string;
  email: string;
  fullName: string | null;
  status: string;
  score: number;
  maxScore: number;
  passed: boolean;
  suspiciousScore: number;
  submittedAt: string | null;
}

interface SuspiciousRow {
  attemptId: string;
  student: { email: string; fullName: string | null };
  suspiciousScore: number;
  totalEvents: number;
  eventCounts: Record<string, number>;
}

interface FinalRow {
  rank: number;
  email: string;
  fullName: string | null;
  aptitudePercent: number;
  codingPercent: number | null;
  combinedPercent: number;
  hasCodingResult: boolean;
}

type Tab = 'aptitude' | 'suspicious' | 'final';

export function AdminExamResults() {
  const { examId } = useParams<{ examId: string }>();
  const [tab, setTab] = useState<Tab>('aptitude');

  const results = useApi<{ exam: { title: string }; results: ResultRow[] }>(
    `/exams/${examId}/results`,
  );
  const suspicious = useApi<{ items: SuspiciousRow[] }>(`/exams/${examId}/suspicious`);
  const final = useApi<{ results: FinalRow[] }>(`/exams/${examId}/final-results`);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'aptitude', label: 'Aptitude results' },
    { id: 'suspicious', label: 'Suspicious activity' },
    { id: 'final', label: 'Combined ranking' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">
          {results.data?.exam.title ?? 'Results'}
        </h1>
        <div className="flex gap-2">
          <button className="btn-secondary"
            onClick={() => downloadCsv(`/exams/${examId}/results?format=csv`, `aptitude-${examId}.csv`)}>
            Export aptitude CSV
          </button>
          <button className="btn-secondary"
            onClick={() => downloadCsv(`/exams/${examId}/final-results?format=csv`, `final-${examId}.csv`)}>
            Export final CSV
          </button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm ${
              tab === t.id
                ? 'border-b-2 border-slate-900 font-medium text-slate-900'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'aptitude' && (
        <Table
          loading={results.loading}
          error={results.error}
          headers={['Student', 'Status', 'Score', 'Result', 'Flags', 'Submitted']}
          rows={(results.data?.results ?? []).map((r) => [
            r.fullName ?? r.email,
            r.status,
            `${r.score} / ${r.maxScore}`,
            r.passed ? 'Pass' : 'Fail',
            String(r.suspiciousScore),
            r.submittedAt ? new Date(r.submittedAt).toLocaleString() : '—',
          ])}
        />
      )}

      {tab === 'suspicious' && (
        <>
          <p className="text-xs text-slate-500">
            Browser-activity signals only. Use them to decide what to review — they are not proof
            of cheating on their own.
          </p>
          <Table
            loading={suspicious.loading}
            error={suspicious.error}
            headers={['Student', 'Score', 'Events', 'Breakdown']}
            rows={(suspicious.data?.items ?? []).map((s) => [
              s.student.fullName ?? s.student.email,
              String(s.suspiciousScore),
              String(s.totalEvents),
              Object.entries(s.eventCounts)
                .map(([k, v]) => `${k}×${v}`)
                .join(', ') || '—',
            ])}
          />
        </>
      )}

      {tab === 'final' && (
        <>
          <p className="text-xs text-slate-500">
            Aptitude and coding are each converted to a percentage and averaged. Students without
            an imported coding result are ranked on aptitude alone.
          </p>
          <Table
            loading={final.loading}
            error={final.error}
            headers={['Rank', 'Student', 'Aptitude %', 'Coding %', 'Combined %']}
            rows={(final.data?.results ?? []).map((r) => [
              String(r.rank),
              r.fullName ?? r.email,
              r.aptitudePercent.toFixed(1),
              r.hasCodingResult ? r.codingPercent!.toFixed(1) : 'not imported',
              r.combinedPercent.toFixed(1),
            ])}
          />
        </>
      )}
    </div>
  );
}

function Table({
  headers,
  rows,
  loading,
  error,
}: {
  headers: string[];
  rows: string[][];
  loading: boolean;
  error: string | null;
}) {
  if (loading) return <p className="text-slate-500">Loading…</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (rows.length === 0) return <p className="text-slate-500">Nothing to show yet.</p>;

  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>{headers.map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => <td key={j} className="px-4 py-2 text-slate-700">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
