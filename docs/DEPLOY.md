# Deploying the backend (Render Free + Atlas M0)

This is the human-run deploy path for the **Basmatak Tatatoua** backend, written
during Session 20. It matches the machine-checkable `render.yaml` blueprint at
the repo root; either path (dashboard click-path or Blueprint import) produces
the same service.

Every once in the 20-session roadmap is verified against in-memory MongoDB.
Deploying points the app at **Atlas M0** and wakes/drives it with a **free
external scheduler** (inventory §10). The free host sleeps after ~15 min idle
(cold start ~1 min) — the scheduler double purpose is keep-alive.

---

## 0. Prerequisites from the roadmap checklist (§3)

You need these accounts/**env values** before connecting the service:

| Value(s) | Source (roadmap §3) |
|---|---|
| `MONGO_URI` | §3.1 MongoDB Atlas free M0 cluster, database `basmatak` in the URI |
| `MAIL_HOST`/`MAIL_PORT`/`MAIL_SECURE`/`MAIL_USER`/`MAIL_PASS`/`MAIL_FROM` | §3.2 Brevo SMTP (or a Gmail app password) |
| `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_BUCKET` | §3.3 Supabase project + `media` bucket |
| `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`/`JOBS_KEY` | §3.6 local secrets generator |
| Anything else the app reads | `.env.example` (dev defaults are safe to leave unset in dev only) |

Atlas network access must allow the app: **Network Access → Add IP
`0.0.0.0/0`** (MVP-only; restrict to your office/static IPs before production —
see `backend/README.md`). The URI must include the database name:

```
mongodb+srv://basmatak:<password>@basmatak.<xxxxx>.mongodb.net/basmatak?retryWrites=true&w=majority
```

---

## 1. Create the web service

### Option A — Blueprint import (uses `render.yaml`)

1. Render dashboard → **New → Blueprint** → connect the repo (branch `main`).
2. Render reads `render.yaml`: service **basmatak-backend**, free plan,
   `rootDir: backend`, build `npm ci && npm run build`, start
   `npm run start:prod`, health check `/api/v1/health`.
3. Fill in every `sync: false` variable via **Environment** (or **Secret Files**;
   see §2) and click **Apply**.

### Option B — Dashboard click-path (the exact clicks)

1. Render dashboard → **New → Web Service** → connect the repo.
2. Branch: **main**; **Runtime: Node**; **Region**: any (e.g. Oregon, free).
3. **Build command:** `npm ci && npm run build`
4. **Start command:** `npm run start:prod`
5. **Instance Type:** **Free**.
6. Add the **Environment** variables (§2) and click **Create Web Service**.
7. Render injects `PORT` itself; the app reads `process.env.PORT`. Keep
   **`NODE_ENV=production`** set.

---

## 2. Environment variables (every var the app reads)

`render.yaml` lists all of them (`sync: false` = you set the value in the
dashboard). `PORT` is injected by Render — do **not** set it.

| Variable | Example / source | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Set by the blueprint (dashboard: add it). |
| `NODE_VERSION` | `20` | Pin Node ~20 (blueprint only). |
| `MONGO_URI` | `mongodb+srv://basmatak:…@basmatak.<cluster>.mongodb.net/basmatak?retryWrites=true&w=majority` | §3.1. Include `/basmatak`. |
| `CORS_ORIGIN` | `https://your-frontend.vercel.app` | Comma-separated list, or `*`. |
| `PUBLIC_BASE_URL` | `https://basmatak-backend.onrender.com` | **The Render URL** — used in `/verify/:code` links and emails. |
| `LOG_LEVEL` | `log` | |
| `SWAGGER_ENABLED` | `false` | Swagger is always off in production regardless. |
| `THROTTLE_TTL` | `60` | |
| `THROTTLE_LIMIT` | `100` | |
| `JOBS_KEY` | random 64-hex | §3.6. Also set as a **GitHub Actions secret** (§3). |
| `JWT_ACCESS_SECRET` | random 64-hex | §3.6. |
| `JWT_REFRESH_SECRET` | random 64-hex | §3.6. |
| `JWT_ACCESS_TTL` | `15m` | |
| `JWT_REFRESH_TTL` | `30d` | |
| `EMAIL_VERIFICATION_REQUIRED` | `true` | |
| `MAIL_HOST` | `smtp-relay.brevo.com` | §3.2. |
| `MAIL_PORT` | `587` | |
| `MAIL_SECURE` | `true`/`false` | |
| `MAIL_USER` | Brevo login | §3.2. |
| `MAIL_PASS` | SMTP key | §3.2. |
| `MAIL_FROM` | verified sender | §3.2. |
| `STORAGE_PROVIDER` | `supabase` | Never `local` on Render. |
| `STORAGE_LOCAL_DIR` | (leave unset) | Dev-only niche. |
| `SUPABASE_URL` | `https://<project>.supabase.co` | §3.3. |
| `SUPABASE_ANON_KEY` | anon key | §3.3. |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key | §3.3. |
| `SUPABASE_BUCKET` | `media` | §3.3 (public bucket off). |
| `ADMIN_EMAIL` | admin email | Used by the seed (S17). |
| `ADMIN_PASSWORD` | strong password | Used by the seed (S17). |
| `PUBLISH_GATE_ENABLED` | `true` | |

---

## 3. Scheduler + keep-alive

The free host sleeps when idle, and scheduled work must go through
`POST /api/v1/internal/jobs/run` (secret header `X-Jobs-Key`, idempotent). Pick
**one** of these two; both also warm the host.

### A — GitHub Actions keep-alive (no third party, no card)

1. Repo **Settings → Secrets and variables → Actions**:
   - **Secrets**: `JOBS_KEY` = the same value as the Render `JOBS_KEY`.
   - **Variables**: `RENDER_SERVICE_URL` = `basmatak-backend.onrender.com`
     (bare host, no `https://`).
2. The committed workflow `.github/workflows/keep-alive.yml` runs every 15
   minutes (`*/15 * * * *`), POSTs to the internal jobs endpoint with the
   secret, tolerates cold-start timeouts, and keeps the host awake. Run it
   manually any time via **Actions → Keep-alive scheduler → Run workflow**.

### B — cron-job.org (primary per roadmap §3.5)

1. <https://cron-job.org> → free signup.
2. **Create cronjob**: URL
   `POST https://basmatak-backend.onrender.com/api/v1/internal/jobs/run`.
3. Add header `X-Jobs-Key: <JOBS_KEY>`.
4. Schedule: every 15 minutes. (Note cron-job.org runs in its own timezone —
   set the cron to the server clock; the 15-min tick is timezone-insensitive.)

Either way the jobs tick moves `published` opportunities → `in_progress`,
activates accepted participants, and refreshes reliability (S6/S13).

---

## 4. Health check

Render's health check is wired to **`GET /api/v1/health`**
(`render.yaml` `healthCheckPath` — or on the dashboard: **Health Check Path**
`/api/v1/health`). It returns `200 { "status": "ok", "version": … }`. The
scheduler ping also warms the host.

---

## 5. Seed data (one-shot, ephemeral disk)

Render free disks are ephemeral: run seeds once as a **one-off** against the
service. In the Render web service **Shell** (or a one-shot `npm run` job):

```bash
npm run seed:admin     # admin account from ADMIN_EMAIL/ADMIN_PASSWORD (S17)
npm run seed:all       # locations + skills + admin + demo org (S17)
```

Seeds are not part of the start/health path — the app boots and answers
`/health` with or without them.

---

## 6. Free-tier runtime rules (inventory §10)

- **No Redis, no queues, no push, no paid SMS** anywhere. Throttling is
  in-memory (single instance — correct for Render free), events are in-process,
  notifications are polled from MongoDB.
- **No runtime local-disk writes**: media lives in Supabase
  (`STORAGE_PROVIDER=supabase`); `local` is dev-only.
- **`PUBLIC_BASE_URL`** = the Render URL so `/verify/:code` links and emails
  are correct.

---

## 7. Verify locally (prod smoke) before/while connecting

```bash
cd backend
npm ci
npm run build
# point MONGO_URI at the real Atlas connection string (or a local mongod) and boot the compiled app:
npm run start:prod
curl http://localhost:3000/api/v1/health
```

Then confirm in the Render dashboard that the first build succeeded, the health
check shows green, and the scheduler log shows jobs runs.

---

## 8. Rollback / clean-up

- **Revert the deploy**: Render dashboard → service → **Settings → Delete
  Service**, or pause — the data stays in Atlas untouched.
- **Code rollback**: `git revert` the `chore(deploy)` commit. Removing the
  keep-alive workflow leaves the scheduler stopped; the app keeps running.
- No data migration is involved — the host and the database are independent.