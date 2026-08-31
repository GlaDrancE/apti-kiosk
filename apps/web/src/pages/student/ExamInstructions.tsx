import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';

interface ExamDetail {
  id: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  startsAt: string;
  endsAt: string;
  passingScore: number;
  questionCount: number;
  hackerRankTestUrl: string | null;
  attempt: { id: string; status: string } | null;
}

export function ExamInstructions() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const { data: exam, loading, error } = useApi<ExamDetail>(`/exams/${examId}`);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  async function start() {
    setStarting(true);
    setStartError(null);
    try {
      const res = await api.post<{ attemptId: string }>('/attempts/start', { examId });
      // Fullscreen has to be requested from a user gesture — this click is it.
      await document.documentElement.requestFullscreen().catch(() => undefined);
      navigate(`/student/attempts/${res.attemptId}`);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Could not start the exam');
      setStarting(false);
    }
  }

  if (loading) return <p className="text-slate-500">Loading…</p>;
  if (error || !exam) return <p className="text-red-600">{error ?? 'Exam not found'}</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{exam.title}</h1>
        {exam.description && <p className="mt-1 text-slate-600">{exam.description}</p>}
      </div>

      <div className="card grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div><dt className="text-slate-500">Questions</dt><dd className="font-medium">{exam.questionCount}</dd></div>
        <div><dt className="text-slate-500">Duration</dt><dd className="font-medium">{exam.durationMinutes} min</dd></div>
        <div><dt className="text-slate-500">Passing score</dt><dd className="font-medium">{exam.passingScore}</dd></div>
        <div><dt className="text-slate-500">Closes</dt><dd className="font-medium">{new Date(exam.endsAt).toLocaleString()}</dd></div>
      </div>

      <div className="card">
        <h2 className="mb-3 font-medium text-slate-900">Before you begin</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-600">
          <li>The timer starts the moment you press Start and does not pause.</li>
          <li>Answers save automatically every few seconds. You can safely reload the page.</li>
          <li>The paper submits itself when the timer runs out.</li>
          <li>
            Your browser activity is monitored during the test: leaving the tab, exiting
            fullscreen, copying, pasting, and opening a second tab are all recorded and shown
            to the reviewer. Repeated activity can end your attempt early.
          </li>
          <li>Questions and options appear in a different order for each student.</li>
        </ul>
      </div>

      {startError && <p role="alert" className="text-sm text-red-600">{startError}</p>}

      <button onClick={start} disabled={starting} className="btn-primary w-full">
        {starting ? 'Starting…' : exam.attempt ? 'Resume attempt' : 'Start exam'}
      </button>
    </div>
  );
}
