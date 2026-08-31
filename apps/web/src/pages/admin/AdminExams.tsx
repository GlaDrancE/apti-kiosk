import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';

interface ExamRow {
  id: string;
  title: string;
  status: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  passingScore: number;
  _count: { questions: number; assignments: number; attempts: number };
}

/** Datetime-local wants `YYYY-MM-DDTHH:mm` in local time. */
const toLocalInput = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export function AdminExams() {
  const { data, loading, error, reload } = useApi<{ items: ExamRow[] }>('/exams?pageSize=100');
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    title: '',
    description: '',
    durationMinutes: 60,
    startsAt: toLocalInput(new Date()),
    endsAt: toLocalInput(new Date(Date.now() + 7 * 86_400_000)),
    passingScore: 0,
  });

  async function create() {
    setFormError(null);
    try {
      await api.post('/exams', {
        ...draft,
        description: draft.description || null,
        startsAt: new Date(draft.startsAt).toISOString(),
        endsAt: new Date(draft.endsAt).toISOString(),
      });
      setShowForm(false);
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create the exam');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Exams</h1>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : 'New exam'}
        </button>
      </div>

      {showForm && (
        <div className="card space-y-4">
          <div>
            <label className="label">Title</label>
            <input className="input" value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input" rows={2} value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <label className="label">Duration (min)</label>
              <input type="number" className="input" value={draft.durationMinutes}
                onChange={(e) => setDraft({ ...draft, durationMinutes: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Passing score</label>
              <input type="number" step="any" className="input" value={draft.passingScore}
                onChange={(e) => setDraft({ ...draft, passingScore: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Opens</label>
              <input type="datetime-local" className="input" value={draft.startsAt}
                onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })} />
            </div>
            <div>
              <label className="label">Closes</label>
              <input type="datetime-local" className="input" value={draft.endsAt}
                onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })} />
            </div>
          </div>
          {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
          <button className="btn-primary" onClick={create}>Create exam</button>
        </div>
      )}

      {loading && <p className="text-slate-500">Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}

      <div className="card divide-y divide-slate-100 p-0">
        {(data?.items ?? []).map((exam) => (
          <div key={exam.id} className="flex items-center justify-between px-5 py-3">
            <div>
              <Link to={`/admin/exams/${exam.id}`} className="font-medium text-slate-900 hover:underline">
                {exam.title}
              </Link>
              <div className="text-xs text-slate-500">
                {exam._count.questions} questions · {exam._count.assignments} assigned ·{' '}
                {exam._count.attempts} attempts · {exam.durationMinutes} min ·{' '}
                {new Date(exam.startsAt).toLocaleDateString()} →{' '}
                {new Date(exam.endsAt).toLocaleDateString()}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`badge ${
                exam.status === 'PUBLISHED' ? 'bg-green-100 text-green-800'
                  : exam.status === 'DRAFT' ? 'bg-slate-100 text-slate-600'
                  : 'bg-red-100 text-red-700'
              }`}>{exam.status}</span>
              <Link to={`/admin/exams/${exam.id}/results`} className="text-sm text-slate-600 underline">
                Results
              </Link>
            </div>
          </div>
        ))}
        {!loading && (data?.items.length ?? 0) === 0 && (
          <p className="px-5 py-6 text-slate-500">No exams yet.</p>
        )}
      </div>
    </div>
  );
}
