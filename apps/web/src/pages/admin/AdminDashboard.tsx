import { Link } from 'react-router-dom';
import { useApi } from '../../lib/useApi';

interface ExamRow {
  id: string;
  title: string;
  status: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  _count: { questions: number; assignments: number; attempts: number };
}

export function AdminDashboard() {
  const exams = useApi<{ items: ExamRow[]; total: number }>('/exams?pageSize=100');
  const questions = useApi<{ total: number }>('/questions?pageSize=1');
  const students = useApi<{ total: number }>('/users?role=STUDENT&pageSize=1');

  const items = exams.data?.items ?? [];
  const published = items.filter((e) => e.status === 'PUBLISHED');
  const attempts = items.reduce((n, e) => n + e._count.attempts, 0);

  const stats = [
    { label: 'Questions in bank', value: questions.data?.total ?? '—' },
    { label: 'Students', value: students.data?.total ?? '—' },
    { label: 'Published exams', value: published.length },
    { label: 'Attempts recorded', value: attempts },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card">
            <div className="text-sm text-slate-500">{s.label}</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{s.value}</div>
          </div>
        ))}
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium text-slate-900">Recent exams</h2>
          <Link to="/admin/exams" className="text-sm text-slate-600 underline">View all</Link>
        </div>

        {exams.loading && <p className="text-slate-500">Loading…</p>}
        {exams.error && <p className="text-red-600">{exams.error}</p>}

        <div className="card divide-y divide-slate-100 p-0">
          {items.slice(0, 8).map((exam) => (
            <Link
              key={exam.id}
              to={`/admin/exams/${exam.id}`}
              className="flex items-center justify-between px-5 py-3 hover:bg-slate-50"
            >
              <div>
                <div className="font-medium text-slate-900">{exam.title}</div>
                <div className="text-xs text-slate-500">
                  {exam._count.questions} questions · {exam._count.assignments} assigned ·{' '}
                  {exam._count.attempts} attempts
                </div>
              </div>
              <span
                className={`badge ${
                  exam.status === 'PUBLISHED'
                    ? 'bg-green-100 text-green-800'
                    : exam.status === 'DRAFT'
                      ? 'bg-slate-100 text-slate-600'
                      : 'bg-red-100 text-red-700'
                }`}
              >
                {exam.status}
              </span>
            </Link>
          ))}
          {!exams.loading && items.length === 0 && (
            <p className="px-5 py-6 text-slate-500">No exams yet. Create one to get started.</p>
          )}
        </div>
      </section>
    </div>
  );
}
