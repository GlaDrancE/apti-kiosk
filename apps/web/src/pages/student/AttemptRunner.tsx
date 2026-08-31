import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AUTOSAVE_INTERVAL_MS, type AttemptView } from '@apti/shared';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { useProctoring } from '../../hooks/useProctoring';

type Answer = { selectedOptionIds: string[]; numericAnswer: number | null };

const pad = (n: number) => String(n).padStart(2, '0');
function formatRemaining(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function AttemptRunner() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();
  const { data: attempt, loading, error } = useApi<AttemptView>(`/attempts/${attemptId}`);

  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [current, setCurrent] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [strikes, setStrikes] = useState(0);
  const [maxStrikes, setMaxStrikes] = useState(0);
  const [warning, setWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Question ids whose answer changed since the last successful save.
  const dirty = useRef<Set<string>>(new Set());
  const submitted = useRef(false);
  // Mirror of `answers` so `save` has a stable identity — otherwise the autosave
  // interval would be torn down and restarted on every keystroke and never fire.
  const answersRef = useRef<Record<string, Answer>>({});
  answersRef.current = answers;

  useEffect(() => {
    if (!attempt) return;
    setAnswers(attempt.answers as Record<string, Answer>);
    // Seed from the server so a reload mid-exam does not reset the count the
    // student is being judged on.
    setStrikes(attempt.strikes);
    setMaxStrikes(attempt.maxStrikes);
  }, [attempt]);

  /** Flush pending answers. Returns false if the save failed. */
  const save = useCallback(async () => {
    if (!attemptId || dirty.current.size === 0) return true;
    const ids = [...dirty.current];
    dirty.current.clear();
    setSaveState('saving');
    try {
      await api.patch(`/attempts/${attemptId}/answers`, {
        answers: ids.map((questionId) => ({
          questionId,
          selectedOptionIds: answersRef.current[questionId]?.selectedOptionIds ?? [],
          numericAnswer: answersRef.current[questionId]?.numericAnswer ?? null,
        })),
      });
      setSaveState('saved');
      return true;
    } catch {
      // Re-mark as dirty so the next tick retries instead of dropping the answer.
      ids.forEach((id) => dirty.current.add(id));
      setSaveState('error');
      return false;
    }
  }, [attemptId]);

  const submit = useCallback(
    async (reason: 'MANUAL' | 'TIMER' | 'VIOLATION') => {
      if (submitted.current || !attemptId) return;
      submitted.current = true;
      setSubmitting(true);
      // Save first: an unsaved last answer would otherwise never be graded.
      await save();
      try {
        await api.post(`/attempts/${attemptId}/submit`, { reason });
      } finally {
        await document.exitFullscreen().catch(() => undefined);
        navigate(`/student/attempts/${attemptId}/submitted`, { replace: true });
      }
    },
    [attemptId, navigate, save],
  );

  /* Timer — driven off the server's expiresAt, so changing the device clock
     does not buy extra time (the server rejects late writes regardless). */
  useEffect(() => {
    if (!attempt || attempt.status !== 'IN_PROGRESS') return;
    const expiry = Date.parse(attempt.expiresAt);
    const tick = () => {
      const left = expiry - Date.now();
      setRemaining(left);
      if (left <= 0) void submit('TIMER');
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [attempt, submit]);

  /* Autosave loop. */
  useEffect(() => {
    const id = setInterval(() => void save(), AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [save]);

  /* Last-ditch save when the tab is closing. */
  useEffect(() => {
    const onHide = () => void save();
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [save]);

  useProctoring({
    attemptId: attemptId!,
    enabled: Boolean(attempt && attempt.status === 'IN_PROGRESS'),
    onUpdate: ({ strikes: s, maxStrikes: max, remaining, warn }) => {
      setStrikes(s);
      setMaxStrikes(max);
      if (!warn) return;
      setWarning(
        remaining === 1
          ? 'Final warning. Leaving this exam once more will submit it immediately.'
          : `Warning ${s} of ${max - 1}: leaving the exam was recorded. ` +
            `${remaining} more and your test is submitted automatically.`,
      );
    },
    onAutoSubmit: () => void submit('VIOLATION'),
  });

  const setAnswer = (questionId: string, next: Answer) => {
    dirty.current.add(questionId);
    setSaveState('idle');
    setAnswers((prev) => ({ ...prev, [questionId]: next }));
  };

  const question = attempt?.questions[current];
  const answeredCount = useMemo(
    () =>
      Object.values(answers).filter((a) => a.selectedOptionIds.length > 0 || a.numericAnswer !== null)
        .length,
    [answers],
  );

  if (loading) return <p className="p-8 text-slate-500">Loading your paper…</p>;
  if (error || !attempt) return <p className="p-8 text-red-600">{error ?? 'Attempt not found'}</p>;
  if (attempt.status !== 'IN_PROGRESS') {
    navigate(`/student/attempts/${attemptId}/submitted`, { replace: true });
    return null;
  }

  const lowTime = remaining < 5 * 60_000;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="font-medium text-slate-900">{attempt.examTitle}</h1>
            <p className="text-xs text-slate-500">
              {answeredCount} of {attempt.questions.length} answered ·{' '}
              {saveState === 'saving' && 'Saving…'}
              {saveState === 'saved' && 'All answers saved'}
              {saveState === 'error' && <span className="text-red-600">Save failed — retrying</span>}
              {saveState === 'idle' && 'Answers save automatically'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {maxStrikes > 0 && (
              <span
                className={`badge ${
                  strikes === 0
                    ? 'bg-slate-100 text-slate-600'
                    : strikes >= maxStrikes - 1
                      ? 'bg-red-100 text-red-800'
                      : 'bg-amber-100 text-amber-800'
                }`}
              >
                Warnings used: {strikes} / {maxStrikes - 1}
              </span>
            )}
            <div
              className={`rounded-md px-3 py-1.5 font-mono text-lg ${
                lowTime ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-800'
              }`}
              aria-live="polite"
            >
              {formatRemaining(remaining)}
            </div>
            <button onClick={() => void submit('MANUAL')} disabled={submitting} className="btn-primary">
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </div>
      </header>

      {warning && (
        <div
          role="alert"
          className={`px-4 py-3 text-center text-sm font-medium ${
            strikes >= maxStrikes - 1 ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'
          }`}
        >
          {warning}
          <button
            className="ml-3 underline underline-offset-2"
            onClick={() => {
              setWarning(null);
              void document.documentElement.requestFullscreen().catch(() => undefined);
            }}
          >
            Return to the exam
          </button>
        </div>
      )}

      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 md:grid-cols-[1fr_200px]">
        <div className="card">
          {question && (
            <>
              <div className="mb-4 flex items-baseline justify-between">
                <span className="text-sm text-slate-500">
                  Question {current + 1} of {attempt.questions.length} · {question.topic}
                </span>
                <span className="text-xs text-slate-400">
                  +{question.marks}
                  {question.negativeMarks > 0 && ` / −${question.negativeMarks}`}
                </span>
              </div>

              <p className="mb-5 whitespace-pre-wrap text-slate-900">{question.text}</p>

              {question.type === 'NUMERIC' ? (
                <input
                  type="number"
                  step="any"
                  className="input max-w-xs"
                  aria-label="Your numeric answer"
                  value={answers[question.id]?.numericAnswer ?? ''}
                  onChange={(e) =>
                    setAnswer(question.id, {
                      selectedOptionIds: [],
                      numericAnswer: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                />
              ) : (
                <div className="space-y-2">
                  {question.options.map((opt) => {
                    const selected = answers[question.id]?.selectedOptionIds ?? [];
                    const checked = selected.includes(opt.id);
                    const multiple = question.type === 'MCQ_MULTIPLE';
                    return (
                      <label
                        key={opt.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm ${
                          checked ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type={multiple ? 'checkbox' : 'radio'}
                          name={question.id}
                          className="mt-0.5"
                          checked={checked}
                          onChange={() =>
                            setAnswer(question.id, {
                              numericAnswer: null,
                              selectedOptionIds: multiple
                                ? checked
                                  ? selected.filter((id) => id !== opt.id)
                                  : [...selected, opt.id]
                                : [opt.id],
                            })
                          }
                        />
                        <span>{opt.text}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              <div className="mt-6 flex justify-between">
                <button
                  className="btn-secondary"
                  disabled={current === 0}
                  onClick={() => setCurrent((c) => c - 1)}
                >
                  Previous
                </button>
                <button
                  className="btn-secondary"
                  disabled={current === attempt.questions.length - 1}
                  onClick={() => setCurrent((c) => c + 1)}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </div>

        <nav aria-label="Question navigator" className="card h-fit">
          <p className="mb-3 text-sm font-medium text-slate-700">Questions</p>
          <div className="grid grid-cols-5 gap-2">
            {attempt.questions.map((q, i) => {
              const a = answers[q.id];
              const done = a && (a.selectedOptionIds.length > 0 || a.numericAnswer !== null);
              return (
                <button
                  key={q.id}
                  onClick={() => setCurrent(i)}
                  aria-label={`Question ${i + 1}${done ? ', answered' : ''}`}
                  className={`h-8 w-8 rounded text-xs font-medium ${
                    i === current
                      ? 'bg-slate-900 text-white'
                      : done
                        ? 'bg-green-100 text-green-800'
                        : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
