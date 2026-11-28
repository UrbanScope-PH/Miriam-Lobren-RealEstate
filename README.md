# UrbanScope — Miriam Lobren · CD Miranda Realty

[![Deployment](https://img.shields.io/badge/Vercel-Production%20Live-brightgreen?logo=vercel)](https://miriam-lobren-real-estate.vercel.app/)
[![Python](https://img.shields.io/badge/Python-3.9+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-Framework-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![License](https://img.shields.io/badge/License-Proprietary-blue.svg)](https://miriam-lobren-real-estate.vercel.app/)

> **Better Homes, Brighter Futures**
> A responsive real estate website for property discovery, client inquiries, and admin management.

Built for **Miriam Lobren, Real Estate Salesperson** (CD Miranda Realty, Las Piñas & Cavite, Philippines).

Follow a buyer from the Kathleen listing to an approved viewing request in the [60-second UrbanScope walkthrough (4K, 60 fps)](UrbanScope-Walkthrough-4K60.mp4).

---

## ✨ Features

- **Property Showcase** — featured accredited listings (Casasuerte, Kathleen, Liora Homes, Airmen's Village Triplex, Benecia Single-Attached, Amore Classico – Benedetto Residences, and Midori Mid-Rise Condo – Zone 1) with a hero search bar (property type, location, sort, and keywords), photo galleries, current pricing, and location maps. Sold listings remain visible with a Sold Out label but no longer accept new inquiries.
- **Modern UI, Motion & Clean Search** — shared motion tokens keep hover, menu, modal, toast, theme, and scroll-reveal timing consistent across public and admin pages; reduced-motion preferences shorten transitions and remove decorative movement. Also includes responsive viewport metrics, a floating back-to-top button with SVG scroll progress, quick-contact FAB, glassmorphic hero search, and CSS Grid FAQ accordion with category filters.
- **Solid-Color Visual System** — flat-color backgrounds, controls, overlays, and loading placeholders across public, client, Admin, and Superadmin pages; gradient effects have been removed.
- **Client Accounts, Profile & Google Sign-In** — email-code verification for password registration, one-time-code password recovery, PH phone validation, one-click **Google Authentication** (OAuth 2.0 via Google Identity Services), and a dedicated **Profile & Security** page (`/pages/account/profile.html`) for updating contact details, setting/changing passwords, and linking Gmail accounts.
- **Consultations & Inquiries** — interactive consultation intent flow allowing clients to book general consultations (free site tripping, loan pre-approval, property advice) or inquire about specific accredited listings. **Guest inquiries are accepted with zero login required** (honeypot-protected against spam), and post-submission prompts allow guests to optionally create an account with pre-filled details to track their inquiries in the client history portal.
- **Direct Multi-Channel Contact** — floating quick-contact button (`.contact-fab`) providing instant 1-tap access to Facebook Messenger (`https://m.me/miriam.lobren`), direct phone call (`tel:+639189645434`), and SMS with pre-composed property inquiry messages.
- **Search Engine Optimization & Social Sharing** — full Open Graph and Twitter Card link previews across all public pages, dynamic JSON-LD `RealEstateAgent` schema markup, canonical URLs, `robots.txt`, and automated `sitemap.xml`.
- **High-Performance Assets & Skeleton Loaders** — compressed progressive JPEG imagery, responsive preloading on key banners, native `loading="lazy" decoding="async"` on below-the-fold thumbnails, and sitewide shimmer skeletons across all active pages.
- **System-Wide Dark Mode** — seamless dark theme with multi-layer preference persistence (`localStorage`, 1-year cookie, and window session), smooth crossfade transitions, comfortable photo dimming, and high-contrast accessible controls.
- **Single-Admin Dashboard & Account Governance** — streamlined dashboard with KPI cards, animated inquiry status donut & notification analytics, interactive property viewing calendar, recent inquiries preview (`4` items) with `View All Inquiries`, Client Inquiries management (`clients.html`), custom property filters & CRUD (`propertylist.html`), and **Accounts & Roles** management (`/pages/admin/users.html`, restricted exclusively to `miriamalobren@gmail.com`).
- **Administrative Access Control** — Vercel checks a signed, `HttpOnly` session before serving Admin pages. Hosted admin sign-in enforces single-admin verification for `miriamalobren@gmail.com`; normal client sign-ins and editable browser storage cannot grant administrative access.
- **Legal & Privacy Hub** — comprehensive Terms of Service (aligned with RESA RA 9646) and Privacy Policy (compliant with Philippine Data Privacy Act RA 10173).
- **Responsive Design** — optimized for desktop, tablet, and mobile with a shared mobile navigation shell across public, client, and admin pages, dynamic viewport sizing (`100dvh`), safe-area insets, mobile keyboard hints, high-contrast WCAG AA typography, and stacked admin mobile cards.

---

## 🛠️ Tech Stack

| Layer | Technology |
| :--- | :--- |
| Frontend | HTML5, vanilla CSS3, vanilla JavaScript (ES6) — no framework or bundler |
| Backend (local) | Python 3, FastAPI, Uvicorn |
| Backend (hosted) | Vercel static hosting, Node.js Serverless Functions (`api/`), Routing Middleware (`proxy.js`) |
| Database | SQLite for local development (auto-created and seeded); Supabase PostgreSQL for the hosted site |
| Auth | PBKDF2 password hashing, Google Identity Services (OAuth 2.0), JWT (PyJWT), signed `HttpOnly` session cookies |
| Email | Resend (registration and password-recovery codes) |

---

## 🚀 Getting Started

**Requirements:** Python 3.9+ (Node.js is only needed for Vercel deployments)

```bash
pip install -r backend/requirements.txt
python3 run.py
```

| Page | URL |
| :--- | :--- |
| Website (Local) | http://127.0.0.1:8000/ |
| Sign-In | http://127.0.0.1:8000/pages/auth/login.html |
| API Docs | http://127.0.0.1:8000/docs |
| Live Site (Vercel) | https://miriam-lobren-real-estate.vercel.app/ |


**Environment variables (optional — or configure in `.env`, see `.env.example`):**

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `URBANSCOPE_ENV` | `development` | Set to `production` in production deployments (disables debug/Swagger `/docs` unless enabled, enforces strict HTTPS/CORS/secret checks) |
| `HOST` | `127.0.0.1` | Server host |
| `PORT` | `8000` | Server port |
| `ALLOWED_ORIGINS` | local dev defaults | Comma-separated allowed CORS origins for production APIs |
| `FORCE_HTTPS` | `false` | Redirects non-HTTPS requests to HTTPS when enabled behind TLS proxies |
| `ENABLE_API_DOCS` | `true` (dev) | Controls `/docs`, `/redoc`, and `/openapi.json` exposure (disabled automatically when `URBANSCOPE_ENV=production`) |
| `URBANSCOPE_SECRET_KEY` | git-ignored dev key | JWT signing secret (`>= 32` chars). **Required in production.** |
| `GOOGLE_CLIENT_ID` | *(empty)* | Google OAuth 2.0 Web Client ID (`*.apps.googleusercontent.com`) for Google Sign-In |
| `VERCEL_ADMIN_SESSION_SECRET` | *(required on Vercel)* | Private random signing secret (`>= 32` chars) for signed `HttpOnly` user and Admin/Superadmin session cookies. |
| `VERCEL_ADMIN_EMAILS` | *(optional)* | Comma-separated additional Google email addresses permitted to use the Vercel Admin portal. |
| `RESEND_API_KEY` | *(required for email OTP)* | Private Resend key used by server endpoints to send registration and password-recovery codes. |
| `RESEND_FROM_EMAIL` | `UrbanScope <noreply@miriamlobren.site>` | Verified sender address configured in Resend (custom domain `miriamlobren.site`). |
| `AUTH_OTP_SECRET` | *(required for email OTP)* | Private random secret (`>= 32` chars) used to HMAC-hash OTPs. |
| `SUPABASE_SERVICE_ROLE_KEY` | *(required on Vercel)* | Server-only key used by `/api/*` endpoints to read/write RLS-protected Supabase tables and rate-limit RPCs. Never expose in frontend JS. |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | *(optional)* | Optional Cloudflare Turnstile widget keys complementing built-in honeypot, form-timing, and distributed rate-limiting checks. |

For hosted deployments, apply all Supabase migrations through `supabase/migrations/20261115031500_security_rls_and_rate_limits.sql`, configure the private secrets in Vercel Project Settings, and set platform spend/billing caps on Vercel, Supabase, Resend, and Google Cloud before deploying. Local development generates initial staff bootstrap credentials once in git-ignored `backend/.bootstrap_credentials.txt` unless `SEED_*_PASSWORD` env vars are provided.

To reset local SQLite data, delete `backend/urbanscope.db` and restart the server.

> [!NOTE]
> Never store admin passwords or service-role keys in source control. Set
> `URBANSCOPE_ENV=production`, `URBANSCOPE_SECRET_KEY`, `VERCEL_ADMIN_SESSION_SECRET`,
> `AUTH_OTP_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY` before deploying publicly.

---

## 📖 User & Administrator Manual

### 1. Client / Homebuyer Guide
- **Browsing Properties:** Visit the home page to view showcased listings, use the search bar to filter by property type (Townhouses, Triplex, House & Lot, Condominium) and location, sort by featured, newest, or price, or search by keyword. Click any property card to view high-resolution photos, pricing, lot/floor area, amenities, and location details.
- **Client Registration & Login:** Click **Sign In** in the top navigation bar. Password registration verifies email ownership with a one-time code before creating an account; **Forgot password** sends a separate recovery code. Users can also register via **Sign up with Google**. Manual account creation and Google OAuth require accepting the **Terms of Service and Privacy Policy** before proceeding.
- **Consultations & Dual-Mode Inquiries:** On the homepage, clicking **Book a Free Consultation** opens an interactive intent modal allowing clients to choose between *General Consultation / Question* (free site viewing, loan pre-approval, general advice) or *Inquire About a Specific Property* with dynamic listing selection, photo previews, and automated pricing details.
- **Inquiry History & Management:** Access **Inquiry History** via the client profile menu or topbar to track submitted requests, filter by status (*Under Review*, *Approved*, *Contacted*, *Cancelled*), view agent approval notices, modify inquiry messages or contact phones, cancel active requests, or permanently delete records.
- **Legal Compliance:** Review comprehensive, RESA-compliant Terms of Service and NPC-compliant Privacy Policy pages, fully integrated with seamless back navigation.

### 2. Administrator Guide (Miriam Lobren & Team)
- **Unified Sign-In:** Log in via `/pages/auth/login.html`. Authorized administrative accounts are automatically routed to the Admin Dashboard.
- **Shared Admin Navigation:** Dashboard, Properties, Client Inquiries, Accounts & Roles, and Profile & Security use the same sidebar icons, section labels, active state, and UrbanScope green palette across admin screens.
- **Dashboard & Client Inquiry Details:** Open a consistent inquiry details modal from the dashboard or Client Inquiries page, review contact and schedule details, reply by email, and approve or cancel inquiries with status updates reflected in the client's history.
- **Property Viewing Calendar:** Opens on today's browser-local date, marks the current day, supports month and date selection, and shows configured appointments plus client inquiry requests with preferred dates and times.
- **Managing Properties (CRUD):**
  - **View Listings:** Access `propertylist.html` to browse active catalog listings with status indicators.
  - **Add Property:** Click **Add New Property** (`add-property.html`) to input property name, category, price (₱), location, bedrooms, bathrooms, dimensions, amenities, and upload images.
  - **Edit Property:** Select **Edit** on any listing card (`edit-property.html`) to update pricing, specifications, or replace photos.
  - **Delete Property:** Remove unlisted or sold properties with immediate database and cache synchronization.
- **Client Inquiries & CRM:** Review client inquiries under `clients.html`, inspect contact information, track message details, approve client requests via the modal or inline select, and update inquiry follow-up statuses (e.g., *Under Review*, *Approved*, *Completed*).
- **Accounts & Role Access (`users.html`):** Accessible exclusively to the main administrator (`miriamalobren@gmail.com`) via `Accounts & Roles` in the Admin sidebar — create client accounts, edit full name, email, and contact phone, reset passwords, and delete client accounts synchronized across local SQLite and Supabase Cloud.
- **Profile Picture Upload, Google Linking & Settings:** Visit `profile.html` to update contact details, change passwords, link your Google account, and upload custom profile photos (< 5MB limit) with automatic canvas optimization, live topbar avatar synchronization, and one-click photo reset.

---

## 📂 Project Structure

```text
├── run.py                  # Starts local FastAPI server + static site
├── proxy.js                # Vercel Routing Middleware guarding Admin/Superadmin HTML routes
├── vercel.json             # Vercel headers, CSP, redirects, and static rewrites
├── package.json            # Vercel middleware dependency (ESM)
├── api/                    # Vercel Node.js Serverless Functions
│   ├── session.js          # Login, logout, session, Google OAuth, profile & lead-agent API
│   ├── properties.js       # Property catalog CRUD & accredited listing sync
│   ├── inquiries.js        # Client inquiries, status workflow & notifications API
│   ├── auth/               # Signed admin edge session, registration OTP & password reset
│   └── superadmin/         # Superadmin user & RBAC management (`users.js`)
├── lib/                    # Shared server-side Node helpers
│   ├── admin-session.js    # Signed HttpOnly session cookie & token utilities
│   ├── email-auth.js       # Resend OTP email sender & HMAC code verification
│   └── server-security.js  # Rate limiting, CSRF/origin validation & input guards
├── backend/                # Local Python FastAPI backend
│   ├── app.py              # FastAPI app assembler, CORS, security headers & static mounts
│   ├── middleware.py       # Server-side RBAC route guard for `/admin` & `/superadmin`
│   ├── auth.py             # PBKDF2 hashing, JWT tokens & Google OAuth verification
│   ├── auth_otp.py         # Local registration & password-reset OTP handlers
│   ├── security.py         # Local rate limiting & request validation helpers
│   ├── database.py         # SQLite connection, schema init & canonical seed sync
│   ├── models.py           # Pydantic v2 request/response schemas
│   ├── requirements.txt    # Python dependencies
│   └── routers/            # Modular API & web routers (system, auth, properties, inquiries, superadmin, web)
├── frontend/               # Static browser frontend (served at `/`)
│   ├── index.html/.css/.js # Home page, hero search bar & featured property catalog
│   ├── robots.txt          # Search crawler rules
│   ├── sitemap.xml         # Public XML sitemap
│   ├── pages/
│   │   ├── properties/     # 7 accredited showcases (`casasuerte`, `kathleen`, `Liora`, `Airmen`, `benecia`, `amore-classico`, `midori`) & dynamic `property-detail`
│   │   ├── inquiry/        # Dual-mode consultation/property inquiry form (`inquiry.*`) & client history (`history.*`)
│   │   ├── account/        # Client Profile & Security (`profile.*`, password & Google linking)
│   │   ├── auth/           # Unified sign-in (`login.*`), registration (`register.*`) & recovery (`forgot-password.*`)
│   │   ├── legal/          # RESA Terms of Service (`terms.html`) & DPA Privacy Policy (`privacy.html`)
│   │   └── admin/          # Agent dashboard, `propertylist`, `add-property`, `edit-property`, `clients`, `users` (Accounts & Roles) & `profile`
│   ├── shared/
│   │   ├── css/            # `tokens.css`, `common.css`, `session.css`, `splash.css`, `skeleton.css`, `mobile-shell.css`
│   │   └── js/             # `supabase.js` (API gateway), `session.js`, `splash.js`, `skeleton.js`, `api.js`
│   └── assets/images/      # Optimized property galleries, brand logos & agent avatars
├── supabase/               # Supabase CLI project (`config.toml`, atomic `migrations/`, `seed.sql`, `scripts/`)
├── docs/                   # Organized documentation hub (see `docs/README.md`)
│   ├── README.md           # Documentation index & maintenance rules
│   ├── ARCHITECTURE.md     # Current frontend, backend, Vercel & Single-Admin RBAC architecture
│   ├── UI_GUIDELINES.md    # Flat color design system, banned patterns, Dark Mode & mobile standards
│   ├── DATABASE.md         # SQLite & Supabase schema, RLS policies & atomic migration checklist
│   ├── DEPLOYMENT.md       # Local setup, env vars, Vercel Hobby limits, OAuth & Resend setup
│   ├── CHANGELOG.md        # Chronological session & feature changelog
│   └── archive/            # Historical archive of legacy agent notes (`LEGACY_AGENT_NOTES.md`)
├── AGENTS.md               # Concise master instructions for AI coding agents
├── CLAUDE.md               # Claude Code shim importing `AGENTS.md`
└── CONTRIBUTING.md         # Branching, commit & pull request workflow
```

---

## 📚 Documentation

- **[Documentation Index](docs/README.md)** — Complete map of all guides and when to read/update each file
- **[AI Agent Guide](AGENTS.md)** — Core invariants, workflow rules, and output standards for AI coding agents
- **[Architecture](docs/ARCHITECTURE.md)** — Frontend, REST gateway, FastAPI, Vercel API, auth & Single-Admin RBAC
- **[UI & Mobile Guidelines](docs/UI_GUIDELINES.md)** — Visual design rules, banned patterns, Dark Mode & mobile contract
- **[Database](docs/DATABASE.md)** — SQLite & Supabase schema, RLS policies, seeds & migrations
- **[Deployment & Operations](docs/DEPLOYMENT.md)** — Local run, env vars, Vercel limits, Google OAuth & Resend email
- **[Changelog](docs/CHANGELOG.md)** — Chronological feature & bug-fix history

---

## 📄 Credits

- **Agent:** Miriam Lobren (Real Estate Salesperson, CD Miranda Realty)
- **Platform:** UrbanScope

&copy; 2026 UrbanScope. All rights reserved.
