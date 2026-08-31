# Apti Kiosk

Aptitude assessment platform: question bank, scheduled online tests with
autosave and a server-authoritative timer, browser-activity monitoring, and
combined ranking with an externally-run HackerRank coding round.

No code judge, by design — coding rounds live on HackerRank and come back as a
CSV import.

```
apps/web        React + Vite + Tailwind SPA
apps/api        Express 5 + Zod + Prisma REST API
packages/db     Prisma schema, migrations, client singleton
packages/shared Zod schemas, enums, constants shared by both apps
infra/          Dockerfiles, nginx config
docs/           architecture.md · api.md · deployment.md
```

## Quick start

```bash
pnpm install
cp .env.example .env          # Supabase URL + anon key, DB URLs, AUTH_JWT_SECRET
pnpm db:generate
pnpm db:migrate
SEED_ADMIN_EMAIL=you@college.edu pnpm db:seed
pnpm dev                      # api on :4000, web on :5173
```

Two kinds of account, two ways in:

- **Admins** sign in on the *Admin* tab with Supabase Auth. Create the Supabase
  user for `SEED_ADMIN_EMAIL` (dashboard → Authentication → Users, or the app),
  and the seeded SUPER_ADMIN profile links to it on first login.
- **Students** never touch Supabase. An admin bulk-creates their accounts under
  *Students → Bulk create accounts* by uploading a CSV of roll numbers; the
  generated passwords download once as a sheet to hand out. Students sign in on
  the *Student* tab with that roll number and password.

## Scripts

| Command | Does |
| --- | --- |
| `pnpm dev` | api + web in watch mode |
| `pnpm build` | build everything |
| `pnpm check-types` | typecheck every package |
| `pnpm --filter @apti/api check` | run the scoring/shuffle/CSV self-checks |
| `pnpm db:migrate` / `db:seed` / `db:generate` | Prisma |

## What it does

**Students** see every published exam, read the instructions, start (which fixes the
server-side clock), answer a per-student shuffled paper that autosaves every
~15s, and get submitted automatically when the timer runs out. The completion
page carries the HackerRank link when one is configured.

**Admins** manage the question bank (form or CSV), bulk-create student accounts
from a CSV, build and schedule exams, publish (which opens the exam to every
enrolled student, including anyone added later), watch live attempts, review the suspicious-activity timeline, export
aptitude results, import HackerRank results, and export the combined ranking.

## On the anti-cheating

It is browser monitoring, not lockdown, and the student is told so before they
start. Two separate things come out of it:

- **Strikes** end an exam. Leaving the exam window — window blur, fullscreen
  exit, a second session — is one strike. Two warnings, then the third strike
  submits the attempt (`MAX_STRIKES` in `packages/shared`). A strike is sent to
  the server the instant it happens rather than on the batch timer, so the
  consequence lands immediately. The burst of events a single alt-tab fires is
  coalesced into one strike.
- **`suspiciousScore`** ranks attempts for human review and never ends an exam
  on its own. It still weights copy/paste, right clicks, network drops and the
  rest.

It cannot see a second device, a phone, or a printed sheet, and a student who
disables JavaScript reports nothing at all. Use the score to decide which
attempts a human should look at — not as evidence.

See [docs/architecture.md](docs/architecture.md), [docs/api.md](docs/api.md),
and [docs/deployment.md](docs/deployment.md).
