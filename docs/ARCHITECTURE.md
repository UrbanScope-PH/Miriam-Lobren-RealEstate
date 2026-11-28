# System Architecture — UrbanScope

Current, authoritative architecture reference for **UrbanScope** (Miriam Lobren, Real Estate Salesperson — CD Miranda Realty, Las Piñas & Cavite, Philippines).

> If this document and the code ever disagree, **the code is the source of truth** — update this file to match.

---

## 1. Repository Layout

```text
run.py                        Local entrypoint: FastAPI + static site on 127.0.0.1:8000
proxy.js                      Vercel Routing Middleware guarding admin HTML routes
vercel.json                   Canonical Vercel proxy matcher, security headers, CSP, redirects & rewrites
package.json                  ESM config & Vercel middleware dependency (no browser bundler)
api/                          Vercel Node.js Serverless Functions (11 total — Hobby limit <= 12)
  session.js                  Login, logout, session hydration, Google OAuth/linking, client/admin profile & password, lead agent
  properties.js               Property catalog CRUD & accredited 7-property sync
  inquiries.js                Inquiry CRUD, ownership checks, admin status workflow, stats & notifications
  superadmin/users.js         Admin Accounts & Roles management API (miriamalobren@gmail.com exclusive)
  auth/edge-session.js        Signed HttpOnly admin edge session creation & live DB verification
  auth/admin-password/change.js  Admin password update endpoint
  auth/register/{start,check,verify}.js    Email OTP registration flow
  auth/password/reset/{request,confirm}.js Email OTP password recovery flow
lib/                          Shared server-side Node helpers
  admin-session.js            Signed HttpOnly session cookies, single-admin checks & token helpers
  email-auth.js               Resend transactional emails, 3-tier OTP storage & HMAC verification
  server-security.js          Rate limiting, CSRF/origin validation, quote-safe env parsing & user sanitization
backend/                      Local Python 3 + FastAPI + Uvicorn backend
  app.py                      FastAPI app assembler, CORS, security headers & static mounts
  middleware.py               Server-side RBAC guard (`rbac_admin_guard_middleware`)
  database.py                 SQLite connection (`get_db_connection()` + `NORMALIZE()`), schema init & canonical seed sync
  models.py                   Pydantic v2 schemas (`model_dump`, never `.dict()`)
  auth.py                     PBKDF2-HMAC-SHA256 hashing, JWTs, Google token verification & `require_admin` / `require_main_admin`
  auth_otp.py                 Local Resend OTP & approval email handlers
  security.py                 Local rate limiting, validation & user sanitization
  routers/                    Modular routers: system.py, auth.py, properties.py, inquiries.py, superadmin.py, web.py
frontend/                     Static browser frontend (no framework, no bundler; served at `/`)
  index.{html,css,js}         Homepage, hero search bar, featured catalog, About Me, FAQs, consultation modal
  robots.txt, sitemap.xml     SEO crawler rules & sitemap
  pages/
    properties/               Dynamic `property-detail.{html,css,js}` (?id=N) + 7 accredited static showcases
    inquiry/                  Dual-mode inquiry form (`inquiry.*`) & client history (`history.*`, requires login)
    account/                  Client Profile & Security (`profile.*`, `<html data-require-auth>`)
    auth/                     Unified `login.*`, `register.*`, `forgot-password.*`, shared `auth.{css,js}`
    legal/                    Terms of Service (`terms.html`, RESA RA 9646) & Privacy Policy (`privacy.html`, DPA RA 10173)
    admin/                    Admin portal (`dashboard`, `propertylist`, `add-property`, `edit-property`, `clients`, `users`, `profile`, `admin-shell`, `login` redirect stub)
  shared/
    css/                      `tokens.css`, `common.css`, `session.css`, `splash.css`, `skeleton.css`, `mobile-shell.css`
    js/                       `supabase.js` (active REST gateway), `session.js`, `splash.js`, `skeleton.js`, `api.js` (mirror)
  assets/images/              Optimized property galleries, brand logos, agent portraits
supabase/                     Supabase CLI project (`config.toml`, atomic `migrations/`, `seed.sql`, `scripts/`)
docs/                         Organized documentation (this folder)
```

---

## 2. Frontend Layer & Script Loading

### Directory & URL Mirroring
- **One folder per feature** under `frontend/pages/<section>/`, keeping `.html`, `.css`, and `.js` side by side.
- URLs mirror `frontend/` (e.g., `frontend/pages/auth/login.html` → `/pages/auth/login.html`).
- `backend/app.py` mounts `frontend/{pages, shared, assets}` and serves `frontend/index.*` + `favicon.ico`. Adding a new folder under `frontend/pages/` requires no backend mount change; adding a new top-level folder under `frontend/` requires updating both `backend/app.py` and `vercel.json` rewrites.
- Pages inside `frontend/pages/<section>/` are two levels deep and use `../../shared/…`, `../../assets/…`, `../../index.html`, and `../<sibling>/…`. `getBasePath()` in `session.js` detects `/pages/` and returns `../../` (else `./`).
- Property `image_url` values are stored **root-relative** (`assets/images/…`); prefix with base path when rendering from a subpage (preserve `data:image/` and `https://` URLs as-is).

### Script Load Order
1. In `<head>`: `shared/js/skeleton.js` (early page-entry shimmer shell on all 24 active pages; omitted on `admin/login.html` redirect stub).
2. At page scripts: **`shared/js/supabase.js` → `shared/js/session.js` → page-specific `.js`**.
   - Admin pages load `admin-shell.js` instead of client navigation injection (`session.js` explicitly guards `/pages/admin/`).

### Dual REST Gateway (`supabase.js` & `api.js`)
- Pages load **`frontend/shared/js/supabase.js`** — despite the filename, it is a unified REST gateway that talks to local FastAPI (`:8000/api`) or hosted Vercel Serverless Functions (`/api/*`), with public-catalog-only `SELECT` fallback to Supabase PostgREST.
- `frontend/shared/js/api.js` is a near-duplicate kept in sync. **Whenever you modify gateway functions in `supabase.js`, apply the matching change to `api.js`** (do not delete or rename `supabase.js` without explicit user approval).
- Gateway functions return `null` on failure so pages gracefully fall back to static/cached data — preserve that contract.
- Built-in `READ_CACHE` handles in-flight request deduplication and short TTL caching (`properties`, `currentUser`, `adminNotifications`, `clientNotifications`), with cross-tab sync via `BroadcastChannel` and `storage` events.

---

## 3. Seven Accredited Listings

The canonical catalog contains 7 accredited properties synchronized across SQLite (`backend/database.py`), Supabase (`supabase/seed.sql` + migrations), Vercel `/api/properties` (`sync_accredited`), and static showcases in `frontend/pages/properties/`:

1. **Casasuerte** (`casasuerte.html`)
2. **Kathleen - Place 5** (`kathleen.html`)
3. **Liora Homes** (`Liora.html`)
4. **Airmen's Village Triplex** (`Airmen.html`)
5. **Benecia Single-Attached** (`benecia.html`)
6. **Amore Classico – Benedetto Residences** (`amore-classico.html`)
7. **Midori Mid-Rise Condo – Zone 1** (`midori.html`)

- Sold properties remain visible with a **Sold Out** badge but block new inquiries.
- Additional admin-created listings render via dynamic `property-detail.html?id=<id>` and persist uploaded images in `property_images`.

---

## 4. Authentication, Sessions & Single-Admin RBAC

### Single-Admin Policy (Current Truth)
- **`miriamalobren@gmail.com`** is the **sole authorized Realty Administrator** across the entire stack (`lib/admin-session.js`, `lib/server-security.js`, `proxy.js`, `api/*`, `backend/auth.py`, `backend/middleware.py`, SQLite triggers, and Supabase migration `20261126164500_single_admin_miriamalobren.sql`).
- Standalone `/pages/superadmin/` was **removed**. Legacy `/superadmin` and `/pages/superadmin/*` URLs redirect to `/pages/admin/users.html`.
- `/pages/admin/users.html` (**Accounts & Roles**) is visible and accessible only to `miriamalobren@gmail.com`. It supports viewing, creating, editing, password-resetting, and deleting non-admin user accounts — **all Promote/Demote UI and API mutations are removed and rejected server-side (`403`/`400`)**.
- Unified sign-in lives at `/pages/auth/login.html` (`/pages/admin/login.html` redirects there). Authorized admin sign-ins route to `/pages/admin/dashboard.html`; clients route to `/` or `?redirect=...`.

### Dual Hosting Auth Architecture
- **Local FastAPI:** PBKDF2-HMAC-SHA256 password verification (`100,000` iterations), PyJWT tokens + `HttpOnly` `access_token` cookie, `rbac_admin_guard_middleware` protecting `/admin`, `/pages/admin/*`, `/superadmin`, `/pages/superadmin/*`, and `require_admin` / `require_main_admin` FastAPI dependencies.
- **Hosted Vercel:**
  - `proxy.js` (Vercel Routing Middleware) verifies the signed `HttpOnly` `urbanscope_admin_session` cookie before serving admin HTML at both public `/pages/admin/*` and underlying `/frontend/pages/admin/*` paths.
  - All private reads/writes route through Vercel `/api/*` functions using server-only `SUPABASE_SERVICE_ROLE_KEY` (Supabase RLS locks browser `anon` access strictly to public `SELECT` on `properties` and `property_images`).
  - `verifyLiveAdminSession()` validates admin sessions against the live database on protected API calls; hosted authorization **never** trusts `localStorage`.

### Email OTP, Google OAuth & Client Profile
- **Email OTP (Resend):** Password registration and password reset send HMAC-hashed one-time codes via Resend (`noreply@miriamlobren.site` or configured sender). Node `lib/email-auth.js` implements a 3-tier challenge fallback: (1) Supabase RPC → (2) `auth_email_challenges` REST table → (3) HMAC-signed `HttpOnly` cookie (`urbanscope_otp_challenge`). Forgot-password blocks unregistered/Google-only accounts (`404 EMAIL_NOT_REGISTERED` / `400 GOOGLE_ACCOUNT_NO_PASSWORD`).
- **Google Identity Services (OAuth 2.0):** Available on Login, Register, Client Profile & Security (`/pages/account/profile.html`), and Admin Profile (`/pages/admin/profile.html`). Server-side verification checks Google `tokeninfo`/`userinfo`, audience (`GOOGLE_CLIENT_ID`), and `email_verified == true`.
- **Client Profile & Security (`/pages/account/profile.html`):** Requires login (`<html data-require-auth>`). Clients can update **Full Name** and **Contact Number**, add/change password, or link a Gmail address (`POST /api/auth/google/link` / `POST /api/session?action=link-google`). Client email and photo mutations are rejected server-side (`403`). Google-only accounts (`has_password === false`) show a red navbar reminder dot until they set a password.
- **Admin Profile (`/pages/admin/profile.html`):** Edits Full Name, Professional Title / Role, Email, Contact Phone, Password, Profile Photo (< 5 MB, canvas-compressed), and Google Account linking. Changes dynamically sync to the homepage navbar, About Me section, FAQs, CTA, and sitewide footers via `GET /api/agent/profile` and `urbanscope:profileUpdated`.

---

## 5. Consultations, Inquiries & Notifications

- **Guest & Logged-In Inquiries:** Guests can submit inquiries without logging in (protected by honeypot, timing checks, distributed rate limits, and optional Turnstile). Logged-in clients get auto-filled contact fields and full tracking in `/pages/inquiry/history.html`.
- **Dual-Mode Flow:** Homepage consultation CTAs open `#consultationIntentModal` offering *General Consultation / Question* (`?type=general`) or *Specific Property Inquiry* (`?type=property`).
- **Status Workflow & Attribution:** Statuses are `Under Review`, `Approved`, `Completed`, and `Cancelled`. `inquiries.cancelled_by` (`'client'` | `'admin'` | `NULL`) drives `Cancelled by Client` vs `Cancelled by Admin` labels across Admin Dashboard, Client Inquiries, and Client Inquiry History.
- **Notifications:** Approving an inquiry triggers non-blocking Resend email notifications plus near-real-time UI updates via `BroadcastChannel('urbanscope_notifications')`, short `READ_CACHE` TTLs, and scoped read-marking.
- **Admin Dashboard Structure:** 5 KPI cards → `Inquiry Status` animated donut chart & `Recent Notifications` → `Property Viewing Calendar` (clickable agenda cards opening `#inquiryModal`) → `Recent Inquiries` (4-item preview + `View All Inquiries →` link to `clients.html`). Property table management lives on `/pages/admin/propertylist.html`.
