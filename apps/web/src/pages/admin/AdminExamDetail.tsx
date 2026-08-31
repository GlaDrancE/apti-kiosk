import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';

interface ExamDetail {
  id: string;
  title: string;
  description: string | null;
  status: string;
  durationMinutes: number;
  passingScore: number;
  startsAt: string;
  endsAt: string;
  hackerRankTestUrl: string | null;
  questions: { questionId: string; order: number; question: { id: string; text: string; topic: string; marks: number } }[];
  _count: { assignments: number; attempts: number };
}

interface BankQuestion {
  id: string;
  text: string;
  topic: string;
  difficulty: string;
  marks: number;
}

interface LiveAttempt {
  id: string;
  status: string;
  suspiciousScore: number;
  expiresAt: string;
  student: { email: string; fullName: string | null };
}

export function AdminExamDetail() {
  const { examId } = useParams<{ examId: string }>();
  const exam = useApi<ExamDetail>(`/exams/${examId}`);
  const bank = useApi<{ items: BankQuestion[] }>('/questions?pageSize=100&isActive=true');
  const live = useApi<{ items: LiveAttempt[] }>(`/exams/${examId}/live`);

  const [selected, setSelected] = useState<string[]>([]);
  const [hrUrl, setHrUrl] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!exam.data) return;
    setSelected(exam.data.questions.map((q) => q.questionId));
    setHrUrl(exam.data.hackerRankTestUrl ?? '');
  }, [exam.data]);

  // The live monitor is only useful while the exam is running.
  useEffect(() => {
    if (exam.data?.status !== 'PUBLISHED') return;
    const id = setInterval(() => void live.reload(), 15_000);
    return () => clearInterval(id);
  }, [exam.data?.status, live.reload]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMessage(null);
    try {
      await fn();
      setMessage(ok);
      await exam.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Action failed');
    }
  };

  if (exam.loading) return <p className="text-slate-500">Loading…</p>;
  if (exam.error || !exam.data) return <p className="text-red-600">{exam.error ?? 'Not found'}</p>;

  const e = exam.data;
  const locked = e._count.attempts > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{e.title}</h1>
          <p className="text-sm text-slate-500">
            {e.status} · {e.durationMinutes} min · pass mark {e.passingScore} ·{' '}
            {e._count.attempts} attempts · {e._count.assignments} started
          </p>
        </div>
        <div className="flex gap-2">
          <Link to={`/admin/exams/${e.id}/results`} className="btn-secondary">Results</Link>
          {e.status === 'DRAFT' && (
            <button className="btn-primary"
              onClick={() => run(() => api.post(`/exams/${e.id}/publish`), 'Exam published')}>
              Publish
            </button>
          )}
          {e.status === 'PUBLISHED' && (
            <button className="btn-danger"
              onClick={() => run(() => api.patch(`/exams/${e.id}`, { status: 'CLOSED' }), 'Exam closed')}>
              Close exam
            </button>
          )}
        </div>
      </div>

      {message && <p className="rounded-md bg-slate-100 px-4 py-2 text-sm text-slate-700">{message}</p>}

      <section className="card">
        <h2 className="mb-1 font-medium text-slate-900">Questions ({selected.length})</h2>
        <p className="mb-3 text-xs text-slate-500">
          {locked
            ? 'The question set is locked because students have already started this exam.'
            : 'Tick the questions to include. Order is randomised per student anyway.'}
        </p>
        <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
          {(bank.data?.items ?? []).map((q) => (
            <label key={q.id} className="flex cursor-pointer items-start gap-2 rounded p-1.5 text-sm hover:bg-slate-50">
              <input
                type="checkbox"
                className="mt-1"
                disabled={locked}
                checked={selected.includes(q.id)}
                onChange={() =>
                  setSelected((s) => (s.includes(q.id) ? s.filter((id) => id !== q.id) : [...s, q.id]))
                }
              />
              <span className="min-w-0">
                <span className="block truncate">{q.text}</span>
                <span className="text-xs text-slate-500">{q.topic} · {q.difficulty} · +{q.marks}</span>
              </span>
            </label>
          ))}
        </div>
        <button
          className="btn-primary mt-3"
          disabled={locked}
          onClick={() =>
            run(
              () =>
                api.patch(`/exams/${e.id}`, {
                  questions: selected.map((questionId) => ({ questionId })),
                }),
              'Questions updated',
            )
          }
        >
          Save question set
        </button>
      </section>

      <section className="card">
        <h2 className="mb-1 font-medium text-slate-900">Who can sit this exam</h2>
        <p className="text-xs text-slate-500">
          Publishing opens it to every student enrolled in the portal, including anyone added
          afterwards. There is no per-exam invite list — manage the roster under{' '}
          <Link to="/admin/students" className="underline">Students</Link>.
        </p>
      </section>

      <section className="card">
        <h2 className="mb-1 font-medium text-slate-900">HackerRank coding round</h2>
        <p className="mb-3 text-xs text-slate-500">
          Shown to the student on the completion page once they submit the aptitude round.
        </p>
        <div className="flex gap-2">
          <input className="input" placeholder="https://www.hackerrank.com/tests/..."
            value={hrUrl} onChange={(ev) => setHrUrl(ev.target.value)} />
          <button
            className="btn-secondary"
            onClick={() =>
              run(
                () =>
                  api.patch(`/exams/${e.id}/hackerrank-link`, {
                    hackerRankTestUrl: hrUrl.trim() || null,
                  }),
                'Link saved',
              )
            }
          >
            Save link
          </button>
        </div>
      </section>

      <section className="card">
        <h2 className="mb-3 font-medium text-slate-900">
          Live attempts ({live.data?.items.length ?? 0})
        </h2>
        <div className="divide-y divide-slate-100">
          {(live.data?.items ?? []).map((a) => (
            <div key={a.id} className="flex items-center justify-between py-2 text-sm">
              <span>{a.student.fullName ?? a.student.email}</span>
              <span className="flex items-center gap-3 text-slate-500">
                <span>ends {new Date(a.expiresAt).toLocaleTimeString()}</span>
                <span className={`badge ${a.suspiciousScore > 15 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                  flags {a.suspiciousScore}
                </span>
              </span>
            </div>
          ))}
          {(live.data?.items.length ?? 0) === 0 && (
            <p className="py-2 text-sm text-slate-500">Nobody is taking this exam right now.</p>
          )}
        </div>
      </section>
    </div>
  );
}
