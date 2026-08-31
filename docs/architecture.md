# Architecture

## Shape

```
apps/web    React + Vite SPA (student + admin)
apps/api    Express 5 REST API
packages/db      Prisma schema, migrations, singleton client
packages/shared  Zod schemas, enums, constants, response types
infra/      Dockerfiles + nginx config
```

`packages/shared` is consumed as TypeScript source (no build step) by both apps,
so a schema change is a compile error on both sides immediately.

## Authentication

Supabase Auth owns credentials, sessions, and password resets. The API never
sees a password.

```
admin   ──signInWithPassword──► Supabase Auth ──ES256 token──┐
student ──POST /auth/login────► Express ──────HS256 token────┤
                                                             ▼
                          Express ──authenticate()──► UserProfile ──► handler
```

`requireAuth` hands the bearer token to `authenticate()`, which reads the `iss`
claim and picks one of two paths — neither verification ever runs against a
token meant for the other:

- `iss: "apti-kiosk"` — a student token this API signed with `AUTH_JWT_SECRET`.
  Verified HS256, then the profile is loaded by `sub` (its `UserProfile.id`).
  Students authenticate against `passwordHash`, a `node:crypto` scrypt hash set
  when an admin bulk-creates their account. They have no Supabase user and no
  email verification — the college issues the credentials.
- anything else — a Supabase admin token. Verified ES256 against the project's
  published JWKS, then `resolveSupabaseProfile` maps it to a `UserProfile`:

  1. matched by `supabaseUserId` — the normal path;
  2. otherwise matched by email and linked — this is what lets a seeded admin
     profile attach to its Supabase user on first login;
  3. otherwise created as `STUDENT`. Roles are only ever raised by a
     `SUPER_ADMIN` through `PATCH /users/:id/role`.

Roles: `STUDENT`, `ADMIN`, `SUPER_ADMIN`. Admin routes require ADMIN or above;
role changes require SUPER_ADMIN. Students are scoped to their own rows by an
explicit ownership filter on every attempt route, not by trusting a client id.

## Database access

One `PrismaClient` per process, stashed on `globalThis` so dev hot-reloads do
not leak connection pools. The app runs on Supabase's **pooled** connection
(pgbouncer, port 6543, `connection_limit=1`); migrations use the **direct**
connection (port 5432) via Prisma's `directUrl`, because pgbouncer cannot run
DDL in the way `prisma migrate` needs.

## Exam lifecycle

```
DRAFT ──publish──► PUBLISHED ──close──► CLOSED
```

Publishing requires at least one question and a window that has not passed.
Once any student has started, the question set is frozen — changing it midway
would alter a paper in flight and invalidate `maxScore`.

## Attempt lifecycle

```
POST /attempts/start
  └─ published + window checks
  └─ expiresAt = min(now + durationMinutes, exam.endsAt)
  └─ shuffleSeed stored on the attempt
GET /attempts/:id          → paper, shuffled from the seed, answer key stripped
PATCH .../answers          → autosave every ~15s, upsert per question
POST .../events            → batched activity log every ~10s
POST .../submit            → grade, freeze, mark the assignment SUBMITTED
```

`(examId, studentId)` is unique on `Attempt`, so a reload, a dropped connection,
or a second tab all resume the same attempt with the same clock. The order is
derived from the stored seed rather than persisted, so it survives a reload for
free while still differing between students.

The timer is authoritative on the server: `expiresAt` is set at start, the
client only renders a countdown from it, and writes past
`expiresAt + SUBMIT_GRACE_SECONDS` are rejected. Attempts abandoned without a
submit (browser closed, laptop shut) are swept and graded by
`expireOverdueAttempts()` whenever an admin loads results.

## Scoring

- `MCQ_SINGLE` / `MCQ_MULTIPLE`: the selected option set must match the key
  exactly. Partial credit is not awarded.
- `NUMERIC`: `|answer − key| ≤ NUMERIC_TOLERANCE`.
- Wrong and attempted costs `negativeMarks`; blank costs nothing.
- Marks come from `ExamQuestion.marksOverride ?? Question.marks`.
- The total is floored at 0.

## Anti-cheating

Browser monitoring, not lockdown, and the UI says so to the student. It cannot
see a second device, a phone, or a printed page, and a student who disables
JavaScript sends nothing.

Client (`useProctoring`) queues `TAB_HIDDEN`, `WINDOW_BLUR`, `FULLSCREEN_EXIT`,
`COPY`, `PASTE`, `RIGHT_CLICK`, `NETWORK_DISCONNECT/RECONNECT` and
`MULTIPLE_SESSION_DETECTED` (via `BroadcastChannel`) and flushes them in
batches; a failed flush is re-queued rather than dropped. The server adds a
weight per event to `Attempt.suspiciousScore`, warns past
`SUSPICION_WARN_THRESHOLD`, and auto-submits past the exam's
`autoSubmitThreshold` (null disables auto-submit entirely).

Treat `suspiciousScore` as a queue for human review. It is not evidence.

## Coding round

Out of scope by design — no judge, no sandbox, no execution. An exam carries an
optional `hackerRankTestUrl` shown on the completion page, and results come back
as a CSV import matched to students **by email**. Combined ranking converts each
round to a percentage and averages them, because the two rounds are marked out
of different totals and a raw sum would let the bigger denominator dominate.
