import { Link } from 'react-router-dom';
import { useApi } from '../../lib/useApi';

interface StudentExam {
  id: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  startsAt: string;
  endsAt: string;
  questionCount: number;
  hackerRankTestUrl: string | null;
  assignmentStatus: string;
  attempt: { id: string; status: string; submittedAt: string | null } | null;
}

const fmt = (iso: string) => new Date(iso).toLocaleString();

export function StudentDashboard() {
  const { data, loading, error } = useApi<{ items: StudentExam[] }>('/exams');

  if (loading) return <p className="text-slate-500">Loading your exams…</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  const exams = data?.items ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">My exams</h1>

      {exams.length === 0 && (
        <div className="card text-slate-500">
          No exams assigned yet. Your college will assign one when it is scheduled.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {exams.map((exam) => {
          const now = Date.now();
          const open = now >= Date.parse(exam.startsAt) && now <= Date.parse(exam.endsAt);
          const done = exam.attempt && exam.attempt.status !== 'IN_PROGRESS';

          return (
            <div key={exam.id} className="card flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-medium text-slate-900">{exam.title}</h2>
                  <span
                    className={`badge ${
                      done
                        ? 'bg-green-100 text-green-800'
                        : open
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {done ? 'Completed' : open ? 'Open now' : 'Scheduled'}
                  </span>
                </div>
                {exam.description && (
                  <p className="mt-1 text-sm text-slate-600">{exam.description}</p>
                )}
                <dl className="mt-3 space-y-1 text-sm text-slate-500">
                  <div>{exam.questionCount} questions · {exam.durationMinutes} minutes</div>
                  <div>Window: {fmt(exam.startsAt)} → {fmt(exam.endsAt)}</div>
                </dl>
              </div>

              <div className="mt-4">
                {done ? (
                  <Link to={`/student/attempts/${exam.attempt!.id}/submitted`} className="btn-secondary">
                    View result
                  </Link>
                ) : (
                  <Link
                    to={`/student/exams/${exam.id}/instructions`}
                    className={open ? 'btn-primary' : 'btn-secondary pointer-events-none opacity-50'}
                  >
                    {exam.attempt ? 'Resume' : 'View instructions'}
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
