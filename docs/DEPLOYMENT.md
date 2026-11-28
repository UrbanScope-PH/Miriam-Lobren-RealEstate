# Setup, Deployment & Operations — UrbanScope

Guide for running **UrbanScope** locally on Linux (`bash`), configuring environment variables, and deploying safely to Vercel + Supabase + Resend.

---

## 1. Local Development (Linux / `bash`)

**Requirements:** Python 3.9+ (Node.js 18+ only needed for syntax checking Vercel functions or Vercel CLI).

```bash
pip install -r backend/requirements.txt
cp .env.example .env          # configure secrets if testing Google OAuth / Resend OTP
python3 run.py                # serves frontend + FastAPI API on http://127.0.0.1:8000
```

| Endpoint | URL | Notes |
| :--- | :--- | :--- |
| Website (Local) | `http://127.0.0.1:8000/` | Use `http://localhost:8000/` when testing Google Sign-In |
| Unified Sign-In | `http://127.0.0.1:8000/pages/auth/login.html` | Auto-routes `miriamalobren@gmail.com` to Admin Dashboard |
| FastAPI Docs (dev only) | `http://127.0.0.1:8000/docs` | Auto-disabled when `URBANSCOPE_ENV=production` |
| Live Site (Vercel) | `https://miriam-lobren-real-estate.vercel.app/` | Custom domain: `https://miriamlobren.site` |

### Resetting Local SQLite Data
```bash
rm -f backend/urbanscope.db && python3 run.py
```
- In `development` mode, `init_db()` generates one-time bootstrap passwords into git-ignored `backend/.bootstrap_credentials.txt` unless `SEED_*_PASSWORD` env vars are set.
- Production (`URBANSCOPE_ENV=production`) never auto-generates default passwords or exposes debug/OTP codes.
- Frontend pages also work from VS Code Live Server (`:5500/frontend/`), targeting `http://127.0.0.1:8000/api`.

---

## 2. Environment Variables

See [`../.env.example`](../.env.example) for the complete template. Never commit `.env` or any real secret.

| Variable | Required In | Purpose |
| :--- | :--- | :--- |
| `URBANSCOPE_ENV` | Prod (`production`) | Disables reload & `/docs`, enforces fail-closed secrets & CORS |
| `HOST` / `PORT` | Local (defaults `127.0.0.1` / `8000`) | Local Uvicorn bind settings |
| `ALLOWED_ORIGINS` | Prod (FastAPI) | Comma-separated allowed CORS origins |
| `FORCE_HTTPS` | Prod (FastAPI behind TLS) | Redirects non-HTTPS traffic to HTTPS |
| `ENABLE_API_DOCS` | Optional (`true` in dev) | Explicit override for `/docs`, `/redoc`, `/openapi.json` |
| `URBANSCOPE_SECRET_KEY` | Prod (FastAPI) | JWT signing secret (`>= 32` chars; dev auto-writes git-ignored `backend/.urbanscope_dev_secret`) |
| `VERCEL_ADMIN_SESSION_SECRET` | **Required on Vercel** | Private signing secret (`>= 32` chars) for signed `HttpOnly` user & admin session cookies |
| `VERCEL_ADMIN_EMAILS` | Optional | Additional admin emails (note: Single-Admin policy centers on `miriamalobren@gmail.com`) |
| `GOOGLE_CLIENT_ID` | Google Auth | Google OAuth 2.0 Web Client ID (`*.apps.googleusercontent.com`) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Required on Vercel** | Server-only Supabase `sb_secret_...` or `service_role` key (also resolves `SUPABASE_SECRET_KEY` / integration aliases; rejects publishable keys) |
| `RESEND_API_KEY` | Email OTP / Approvals | Private Resend API key |
| `RESEND_FROM_EMAIL` | Email OTP / Approvals | Verified sender on `miriamlobren.site` (default `UrbanScope <noreply@miriamlobren.site>`) |
| `RESEND_REPLY_TO` | Optional | Verified domain Reply-To address (avoid freemail `@gmail.com` mismatch) |
| `AUTH_OTP_SECRET` | Email OTP | Private HMAC key (`>= 32` chars) hashing one-time codes |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Optional | Cloudflare Turnstile bot protection complementing built-in honeypot, timing & rate limits |

---

## 3. Vercel Hosting Constraints

- **Hobby Serverless Function Limit (`<= 12`):** The `api/` directory currently contains **11** serverless functions (`session.js`, `properties.js`, `inquiries.js`, `superadmin/users.js`, `auth/edge-session.js`, `auth/admin-password/change.js`, `auth/register/{start,check,verify}.js`, `auth/password/reset/{request,confirm}.js`). Consolidate actions via query params rather than adding new `api/*.js` files past 12.
- **Route Protection (`proxy.js` + `vercel.json`):** `vercel.json` wires `proxy.js` via `"proxy": { "entrypoint": "proxy.js", "matcher": [...] }` to intercept admin HTML requests at both public `/pages/admin/*` and underlying `/frontend/pages/admin/*` routes.
- **Security Headers & CSP:** Canonical HSTS, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin-allow-popups`, `Content-Security-Policy`, and `noindex, nofollow` / `no-store` rules for `/api/*`, `/pages/admin/*`, and `/pages/account/*` live in [`../vercel.json`](../vercel.json).
- **`.vercelignore`:** Excludes `backend/`, `docs/`, `supabase/`, Python artifacts, and `.env` from Vercel static uploads.

---

## 4. Third-Party Service Configuration

### Google Identity Services (OAuth 2.0)
- Google Cloud Console forbids raw loopback IPs (`127.0.0.1`) in **Authorized JavaScript origins**. `auth.js` normalizes `127.0.0.1:<port>` to `localhost:<port>` automatically.
- Register these **Authorized JavaScript origins** on the Web Client ID:
  - `http://localhost`
  - `http://localhost:8000`
  - `http://localhost:5500`
  - `https://miriam-lobren-real-estate.vercel.app`
  - `https://miriamlobren.site`

### Resend Transactional Email
- Domain `miriamlobren.site` handles registration OTP, password recovery OTP, and inquiry approval notifications.
- Keep SPF, DKIM, and DMARC aligned in DNS (Namecheap) and avoid freemail `Reply-To` mismatches to maintain inbox deliverability.

### Supabase Database & Migrations
- See [`DATABASE.md`](DATABASE.md) for full schema, RLS policies, and migration checklist.
- Apply all atomic migrations in [`../supabase/migrations/`](../supabase/migrations/) through the latest timestamped file before promoting production.
- Never run `supabase db push` / `db reset --linked` or [`../backend/supabase_schema.sql`](../backend/supabase_schema.sql) against a live project without explicit user confirmation.

---

## 5. Verification Checklist Before Reporting Done

Run checks matching the files you touched:

```bash
# Python syntax check (when touching backend/ or run.py)
python3 -m py_compile run.py backend/*.py backend/routers/*.py

# Node syntax check (when touching api/, lib/, proxy.js, or frontend JS)
node --check proxy.js api/session.js api/properties.js api/inquiries.js

# CSS brace balance check (when touching frontend CSS)
python3 -c '
import glob
for f in sorted(glob.glob("frontend/**/*.css", recursive=True)):
    s = open(f).read()
    assert s.count("{") == s.count("}"), f"Unbalanced braces in {f}"
print("All CSS braces balanced")
'
```
