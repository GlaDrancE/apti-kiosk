# API

Base URL: `http://localhost:4000` in dev, `/api` behind nginx in production.

Every route except `GET /health` requires:

```
Authorization: Bearer <token>
```

Two kinds of token are accepted, told apart by their `iss` claim:

- **Students** — HS256, issued by `POST /auth/login`, signed with
  `AUTH_JWT_SECRET`, `iss: "apti-kiosk"`, 12h lifetime.
- **Admins** — ES256, issued by Supabase Auth, verified against the project's
  published JWKS at `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`.

Errors are `{ "error": string, "details"?: unknown }` with the status code
carrying the meaning (400 validation, 401 no/!valid token, 403 wrong role or
not your row, 404, 409 conflict, 429 rate limited).

Roles: **S** = student, **A** = admin or super-admin, **SA** = super-admin only.

---

## Auth

### `POST /auth/login` — public
Student sign-in. Admins do not use this route. Rate limited to 20 failed
attempts per 15 minutes per IP.

```jsonc
// request
{ "loginId": "21CS001", "password": "7fK2p9qXwT" }
// response
{ "token": "eyJ…", "user": { "id": "uuid", "loginId": "21CS001", ... } }
```

### `GET /auth/me` — S A
Verifies the token and returns the profile (for an admin, creating or linking it
on first call).

```json
{ "id": "uuid", "loginId": "21CS001", "email": null, "fullName": "Asha", "role": "STUDENT", "collegeName": "NIT" }
```

## Users

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| GET | `/users?page&pageSize&role&search` | A | paginated |
| GET | `/users/:id` | A | |
| PATCH | `/users/:id/role` | SA | `{ "role": "ADMIN" }`; cannot change your own |
| POST | `/users/import-students` | A | `{ "csv": "..." }`; bulk-creates student logins |
| POST | `/users/:id/reset-password` | A | issues a new password for one student |

```jsonc
// POST /users/import-students — CSV columns: loginId,fullName,email,collegeName
// Only loginId is required. Re-importing a loginId resets that password.
// response — the plaintext passwords are returned once and never again.
{
  "created": 120, "updated": 0, "failed": 1,
  "errors": [{ "row": 44, "message": "loginId (roll number) is required" }],
  "credentials": [{ "loginId": "21CS001", "fullName": "Asha R", "password": "7fK2p9qXwT" }],
  "credentialsCsv": "loginId,fullName,password
21CS001,Asha R,7fK2p9qXwT"
}
```

## Questions — all admin-only (they contain the answer key)

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/questions` | see body below |
| GET | `/questions?page&pageSize&topic&difficulty&type&isActive&search` | |
| GET | `/questions/:id` | |
| PATCH | `/questions/:id` | replacing options is refused once answered |
| DELETE | `/questions/:id` | soft delete (`isActive: false`) — history stays intact |
| POST | `/questions/import-csv` | `{ "csv": "..." }` |

```jsonc
// POST /questions
{
  "type": "MCQ_SINGLE",          // MCQ_SINGLE | MCQ_MULTIPLE | NUMERIC
  "topic": "Quantitative",
  "difficulty": "MEDIUM",
  "text": "15% of 240?",
  "explanation": null,
  "marks": 1,
  "negativeMarks": 0.25,
  "numericAnswer": null,          // required for NUMERIC
  "options": [{ "text": "36", "isCorrect": true }, { "text": "34", "isCorrect": false }]
}
```

Validation is enforced by type: `MCQ_SINGLE` needs exactly one correct option,
`MCQ_MULTIPLE` at least one, both need two options minimum, `NUMERIC` needs
`numericAnswer` and takes no options.

**Question CSV header**

```
type,topic,difficulty,text,explanation,marks,negativeMarks,option1..option6,correct,numericAnswer
```

`correct` is 1-based option numbers, pipe- or comma-separated (`2`, `1|3`). Rows
import independently — the response reports `{ created, failed, errors[] }` and
one bad row does not roll back the rest of the file.

## Exams

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| POST | `/exams` | A | |
| GET | `/exams` | S A | students get every published exam |
| GET | `/exams/:id` | S A | students get the instructions payload, no questions |
| PATCH | `/exams/:id` | A | question changes refused once attempts exist |
| POST | `/exams/:id/publish` | A | needs ≥1 question and a live window |
| GET | `/exams/:id/results` | A | `?format=csv` for the export |
| GET | `/exams/:id/live` | A | in-progress attempts |
| GET | `/exams/:id/suspicious` | A | activity summary, worst first |
| PATCH | `/exams/:id/hackerrank-link` | A | `{ "hackerRankTestUrl": "https://…" \| null }` |
| GET | `/exams/:id/final-results` | A | combined ranking; `?format=csv` |

```jsonc
// POST /exams
{
  "title": "Campus Aptitude 2026",
  "description": null,
  "durationMinutes": 60,
  "startsAt": "2026-09-01T04:00:00.000Z",
  "endsAt": "2026-09-01T12:00:00.000Z",
  "passingScore": 20,
  "hackerRankTestUrl": null,
  "questions": [{ "questionId": "uuid", "marksOverride": null }]
}
```

There is no assignment step. Publishing an exam opens it to every enrolled
student; the `ExamAssignment` row is created when a student actually starts, so
it records participation rather than intent.

## Attempts

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| POST | `/attempts/start` | S | `{ examId }` → `{ attemptId, expiresAt }`; resumes if one exists |
| GET | `/attempts/:attemptId` | S A | shuffled paper, no answer key; admins may read any |
| PATCH | `/attempts/:attemptId/answers` | S | autosave |
| POST | `/attempts/:attemptId/events` | S | batched activity log |
| GET | `/attempts/:attemptId/events` | S A | timeline |
| POST | `/attempts/:attemptId/submit` | S | `{ reason: "MANUAL" \| "TIMER" \| "VIOLATION" }` |

```jsonc
// PATCH /attempts/:attemptId/answers
{ "answers": [{ "questionId": "uuid", "selectedOptionIds": ["uuid"], "numericAnswer": null }] }
// → { "saved": 1, "savedAt": "2026-09-01T04:12:00.000Z" }

// POST /attempts/:attemptId/events
{ "events": [{ "eventType": "WINDOW_BLUR", "metadata": {}, "occurredAt": "…" }] }
// → { "suspiciousScore": 18, "strikes": 2, "maxStrikes": 3, "remaining": 1,
//      "warn": true, "autoSubmitted": false }
```

Submitting twice is a no-op, not an error — the timer and the Submit button can
genuinely race. Writes after `expiresAt + 30s` are rejected.

## HackerRank

| Method | Path | Role |
| --- | --- | --- |
| POST | `/hackerrank/import-results-csv` | A |

`{ "examId": "uuid", "csv": "..." }` → `{ imported, skipped, errors[] }`.

Accepted columns (case-insensitive): `email` / `candidate email` / `login`,
`score` / `total score`, `max score`, `status` / `result`. Students are matched
by email; a row whose email has no profile is reported and skipped, never
auto-created. Re-importing upserts on `(examId, studentId)`.

## Rate limits

| Scope | Window | Limit |
| --- | --- | --- |
| All routes | 1 min | 300 |
| Autosave + events | 1 min | 120 |
| CSV imports | 15 min | 20 |
