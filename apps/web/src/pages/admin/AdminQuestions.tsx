import { useState } from 'react';
import {
  DIFFICULTIES,
  QUESTION_TYPES,
  type Difficulty,
  type QuestionType,
} from '@apti/shared';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';

interface QuestionRow {
  id: string;
  type: QuestionType;
  topic: string;
  difficulty: Difficulty;
  text: string;
  marks: number;
  negativeMarks: number;
  isActive: boolean;
  numericAnswer: number | null;
  options: { id: string; text: string; isCorrect: boolean }[];
}

const CSV_TEMPLATE =
  'type,topic,difficulty,text,explanation,marks,negativeMarks,option1,option2,option3,option4,correct,numericAnswer';

const emptyDraft = {
  type: 'MCQ_SINGLE' as QuestionType,
  topic: '',
  difficulty: 'MEDIUM' as Difficulty,
  text: '',
  explanation: '',
  marks: 1,
  negativeMarks: 0,
  numericAnswer: '' as string,
  options: [
    { text: '', isCorrect: true },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
  ],
};

export function AdminQuestions() {
  const [search, setSearch] = useState('');
  const [topic, setTopic] = useState('');
  const query = new URLSearchParams({ pageSize: '50' });
  if (search) query.set('search', search);
  if (topic) query.set('topic', topic);

  const { data, loading, error, reload } = useApi<{ items: QuestionRow[]; total: number }>(
    `/questions?${query.toString()}`,
    [search, topic],
  );

  const [draft, setDraft] = useState(emptyDraft);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [importReport, setImportReport] = useState<string | null>(null);

  async function createQuestion() {
    setFormError(null);
    try {
      await api.post('/questions', {
        ...draft,
        explanation: draft.explanation || null,
        numericAnswer: draft.numericAnswer === '' ? null : Number(draft.numericAnswer),
        options:
          draft.type === 'NUMERIC' ? [] : draft.options.filter((o) => o.text.trim() !== ''),
      });
      setDraft(emptyDraft);
      setShowForm(false);
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save the question');
    }
  }

  async function importCsv(file: File) {
    setImportReport(null);
    try {
      const csv = await file.text();
      const report = await api.post<{
        created: number;
        failed: number;
        errors: { row: number; message: string }[];
      }>('/questions/import-csv', { csv });
      setImportReport(
        `Imported ${report.created}, failed ${report.failed}.` +
          (report.errors.length
            ? ` First error — row ${report.errors[0]!.row}: ${report.errors[0]!.message}`
            : ''),
      );
      await reload();
    } catch (err) {
      setImportReport(err instanceof Error ? err.message : 'Import failed');
    }
  }

  async function deactivate(id: string) {
    await api.del(`/questions/${id}`);
    await reload();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Question bank</h1>
        <div className="flex items-center gap-2">
          <label className="btn-secondary cursor-pointer">
            Import CSV
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && void importCsv(e.target.files[0])}
            />
          </label>
          <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancel' : 'New question'}
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        CSV header: <code className="rounded bg-slate-100 px-1">{CSV_TEMPLATE}</code> — `correct`
        is the 1-based option number(s), e.g. <code>2</code> or <code>1|3</code>.
      </p>
      {importReport && <p className="text-sm text-slate-700">{importReport}</p>}

      {showForm && (
        <div className="card space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Type</label>
              <select
                className="input"
                value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value as QuestionType })}
              >
                {QUESTION_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Topic</label>
              <input className="input" value={draft.topic}
                onChange={(e) => setDraft({ ...draft, topic: e.target.value })} />
            </div>
            <div>
              <label className="label">Difficulty</label>
              <select className="input" value={draft.difficulty}
                onChange={(e) => setDraft({ ...draft, difficulty: e.target.value as Difficulty })}>
                {DIFFICULTIES.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Question text</label>
            <textarea className="input" rows={3} value={draft.text}
              onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
          </div>

          {draft.type === 'NUMERIC' ? (
            <div>
              <label className="label">Correct numeric answer</label>
              <input type="number" step="any" className="input max-w-xs" value={draft.numericAnswer}
                onChange={(e) => setDraft({ ...draft, numericAnswer: e.target.value })} />
            </div>
          ) : (
            <div className="space-y-2">
              <span className="label">Options (tick the correct one/s)</span>
              {draft.options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type={draft.type === 'MCQ_MULTIPLE' ? 'checkbox' : 'radio'}
                    checked={opt.isCorrect}
                    onChange={() =>
                      setDraft({
                        ...draft,
                        options: draft.options.map((o, j) =>
                          draft.type === 'MCQ_MULTIPLE'
                            ? j === i ? { ...o, isCorrect: !o.isCorrect } : o
                            : { ...o, isCorrect: j === i },
                        ),
                      })
                    }
                  />
                  <input className="input" placeholder={`Option ${i + 1}`} value={opt.text}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        options: draft.options.map((o, j) =>
                          j === i ? { ...o, text: e.target.value } : o,
                        ),
                      })
                    } />
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Marks</label>
              <input type="number" step="any" className="input" value={draft.marks}
                onChange={(e) => setDraft({ ...draft, marks: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Negative marks</label>
              <input type="number" step="any" className="input" value={draft.negativeMarks}
                onChange={(e) => setDraft({ ...draft, negativeMarks: Number(e.target.value) })} />
            </div>
          </div>

          {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
          <button className="btn-primary" onClick={createQuestion}>Save question</button>
        </div>
      )}

      <div className="flex gap-2">
        <input className="input max-w-sm" placeholder="Search question text"
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <input className="input max-w-xs" placeholder="Filter by topic"
          value={topic} onChange={(e) => setTopic(e.target.value)} />
      </div>

      {loading && <p className="text-slate-500">Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}

      <div className="card divide-y divide-slate-100 p-0">
        {(data?.items ?? []).map((q) => (
          <div key={q.id} className="flex items-start justify-between gap-4 px-5 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm text-slate-900">{q.text}</p>
              <p className="mt-1 text-xs text-slate-500">
                {q.type} · {q.topic} · {q.difficulty} · +{q.marks}
                {q.negativeMarks > 0 && ` / −${q.negativeMarks}`}
                {!q.isActive && ' · inactive'}
              </p>
            </div>
            {q.isActive && (
              <button className="text-sm text-red-600 hover:underline" onClick={() => void deactivate(q.id)}>
                Deactivate
              </button>
            )}
          </div>
        ))}
        {!loading && (data?.items.length ?? 0) === 0 && (
          <p className="px-5 py-6 text-slate-500">No questions match.</p>
        )}
      </div>
    </div>
  );
}
