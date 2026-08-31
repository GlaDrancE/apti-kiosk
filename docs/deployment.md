# Deployment

Target: a single small Oracle Cloud / AWS VM (2 vCPU, 4 GB is plenty) running
Docker Compose. Postgres is Supabase — nothing stateful runs on the VM, so the
box is disposable.

## 1. Supabase setup

1. Create a project. Note the project URL and the **anon** key
   (Settings → API) — both are public values, safe in the browser bundle.
2. Copy the **JWT Secret** (Settings → API → JWT Settings). This is a real
   secret: it is what the API verifies tokens with.
3. Copy both connection strings (Settings → Database):
   - pooled, port **6543** → `DATABASE_URL` (append `?pgbouncer=true&connection_limit=1`)
   - direct, port **5432** → `DIRECT_URL`
4. Auth → Providers: enable Email. Decide on email confirmation; with it on,
   sign-up returns no session until the student confirms.
5. Auth → URL Configuration: set the Site URL to your domain.

The API talks to Postgres as the service role through Prisma and enforces
authorisation itself, so Row Level Security is not what protects this data —
never expose the database directly to the browser.

## 2. Migrate and seed

From a machine with `DIRECT_URL` set:

```bash
pnpm install
pnpm db:generate
pnpm --filter @apti/db migrate:deploy   # or `pnpm db:migrate` in development
SEED_ADMIN_EMAIL=you@college.edu pnpm db:seed
```

Then create a Supabase Auth user with that same email and sign in on the app's
*Admin* tab — the profile links on first login. Students are created afterwards
from *Students → Bulk create accounts*; they never get a Supabase user.

Legacy note: `resolveProfile` links the
Supabase user to the seeded SUPER_ADMIN profile on first login.

## 3. Deploy on the VM

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-plugin
git clone <your-repo> apti-kiosk && cd apti-kiosk
cp .env.example .env && $EDITOR .env      # fill in every value
sudo docker compose up -d --build
```

`docker compose` reads `.env` from the repo root for both the API's runtime
environment and the web image's build args. The web container serves the built
SPA and proxies `/api` to the API container, so the browser only ever talks to
one origin and CORS is a non-issue in production.

Check it: `curl localhost/api/health` → `{"ok":true,"env":"production"}`.

## 4. TLS

Point DNS at the VM, then terminate TLS in front of the stack. Simplest:

```bash
sudo apt install -y certbot
sudo certbot certonly --standalone -d exams.yourcollege.edu
```

Add a host-level nginx (or Caddy) in front of port 80, or mount the certs into
the web container and add a `listen 443 ssl` server block to
`infra/nginx/nginx.conf`. Whatever you choose, do not serve an exam over plain
HTTP — the Supabase access token rides on every request.

## 5. Firewall

Open 80/443 only. On Oracle Cloud this means **both** the VCN security list and
the instance's own iptables:

```bash
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

Oracle images ship with a default-deny INPUT chain; forgetting this half is the
usual reason a correctly configured VM still looks dead from outside.

## 6. Updating

```bash
git pull
sudo docker compose up -d --build
pnpm --filter @apti/db migrate:deploy    # only when the schema changed
```

Rebuild the web image whenever `VITE_*` values change — Vite bakes them into the
bundle at build time, so editing `.env` alone does nothing for the frontend.

## Operating an exam day

- Schedule the window wider than the duration: `expiresAt` is
  `min(start + duration, exam.endsAt)`, so a tight window silently shortens the
  last students' papers.
- Publish only after the question set is final — it locks once anyone starts.
- Watch the exam's live view for attempts stacking up flags.
- Abandoned attempts are graded automatically the next time results are opened.
- Export the aptitude CSV, import the HackerRank CSV, then export the combined
  ranking.

## Backups

Supabase handles Postgres backups (daily on paid plans; check your tier). The
data worth exporting after each drive is the results CSVs — keep them off the
VM.

## Sizing

The API is stateless: scale by raising the container count and putting the
existing nginx in front of them. The real ceiling is Supabase's pooled
connection budget, which is why the app runs with `connection_limit=1` per
container.
