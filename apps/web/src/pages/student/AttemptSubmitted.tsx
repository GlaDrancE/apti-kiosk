import { Link, useParams } from 'react-router-dom';
import type { AttemptView } from '@apti/shared';
import { useApi } from '../../lib/useApi';

export function AttemptSubmitted() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { data: attempt, loading, error } = useApi<AttemptView>(`/attempts/${attemptId}`);

  if (loading) return <p className="text-slate-500">Loading…</p>;
  if (error || !attempt) return <p className="text-red-600">{error ?? 'Attempt not found'}</p>;

  const auto = attempt.status === 'AUTO_SUBMITTED';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="card text-center">
        <h1 className="text-2xl font-semibold text-slate-900">
          {auto ? 'Your exam was submitted automatically' : 'Exam submitted'}
        </h1>
        <p className="mt-2 text-slate-600">
          {auto
            ? 'This happens when the timer runs out or the activity threshold is reached.'
            : 'Your answers have been recorded.'}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="rounded-md bg-slate-50 p-4">
            <div className="text-sm text-slate-500">Score</div>
            <div className="text-2xl font-semibold text-slate-900">
              {attempt.score ?? 0} <span className="text-base text-slate-400">/ {attempt.maxScore}</span>
            </div>
          </div>
          <div className="rounded-md bg-slate-50 p-4">
            <div className="text-sm text-slate-500">Submitted at</div>
            <div className="text-sm font-medium text-slate-900">
              {attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString() : '—'}
            </div>
          </div>
        </div>
      </div>

      {attempt.hackerRankTestUrl && (
        <div className="card">
          <h2 className="font-medium text-slate-900">Next: coding round</h2>
          <p className="mt-1 text-sm text-slate-600">
            Your aptitude round is done. Complete the coding round on HackerRank using the same
            email address you signed in with — that is how the two results are matched.
          </p>
          <a
            href={attempt.hackerRankTestUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary mt-4"
          >
            Open the HackerRank test
          </a>
        </div>
      )}

      <Link to="/student/dashboard" className="btn-secondary">
        Back to my exams
      </Link>
    </div>
  );
}
