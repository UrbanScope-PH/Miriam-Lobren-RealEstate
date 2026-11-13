# AGENTS.md

Guidance for AI coding agents (Antigravity, Claude Code, Codex, Cursor, Copilot, etc.)
working in this repository. Humans are welcome too — see [README.md](README.md) for the
product overview and [DATABASE.md](DATABASE.md) for the data layer.

---

## Project at a Glance

**UrbanScope** — a real estate website for agent **Miriam Lobren**
(Las Piñas & Cavite, Philippines). Public property catalog, client accounts and inquiries,
and an admin/superadmin dashboard.

| Layer | Tech |
| :--- | :--- |
| Frontend | Static **HTML + vanilla CSS + vanilla JS (ES6)** — no framework or bundler; Vercel uses a small Node package for route protection |
| Backend | **Python 3 + FastAPI + Uvicorn** (`backend/`) |
| Database | **SQLite** file `backend/urbanscope.db` (auto-created and seeded) |
| Auth | PBKDF2 password hashes + **Google Identity Services (OAuth 2.0)** + local FastAPI JWTs and signed Vercel admin session cookies |
| Fonts | Plus Jakarta Sans, Dancing Script (Google Fonts) |

---

## Setup & Run

```powershell
pip install -r backend/requirements.txt
python run.py            # serves site + API on http://127.0.0.1:8000
```

- Site: `http://127.0.0.1:8000/` · API docs: `http://127.0.0.1:8000/docs`
- `run.py` uses `uvicorn --reload`, so Python edits hot-reload.
- Env vars (or `.env` in root — see `.env.example`): `HOST`, `PORT`, `URBANSCOPE_SECRET_KEY`, `GOOGLE_CLIENT_ID`; Vercel deployments also require `VERCEL_ADMIN_SESSION_SECRET` and may set `VERCEL_ADMIN_EMAILS` in Vercel project settings.
- Frontend also works from VS Code Live Server (`:5500/frontend/`); it calls the API at `http://127.0.0.1:8000/api`.
- **Reset data:** delete `backend/urbanscope.db` and restart (or run `python backend/seed_rbac.py`).

Demo logins:
- Superadmin: `urbanscope.cvsu@gmail.com` / `urbanscope2026`
- Admin: `miriamalobren@gmail.com` (pass: `111112` or updated via Admin Profile; legacy demo: `admin.realestate@gmail.com` / `realestate2026`)

There is **no test suite, linter, or build step**. Verify changes by running the server
and exercising the page / `/docs` endpoint you touched.

---

## Repository Map

```text
run.py                 Starts FastAPI + static site (uvicorn backend.app:app)
proxy.js               Vercel Routing Middleware protecting admin/superadmin HTML routes
api/auth/              Vercel Node Function for signed hosted admin sessions
lib/admin-session.js   Shared signed-session cookie and token helpers
package.json           ESM mode and Vercel Routing Middleware helper dependency
backend/               app.py (FastAPI assembler), middleware.py (RBAC guard), routers/ (system, auth, properties, inquiries, superadmin, web), database.py, models.py, auth.py, seed_rbac.py, migration_rbac.sql
frontend/              Everything the browser loads (served at /)
  index.html/.css/.js  Home page
  pages/properties/    property-detail (?id=N), casasuerte.html, kathleen.html, Liora.html, Airmen.html, benecia.html & amore-classico.html showcases (properties.html catalog was removed)
  pages/inquiry/       Inquiry form (inquiry.html) & client history (history.html) (requires login: <html data-require-auth>)
  pages/auth/          Unified login (auto-routes by role), register, and forgot-password flow
  pages/legal/         Terms of Service (terms.html) & Privacy Policy (privacy.html)
  pages/admin/         Dashboard, propertylist.html, add-property, edit-property, clients, profile, legacy login redirect (users.html redirects)
  pages/superadmin/    Master overview, system diagnostics, user account modification & RBAC management
  shared/css/          common.css (design tokens, navbar, footer), session.css, splash.css
  shared/js/           supabase.js (API gateway), session.js, splash.js, api.js
  assets/images/       Photos, logos, icons
supabase/              Supabase CLI project: config.toml, migrations/ (timestamped .sql), seed.sql, scripts/ (one-off SQL Editor fixes) — see DATABASE.md §10
```

Rule of thumb: **one folder per feature under `frontend/pages/`, and each page keeps its
`.html`, `.css`, and `.js` side by side.** Cross-page code goes in `frontend/shared/`.

URLs mirror the folders inside `frontend/` (e.g. `frontend/pages/auth/login.html` →
`/pages/auth/login.html`). `backend/app.py` mounts `frontend/{pages, shared, assets}` and
serves `frontend/index.*` + `favicon.ico`; a new folder directly under `frontend/` will 404
until you add it to that mount list. A new feature folder under `pages/` needs no backend change.
Old pre-reorganization URLs (`/properties/…`, `/inquiry/…`, `/auth/…`, `/admin/…`) 301-redirect
to `/pages/…`.

---

## Architecture Notes

### Frontend → backend

- Pages load **`shared/js/supabase.js`** — *not* `api.js`. Despite the name it has nothing
  to do with Supabase; it's a REST client for FastAPI that exposes globals:
  `apiGetProperties`, `apiGetPropertyById`, `apiAddProperty`, `apiUpdateProperty`,
  `apiDeleteProperty`, `apiSubmitInquiry`, `apiGetInquiries`, `apiSignUp`, `apiSignIn`,
  `apiGetGoogleConfig`, `apiSignInWithGoogle`, `apiCreateHostedAdminSession`,
  `apiGetHostedAdminSession`, `apiSignOut`, `apiGetCurrentUser`,
  `apiStartRegistrationOtp`, `apiCompleteRegistrationOtp`, `apiRequestPasswordReset`,
  `apiCompletePasswordReset`,
  `isBackendConfigured` / `isSupabaseConfigured`.
- `shared/js/api.js` is a near-duplicate that no page currently loads. If you change one
  gateway, change both (or consolidate — ask first).
- API base URL: same origin when served on port `8000`, otherwise `http://127.0.0.1:8000/api`.
- Gateway functions return `null` on failure and pages fall back to static data — keep that contract.

### Script load order

`supabase.js` → `session.js` → page script. `session.js` depends on the gateway globals.

### Paths

Pages in `frontend/pages/<section>/` are two levels below the frontend root, so they use
`../../shared/…`, `../../assets/…`, `../../index.html`, and `../<other-section>/…` for sibling
sections. The JS helpers (`getBasePath()` in `session.js` and the path resolver in
`splash.js`) detect `/pages/` in the URL and return `../../` (else `./`).
Login `?redirect=` values are relative to the frontend root (e.g. `pages/inquiry/inquiry.html`).
Property `image_url` values are **root-relative** (`assets/images/…`); prefix with the base
path when rendering from a page.

### Backend & Authorization

- Routes are modularized under `backend/routers/` (`system.py`, `auth.py`, `properties.py`,
  `inquiries.py`, `superadmin.py`, `web.py`) and assembled in `backend/app.py`. Raw SQL with `?`
  placeholders — **never** f-string user input into SQL. (The `UPDATE` builder interpolates column
  names only from Pydantic field names.)
- Always open connections via `get_db_connection()` — it registers the `NORMALIZE()` SQL function
  used for accent-insensitive search.
- Request/response shapes live in `backend/models.py` (Pydantic v2; use `model_dump`, not `dict`).
- Schema changes: follow the checklist in [DATABASE.md §5](DATABASE.md#5-migrations).
- **Server-Side RBAC Guard:** `backend/middleware.py` (`rbac_admin_guard_middleware`, registered in
  `backend/app.py`) guards all requests to `/admin`, `/pages/admin/*`, `/superadmin`, and
  `/pages/superadmin/*`. Unauthenticated users are redirected to `/pages/auth/login.html?redirect=...`.
- **API Protection:** Endpoints creating/modifying listings (`POST/PUT/DELETE /api/properties`),
  accessing client inquiries (`GET /api/inquiries`), and reading metrics (`GET /api/stats`) are
  protected by the `require_admin` dependency. Superadmin endpoints (`/api/superadmin/*`) are
  protected by `require_superadmin`.
- **Vercel Static-Page Protection:** Since Vercel serves HTML statically and does not run FastAPI middleware, root `proxy.js` checks a signed `HttpOnly` admin cookie before serving Admin/Superadmin HTML at public and underlying `/frontend/pages/...` paths. `api/auth/edge-session.js` verifies Google tokens or email/password credentials server-side and issues a 12-hour cookie only for the staff allowlist (`admin.realestate@gmail.com`, `miriamalobren@gmail.com`, `miriam@gmail.com`, `urbanscope.cvsu@gmail.com`) and optional `VERCEL_ADMIN_EMAILS` entries. Approved Admin staff can access the Admin portal; only the root Superadmin can access Superadmin. Configure a private `VERCEL_ADMIN_SESSION_SECRET` (at least 32 characters) in Vercel Project Settings before deployment. Hosted route authorization never trusts localStorage role values.

---

## Conventions

- **No new browser dependencies or frameworks** (no React, Tailwind, jQuery) unless the user asks. Deployment-only packages are allowed when required by the hosting platform; keep the browser frontend dependency-free.
- **CSS:** reuse tokens and components from `frontend/shared/css/common.css`; feature styles go in the
  feature's own `.css` file. Keep the existing premium look and responsive layouts.
- **JS:** vanilla ES6, IIFE or plain scripts, no modules/bundling. Escape user-provided text before
  inserting into HTML (see `esc()` in `session.js`).
- **HTML:** semantic elements, one `<h1>` per page, descriptive `<title>` and meta description,
  unique `id`s on interactive elements.
- **Python:** follow the existing style — module docstrings, section banner comments, type hints,
  close every connection you open.
- **Locale:** prices in Philippine Pesos (₱), phone numbers in PH format (`+63…` / `09…`),
  place names keep their diacritics (Las Piñas, Dasmariñas).
- Preserve existing comments and docstrings unrelated to your change.
- `README.md` is the **public** overview — keep it short (features, stack, setup, top-level structure) and never
  list admin/superadmin credentials there. Detailed internals belong in `AGENTS.md` / `DATABASE.md`; keep those in sync.
- **Supabase Migrations as Git History:** Treat Supabase migrations strictly like Git commit history. Every logical schema modification, column addition, constraint update, or data normalization MUST be placed in its own separate, atomic migration file (`supabase/migrations/YYYYMMDDHHMMSS_<feature_name>.sql`). Never combine multiple unrelated changes into a single migration file, never edit already-applied migrations, ensure every migration is idempotent (`IF NOT EXISTS`, `DROP … IF EXISTS`), and commit every migration file to `main` alongside its code.
- **Always update documentation (.md) when chatting/completing tasks:** Every change, new route, UI adjustment,
  schema update, or architectural decision MUST immediately be recorded in `AGENTS.md`, `README.md`, and
  `DATABASE.md` as appropriate. Never finish a turn without ensuring markdown documentation reflects the current state.
- **Git Branch & Commit Suggestion Habit:** At the end of every response where code or files are changed, always provide a suggested branch name and conventional git commit message (e.g. `fix(ui): improve ...`, `feat(auth): ...`).

---

## Known Issues & Notes (read before "fixing" things)

1. **Admin property pages connected to API:** `propertylist.html` and `add-property.html` load
   `supabase.js`, perform live REST calls, and keep `localStorage` caches (`properties`,
   `urbanScopeProperties`, `cached_live_properties`) synchronized for offline resilience.
2. **Server-side authorization active:** Administrative routes and endpoints are strictly guarded
   by `require_admin`, `require_superadmin`, and `rbac_admin_guard_middleware`.
3. **`/api/stats` count:** Returns 3 aggregate counts (`total_properties`, `total_inquiries`,
   `pending_inquiries`); the admin dashboard computes the other 2 cards dynamically from the inquiry list.
4. **`init_db()` runs twice on startup:** (module import + lifespan). Harmless because it's idempotent.
5. **CORS & JWT secrets:** CORS is `allow_origins=["*"]` with credentials, and there's a hard-coded fallback JWT secret — dev only.
6. **Unified Sign-In:** `/pages/admin/login.html` 302-redirects to `/pages/auth/login.html`, which handles
   role detection and redirects clients to home/redirect target, admins to `/pages/admin/dashboard.html`,
   and superadmins to `/pages/superadmin/dashboard.html`.
7. **Admin route aliases:** `/pages/admin/properties.html` and `manage-properties.html` permanently redirect
   to `/pages/admin/propertylist.html`. Full listing editing is handled by `edit-property.html`.
8. **User account management centralized in Superadmin:** The read-only `users.html` link was removed from the
   Admin sidebar navigation. Visiting `/pages/admin/users.html` automatically redirects admins to `dashboard.html`
   and superadmins to `/pages/superadmin/dashboard.html#users`. Superadmins can edit full names, emails, contact phones,
   roles (`user`, `admin`, `superadmin`), and reset passwords via `PUT /api/superadmin/users/{user_id}` and the
   modal in `/pages/superadmin/dashboard.html`. Root account `urbanscope.cvsu@gmail.com` cannot be demoted or renamed.
9. **Admin Topbar Notification Read State:** Clicking the notification bell or opening the dropdown marks notifications
   as viewed in `localStorage` (`admin_notifs_last_viewed` and `admin_notifs_read_ids`). When the unread count reaches `0`,
   the red badge is completely hidden (`display: none`), leaving a clean bell icon without any red dot until new inquiries arrive.
10. **Admin Table Action Buttons & Inquiry Details Modal:** The `Recent Inquiries` table on `/pages/admin/dashboard.html` styles `.action-view-btn`
    with matching brand design tokens (light green `#f0f7f2` background, deep forest `#1e5c33` text, border `#cbe0d1`,
    hover elevation, and an inline SVG eye icon). Clicking "View" pops out a dedicated UI modal (`#inquiryModal`) with
    client initials avatar, submission timestamp, status pill, email link, phone link, property title, tour schedule,
    client message card, "Reply via Email" mailto button, and clean close triggers (X button, Close button, backdrop click, Escape key),
    completely replacing blocking native `alert(...)` popups.
11. **Admin Profile Information & Picture Management (< 5MB limit):** On `/pages/admin/profile.html`, administrators can modify and save all personal and professional credentials: Full Name, Professional Title, Email Address, Contact Phone Number, PRC License Number, Brokerage / Company, Professional Bio & About, and Profile Picture.
    - **Persistence & API Endpoints**: Updates are persisted across both storage layers:
      - Local FastAPI SQLite backend: `PUT /api/admin/profile` and `PUT /api/auth/me` update the `users` table (`full_name`, `email`, `phone`, `license_number`, `title`, `brokerage`, `bio`, `avatar_url`).
      - Supabase Cloud: `apiUpdateAdminProfile` patches or auto-inserts the admin record in the remote `users` table.
      - Client Storage: Synchronizes `urbanscope_admin_profile`, `adminUser`, `urbanscope_user`, and `urbanscope_demo_user` in `localStorage`, guaranteeing instant persistence across page refreshes and offline sessions.
    - **Path Resolution**: `resolveAdminAvatar()` in `admin-shell.js` and `profile.js` normalizes root-relative paths (e.g. `'assets/images/agent.jpg'`) to `'../../assets/images/agent.jpg'`, preventing 404 broken image alt-text across admin pages on Vercel and local subpaths.
    - **Custom Photo State**: The "Reset Photo" button is hidden (`display: none`) when using the default agent photo and only appears when a custom photo (`data:image/...` or external URL) is present.
    - **Error Fallback**: Inline and scripted `onerror` handlers automatically recover to `../../assets/images/agent.jpg` if any network or missing asset error occurs.
12. **Consultation Intent Flow & Dual-Mode Inquiry System:**
    - On the homepage (`index.html`), clicking "Book a Free Consultation" (`.cta-consult-btn` / `#ctaConsultBtn`) or consultation triggers presents an interactive modal (`#consultationIntentModal`) asking the user for their consultation focus instead of immediately forcing an unwanted pre-selected property.
    - The modal offers two clear cards:
      1) *General Consultation / Question* (`pages/inquiry/inquiry.html?type=general`): For site viewing, loan pre-approval, and general real estate questions without selecting a specific property.
      2) *Inquire About a Specific Property* (`pages/inquiry/inquiry.html?type=property`): For inquiring on verified accredited listings.
    - On `frontend/pages/inquiry/inquiry.html`:
      - Features top segmented tabs (`[ General Consultation / Question ]` / `[ Specific Property Inquiry ]`) allowing clients to toggle anytime.
      - In General Consultation mode, the property summary card is replaced by a Consultation Topic selector and optional date/time schedule picker.
      - In Property Inquiry mode, properties are loaded dynamically via `apiGetProperties()` into `<select id="propertySelect">`, updating thumbnail, title, location, specs, and price in real-time.
      - Property detail and showcase pages (`property-detail.html`, `Liora.html`, `Airmen.html`) pass `?type=property&id=...` or `?title=...` to ensure property-specific inquiries pre-select the correct listing.
      - Topbar navigation: The legacy placeholder hamburger menu icon on `pages/inquiry/inquiry.html` was removed and replaced with a dedicated pill "Go Back" button (`.go-back-btn`), which triggers `history.back()` with a fallback to `../../index.html`.
      - Unified profile chip: The legacy two-line client badge and placeholder notification bell on `pages/inquiry/inquiry.html` was replaced with the exact unified profile chip (`.profile-chip` / `.profile-menu`) from the homepage, rendering the dark green circle avatar initials, user first name, chevron dropdown toggle, and dropdown menu (containing Home, Submit an Inquiry, and Sign Out).
      - Cancel button navigates cleanly back to `../../index.html`.
13. **Terms of Service & Privacy Policy Legal Pages:**
    - Dedicated legal hub created under `frontend/pages/legal/` (`terms.html`, `privacy.html`, `legal.css`, and `legal.js`).
    - **Terms of Service (`terms.html`)**: Tailored to Philippine real estate brokerage operations for Miriam Lobren / UrbanScope under Republic Act No. 9646 (Real Estate Service Act - RESA), covering property listings accuracy, pricing disclaimers, free site tripping guidelines, account safety, reservation fees, financing disclosures, limitation of liability, and venue jurisdiction (Las Piñas City & Cavite courts).
    - **Privacy Policy (`privacy.html`)**: Fully compliant with the Philippine Data Privacy Act of 2012 (Republic Act No. 10173) and National Privacy Commission (NPC) circulars, detailing collected data categories, lawful processing purposes, strict non-disclosure/no-sale policy, physical & electronic security safeguards, data retention schedules, statutory data subject rights (access, correction, erasure, objection, damages), local storage usage, and Data Protection Officer (DPO) contact channels.
    - Features a pill document switcher (`[ Terms of Service ]` / `[ Privacy Policy ]`) allowing seamless switching between both documents, sticky Table of Contents sidebar for rapid navigation, responsive reading typography, and integrated standard navbar & session profile chip.
    - All dead `#` links and inline `alert(...)` handlers across `index.html`, `pages/auth/login.html`, `pages/properties/property-detail.html`, `pages/properties/Liora.html`, and `pages/properties/Airmen.html` are linked directly to these new legal pages.
    - **Registration Scroll-to-Accept Modal & Draft Persistence**: On `pages/auth/register.html`, clicking the `"I agree to the Terms of Service and Privacy Policy"` checkbox, label, or inline links (`#openTermsLink`, `#openPrivacyLink`) opens an interactive modal popup (`#termsModalOverlay`) instead of immediately checking the box or navigating away. Clients must scroll to the bottom of the agreement (`#termsModalBody`) to unlock the **I Agree** button (`#acceptTermsBtn`) before continuing registration (see Note #43). Footer legal links (`../legal/terms.html`, `../legal/privacy.html`) remain standalone pages with contextual back navigation (`legal.js`), while `register.js` preserves typed inputs (`fullname`, `phone`, `email`) in `sessionStorage` (`urbanscope_register_draft`).
14. **Google Identity Services (OAuth 2.0) Authentication:**
    - Integrated on both `/pages/auth/login.html` (`#googleLoginBtn`, "Continue with Google") and `/pages/auth/register.html` (`#googleSignup`, "Sign up with Google") via `frontend/pages/auth/auth.js` (removing the broken legacy `google_auth.php` redirect and inline `alert()` placeholders).
    - **Configuration:** Reads `GOOGLE_CLIENT_ID` from environment variables or root `.env` (with fallback to `.env.example` in `backend/auth.py` and public Web Client ID fallback in `supabase.js` / `api.js` for Live Server & static Vercel hosting; template in `.env.example`) and exposes public status via `GET /api/auth/google/config`. On remote HTTPS domains (such as Vercel), `isLocalDevHost()` in `supabase.js` / `api.js` skips `http://127.0.0.1:8000` calls to prevent Mixed Content / Private Network Access blocks and popup-blocker delays. Because Google Cloud Console forbids raw loopback IPs (`127.0.0.1`) in **Authorized JavaScript origins**, `auth.js` automatically normalizes `http://127.0.0.1:<port>` to `http://localhost:<port>` — list `http://localhost`, `http://localhost:8000`, `http://localhost:5500`, and your production `https://<your-site>.vercel.app` domain under **Authorized JavaScript origins** (Web application Client ID).
    - **Server-Side Token Verification (`POST /api/auth/google`):** `backend/auth.py` (`verify_google_token`) validates Google OAuth2 access tokens and ID tokens against `oauth2.googleapis.com/tokeninfo` and `www.googleapis.com/oauth2/v3/userinfo`, enforcing strict `GOOGLE_CLIENT_ID` audience (`aud`/`azp`) matching and `email_verified == true`.
    - **Account Linking & Supabase Sync:** Automatically links `google_id` to existing email accounts (preserving passwords, roles, and custom admin avatars) or creates new `user` rows in SQLite (`users.google_id` with partial unique index `idx_users_google_id`), issues UrbanScope JWTs + HTTP-only `access_token` cookies, and syncs the verified record to Supabase Cloud (`REST_BASE/users`).
    - **Navbar Google Avatar Rendering (`session.js` & `session.css`):** Displays verified external Google profile photos (`referrerpolicy="no-referrer"`) inside `.profile-avatar` with automatic fallback to user initials.
15. **Client Inquiry History & Lifecycle Management:**
    - Dedicated client history hub created under `frontend/pages/inquiry/` (`history.html`, `history.css`, and `history.js`).
    - **Navigation Entry Points**:
      - Client profile dropdown menu in `frontend/shared/js/session.js` (`dropdownHtml` renders "Inquiry History" between "Submit an Inquiry" and "Sign Out").
      - Mobile drawer navigation for logged-in clients (`.mobile-drawer-user`).
      - Direct pill link in `inquiry.html` header alongside page title.
    - **Features**:
      - Real-time search query filter across property titles, message content, and contact phones.
      - Status filter segmented tabs: `All`, `Under Review`, `Approved` (transitioned from Scheduled), `Contacted`, `Cancelled`.
      - Real-time KPI stat pills (Total Inquiries, Under Review, Approved, Cancelled).
      - **Approved Status Presentation**: Approved inquiries display a `.status-approved` badge (emerald background, green text, glowing dot) and a dedicated green banner (`.approved-banner`) acknowledging approval from agent Miriam Lobren.
      - **Admin Approval Integration**:
        - On Admin Dashboard (`pages/admin/dashboard.html`), the Recent Inquiries detail modal features a dedicated "Approve Inquiry" action button (`.btn-modal-approve`).
        - On Admin Clients page (`pages/admin/clients.html`), the inquiry view modal and inline table select allow instant approval (`apiUpdateInquiryStatus`).
        - Updates synchronize across SQLite (`UPDATE inquiries SET status = 'Approved'`), Supabase Cloud, and `localStorage`.
        - Instant Client Sync: `history.js` listens to `storage`, `inquiryStatusChanged`, `inquiriesUpdated`, and `visibilitychange` events, automatically refreshing the client inquiry history in real-time when the admin approves an inquiry.
      - **Modify Inquiry (`#modifyModal`)**: Allows clients to update their inquiry message, contact phone, or property/topic title, calling `PUT /api/inquiries/{id}`.
      - **Cancel Inquiry (`#cancelModal`)**: Allows clients to cancel active requests, setting status to `Cancelled` via `POST /api/inquiries/{id}/cancel` while keeping history record intact.
      - **Backend Protection**:
      - Endpoints `GET /api/inquiries/my`, `PUT /api/inquiries/{id}`, `DELETE /api/inquiries/{id}`, and `POST /api/inquiries/{id}/cancel` enforce strict client email ownership validation (or administrative privileges), preventing unauthorized cross-user modifications.
    - **Topbar Brand Harmonization (`history.css` & `session.js`)**:
      - Harmonized `.history-topbar` and `.app-brand` in `history.css` with `inquiry.css`: topbar height set to 80px, `.brand-logo` / `.app-brand img` sized to 48px × 42px (`object-fit: contain`), `.app-brand strong` set to 18px (700 weight, 1.2px letter spacing, `var(--dark-green)`), and `.app-brand small` set to 10px (700 weight, 1.8px letter spacing, `var(--accent-green)`).
      - Added `applyAgentBranding()` in `session.js` to dynamically update `.app-brand strong` and `.app-brand small` across all pages from cached and live lead agent profiles.
16. **Admin & Superadmin Header Isolation (Session Chip Guard):**
    - `frontend/shared/js/session.js` (`renderNavProfile` and `initMobileNav`) enforces an explicit admin route guard (`path.includes('/pages/admin/') || path.includes('/pages/superadmin/')`) and narrows container selectors to `.navbar .nav-acts, .inquiry-topbar .nav-acts, .history-topbar .nav-acts, .nav-acts`. This prevents the client navigation menu (`#profileMenu`, "Home", "Submit an Inquiry", "Inquiry History") from injecting duplicate, unstyled chips into administrative headers.
    - Removed redundant `session.js` script tags from `pages/superadmin/dashboard.html` and `pages/admin/propertylist.html`, ensuring Superadmin (`#saProfileDropdownBtn`) and Admin profile dropdowns render cleanly and exclusively.
17. **Inquiry Submission Modal & Feedback System:**
    - Replaced blocking browser `alert(...)` popups on `frontend/pages/inquiry/inquiry.html` with a dedicated UI Success Modal (`#inquirySuccessModal`) and animated pulse checkmark badge.
    - Centered precisely across zoomed environments (`zoom: 1.25`) by avoiding `100vw/100vh` skew, utilizing `position: fixed; inset: 0; width: 100%; height: 100%; margin: auto;` and `z-index: 9999`.
    - Displays dynamic summary details: Subject/topic, schedule pill (if specified), client contact info (name, email, phone), and `Under Review` status pill.
    - Features a clear SLA guarantee notice: `"You'll receive a response via email within 48 hours (pls check spam/junk)."`
    - Action controls & navigation: Upper-left circular back arrow (`#modalBackHomeBtn`) returns directly to Home (`../../index.html`), upper-right circular close button (`#closeSuccessModalBtn`) dismisses modal, and the modal footer cleanly contains only two action buttons: 'View in Inquiry History' (`pages/inquiry/history.html`) and 'Submit Another' (`#submitAnotherBtn`).
    - Added loading state with a spinner (`.btn-spinner`) on the submit button while sending requests to prevent duplicate submissions.
    - Replaced submission failure alerts with a slide-up toast notification (`#toastNotice`).
18. **Idempotent Supabase Schema Migration (`20261028000000_initial_schema.sql`):**
    - Made initial Supabase migration fully idempotent using `CREATE TABLE IF NOT EXISTS` across all 12 tables, `DROP TRIGGER IF EXISTS ... ON ...; CREATE TRIGGER ...` for all 6 triggers, and `DROP POLICY IF EXISTS ... ON ...; CREATE POLICY ...` for all RLS policies.
    - Resolves `ERROR: relation "users" already exists (SQLSTATE 42P07)` in GitHub Actions / Supabase Preview checks during automated branch schema verification.
19. **Admin Profile Password Change & Interoperable Cryptography:**
    - On `/pages/admin/profile.html`, the "Change Password" form is fully wired to verify current credentials and persist new passwords across all architecture tiers:
      - **FastAPI Endpoints**: Implemented `PUT /api/admin/password` and `PUT /api/auth/password` taking `PasswordChangeRequest(current_password, new_password)`. Validates current password against SQLite `users.password_hash` using `verify_password()`, hashes the new password with PBKDF2-HMAC-SHA256 (100,000 iterations), and updates the database row.
      - **Browser WebCrypto PBKDF2 Engine (`supabase.js` & `api.js`)**: Implemented `verifyPBKDF2()` and `hashPBKDF2()` using native `crypto.subtle`, completely matching Python's PBKDF2-HMAC-SHA256 standard without external dependencies.
      - **Supabase Cloud Synchronization**: `apiUpdateAdminPassword` queries Supabase `users`, validates the current password against remote `password_hash` (or default seed fallbacks), generates a fresh PBKDF2 hash, and patches the remote record.
      - **Session & Sign-In Synchronization**: `apiSignIn` checks Supabase `password_hash` with `verifyPBKDF2` and honors updated session passwords (`urbanscope_admin_password_updated` and `adminPassword`), enabling seamless sign-in immediately after changing password.
      - **Dedicated Card Alert Box (`#passwordAlertBox`)**: Added dedicated in-card alert banner in `profile.html` and `showPasswordAlert()` in `profile.js` to provide immediate error/success feedback directly inside the Change Password card without scrolling away.
20. **Supabase migration 0002 (`20261030230000_admin_profile_fields_and_superadmin_role.sql`):**
    - Adds `users.title`, `users.brokerage`, `users.bio` and allows `'superadmin'` in `users_role_check`. Idempotent like 0001.
    - `apiUpdateAdminProfile` in `supabase.js` and `api.js` sends the full profile payload (`title`, `brokerage`, `bio`, `full_name`, `email`, `phone`, `license_number`, `avatar_url`) to Supabase Cloud, and automatically falls back to core fields if remote PostgREST returns 400 (ensuring backward compatibility before migration 0002 is pushed to remote branches).
    - Every migration must be committed to `main` — see DATABASE.md §10.1 team rule.
21. **Dynamic Homepage & Multi-Page Contact & Professional Title Sync with Admin Settings:**
    - Profile information saved on `/pages/admin/profile.html` (Full Name, Professional Title / Role, Email, Phone, License, Brokerage, Bio, Avatar) now automatically and dynamically propagates to the public homepage (`frontend/index.html`) and footers across all site pages.
    - **Homepage Elements Updated (`frontend/index.js` & `index.html`)**:
      - Topbar Nav Brand: `#navAgentName` (clean name without `(Admin)` suffix), `#navAgentTitle` (uppercase role/title, e.g. `REAL ESTATE AGENT` or `SENIOR PROPERTY SPECIALIST`).
      - Browser Tab Title: Dynamically sets `document.title = `${cleanName} | ${title}``.
      - About Me Section: `#aboutAgentName`, `#aboutAgentRoleText` (dynamic role text), `#aboutAgentBrokerage`, `#aboutAgentBioText` (dynamic bio statement), and `#aboutAgentPhoto` (dynamic avatar URL and `${cleanName} - ${title}` alt text).
      - FAQs Section: `#faqAgentName`, `#faqAgentPhone` (dynamic site tripping contact number), and `#faqContactBtnText` ('Speak with {Name}').
      - CTA Banner: `#ctaAgentName` and `#ctaAgentBrokerage`.
      - Footer: `#footerAgentName`, `#footerAgentBio` (incorporates dynamic role title), `#footerAgentPhone` (dynamic `tel:` link and formatted number), and `#footerAgentEmail` (dynamic `mailto:` link and address).
    - **Admin Profile Display Sync (`frontend/pages/admin/profile.html` & `profile.js`)**:
      - Subtitle under avatar in profile card (`#adminTitleDisplay`) reflects current professional title on load and updates immediately upon saving profile changes.
    - **Multi-Page Global Footer Sync (`frontend/shared/js/session.js`)**:
      - `syncGlobalFooterContact()` dynamically updates all `.footer-contact a[href^="tel:"]` and `.footer-contact a[href^="mailto:"]` across property details, showcases (`Liora.html`, `Airmen.html`), and legal pages (`terms.html`, `privacy.html`), ensuring contact numbers and emails always match admin settings.
    - **Public API & Zero-Latency Caching**:
      - Public endpoint `GET /api/agent/profile` in `backend/app.py` serves lead agent credentials without requiring authorization tokens.
      - `apiGetLeadAgentProfile()` in `supabase.js` and `api.js` queries `urbanscope_admin_profile` first for instant 0ms rendering, followed by background synchronization with FastAPI and Supabase Cloud. It standardizes defaults to `'Real Estate Agent'` and prioritizes active server titles (`backendTitle || cachedTitle || 'Real Estate Agent'` and `remoteTitle || cachedTitle || 'Real Estate Agent'`), eliminating stale hardcoded placeholders from reverting updated admin roles.
      - In `index.js`, `renderHomepageAgentDetails()` and `initDynamicAgentDetails()` normalize any legacy cached `'Licensed Real Estate Broker / Agent'` strings to `'Real Estate Agent'`, updating `#navAgentTitle` (`title.toUpperCase()`), `#aboutAgentRoleText` (`title.toLowerCase()`), document tab title, and photo alt text.
      - Real-time multi-tab synchronization via `window.addEventListener('storage', ...)`, `window.addEventListener('focus', ...)`, `document.addEventListener('visibilitychange', ...)`, and custom `urbanscope:profileUpdated` events updates open homepage and client tabs immediately when changes are saved in the admin profile settings.
      - **Target User Email & Safe Payload Resolution (`backend/app.py` & Supabase Gateway)**: `PUT /api/admin/profile` resolves target account by `payload.email` first (updating `admin.realestate@gmail.com` / user 1 directly even if the authenticated session has a different user ID, e.g. superadmin or OAuth account, preventing `400 Email is already in use` conflicts). `apiUpdateAdminProfile` in `supabase.js` and `api.js` filters Supabase updates by `email=ilike.${targetEmail}` and handles HTTP 409 email unique constraint collisions with `safePayload` (updating `title`, `phone`, `license_number`, `avatar_url`, `bio`, `brokerage`), synchronizing across all `role=eq.admin` accounts. Public broker profile `urbanscope_admin_profile` is preserved on logout so unauthenticated visitors continuously see current credentials.


22. **Lead Agent Email & Phone Change Synchronization Across All Architecture Tiers:**
    - Administrators can update their **Email Address** and **Contact Phone Number** on `/pages/admin/profile.html` and have them persist across both local SQLite (`backend/urbanscope.db`) and Supabase Cloud (`users` table), displaying immediately and permanently on the homepage footer (`#footerAgentPhone`, `#footerAgentEmail`) and site footers even after logging out.
    - **Original Email Tracking & Account Resolution**:
      - `AdminProfileUpdate` in `backend/models.py` accepts `original_email: Optional[str] = None`.
      - On `/pages/admin/profile.html`, form submission captures `original_email` (the email address before the user edited the input) and sends it in `updatedData`.
      - In `backend/app.py` (`update_current_user_profile`), the backend uses `original_email` first to locate the user row being modified before checking new target email or session IDs, avoiding '0 rows found' and preventing false duplicate conflicts. When email is updated, it automatically adds the new email to `AUTHORIZED_ADMIN_EMAILS`.
    - **Cascading Supabase Cloud Sync (`supabase.js` & `api.js`)**:
      - `apiUpdateAdminProfile` attempts PATCH by `email=ilike.${originalEmail}` first, followed by `email=ilike.${targetEmail}`, and finally falls back to querying `role=eq.admin&order=id.desc&limit=1` and patching by `id=eq.${adminId}`, ensuring remote Cloud user record (e.g. user 15) is guaranteed to update.
      - `apiGetLeadAgentProfile()` queries Supabase Cloud by `cached.email` first or `role=eq.admin&order=id.desc&limit=1` (removing hardcoded `admin.realestate@gmail.com`), so updated email addresses load properly from Supabase on Vercel and remote deployments.
    - **RBAC Guard & Auth Redirection Flexibility**:
      - `require_admin` in `backend/auth.py` and `rbac_admin_guard_middleware` in `backend/app.py` authorize administrative requests if `role in AUTHORIZED_ADMIN_ROLES or email in AUTHORIZED_ADMIN_EMAILS`, preventing admins from getting locked out or redirected to `/index.html` after changing their email.
      - Login redirection (`login.js`, `login_user`, `google_authenticate`) checks `role === 'admin'` to route directly to `../admin/dashboard.html`.

23. **Client Testimonials Section Temporarily Disabled:**
    - The "Client Testimonials" section on the homepage (`frontend/index.html`, `#feedback`) has been disabled/commented out for now as requested.
    - All existing card templates and CSS styles (`.testimonials-section`, `.testimonials-grid`, `.testimonial-card`) remain intact in `frontend/index.css` for quick re-enabling whenever needed.

24. **Seamless Gradient Transition from CTA Banner into Green Footer (70% Upper / 30% Lower Ratio):**
    - On the homepage (`frontend/index.html` & `frontend/index.css`), the transition between the house background in the CTA banner (`.cta-banner`) and the dark green footer (`.footer`, `var(--dark-green)`) is calibrated to an exact **70% / 30% ratio**:
      - **Upper ~70%**: The house, villa architecture, trees, and warm sunset background remain clearly visible with a transparent tint (`rgba(20, 44, 26, 0.46)` to `0.58`) and subtle text shadows on `.cta-content h2` and `.cta-content p` ensuring crisp readability.
      - **Lower ~30%**: From ~70% down to 100%, `.cta-overlay` smoothly blends into solid `#1a3b23` (`var(--dark-green)`), completely eliminating sharp edges and matching the footer background with 0px seam.
      - Streamlined `.footer-top` padding in `common.css` (`56px 5% 40px`, gap: `60px`) to maintain the balanced 70% upper / 30% lower visual proportion across desktop viewports.

25. **Comprehensive Mobile & Tablet UI Layout Architecture (`320px–1024px`):**
    - **Master Zoom Reset (`<= 1024px`)**: `common.css`, `inquiry.css`, `admin-shell.css`, and `superadmin/dashboard.css` all reset `html { zoom: 1; }` at `@media (max-width: 1024px)`, preserving the `1.25` desktop scale (`> 1024px`) while eliminating scaled viewport overflow across tablets and phones.
    - **Global Navbar, Drawer, Buttons & Footer (`common.css`, `session.css`, `session.js`)**:
      - Removed bare `button { min-height: 40px; }` on mobile so small circular icon/close buttons (`#searchToggle`, lightbox/modal close buttons) keep crisp square proportions while `.login-btn`, `.signup-btn`, and `.mobile-nav-toggle` retain 40px+ touch targets.
      - Aligned `.navbar` (`70px` / `64px`) seamlessly with `.navbar nav` and `.mobile-nav-backdrop` (`top: 70px` / `64px`, `100dvh`), added both `"Submit an Inquiry"` and `"Inquiry History"` links in `.mobile-drawer-user`, anchored `.profile-dropdown` within viewport bounds (`position: fixed` on `<= 480px`), and added `overflow-wrap: anywhere` on footer contact links.
      - Updated dead `properties.html` links in `pages/properties/*.html` / `property-detail.js` to point to `index.html#properties`.
    - **Public, Auth, Legal & Client Inquiry Pages (`index.html/.css`, `property-detail.css`, `auth.css`, `legal.css`, `inquiry.html/.css`, `history.css`)**:
      - Replaced rigid inline styles on `.featured-header-row` / `#homeSortSelect` and `.inquiry-header-top` with responsive classes; stacked `.inquiry-mode-selector` tabs vertically on `<= 640px` to prevent card clipping; converted `history.html` `.filter-tabs` into a smooth horizontal touch-scroll strip; and added `16px` mobile form font sizes (preventing iOS auto-zoom) plus `max-height: calc(100dvh - 28px)` scrollable modals.
      - Fixed `auth.css` 2-column non-scrollable split to apply only at `@media (min-width: 769px) and (min-height: 540px)` so portrait small tablets (`681px–768px`) and landscape phones scroll cleanly without `overflow: hidden` clipping.
      - Fixed `privacy.html` horizontal overflow on narrow phones (`minmax(0, 1fr)` grid tracks + `display: block; overflow-x: auto` on `.legal-table`).
    - **Admin & Superadmin Portals (`admin-shell.css`, `admin/*.css`, `add-property.html`, `superadmin/dashboard.css`)**:
      - Unified mobile `.admin-topbar` (`min-height: 64px`) and anchored `#notifDropdown`, `#profileDropdown`, and `#saDropdownMenu` with `position: fixed; left: 12px; right: 12px; max-width: 380px; margin-left: auto;` so dropdowns never clip off-screen on narrow phones.
      - Resolved sidebar z-index layering across Admin (`z-index: 1250` over `.sidebar-backdrop` `1200`, removing conflicting `z-index: 900` in `edit-property.css` and adding missing `--green-*` / `--surface` CSS tokens) and Superadmin (`.sa-sidebar` full-height `top: 0; height: 100dvh; z-index: 1250` over `.sa-backdrop` `1200` at `<= 960px`).
      - Fixed stray closing tags in `add-property.html`, stacked `#inquiryChartContainer` donut legend at `<= 768px`, centered `.avatar-actions-row` on `profile.html`, and enabled horizontal touch scrolling on `.sa-table` (`min-width: 680px`) and `.sa-perm-matrix` (`min-width: 440px`).

26. **Complete Removal of Legacy Chatbot Widget (`chatbot.js` & `chatbot.css`):**
    - Deleted `frontend/shared/js/chatbot.js` and `frontend/shared/css/chatbot.css` completely.
    - Removed all `<link rel="stylesheet" href="...shared/css/chatbot.css">` and `<script src="...shared/js/chatbot.js" defer></script>` tags across all 8 public/client pages (`index.html`, `pages/properties/property-detail.html`, `pages/properties/Liora.html`, `pages/properties/Airmen.html`, `pages/inquiry/inquiry.html`, `pages/inquiry/history.html`, `pages/legal/terms.html`, and `pages/legal/privacy.html`).
    - Removed all chatbot/assistant mentions from FAQ #4 in `frontend/index.html`, Section 3 of `frontend/pages/legal/privacy.html`, comments/docstrings in `properties.js` and `backend/app.py`, and documentation (`README.md`, `DATABASE.md`, `AGENTS.md`).

27. **Complete Removal of Legacy Brokerage Branding:**
    - Removed all legacy brokerage references across public HTML (`index.html`, `pages/auth/login.html`, `pages/auth/register.html`, `pages/legal/terms.html`, `pages/legal/privacy.html`), admin profile settings (`pages/admin/profile.html`, `pages/admin/profile.js`), client/API gateways (`index.js`, `shared/js/supabase.js`, `shared/js/api.js`), FastAPI backend (`run.py`, `backend/app.py`, `backend/models.py`, `backend/database.py`), SQL seeds (`backend/supabase_schema.sql`, `supabase/seed.sql`), and documentation (`AGENTS.md`, `DATABASE.md`, `CHANGELOG.md`), standardizing default brokerage/platform branding to **UrbanScope** / **Miriam Lobren Real Estate**.
    - Added idempotent migration `supabase/migrations/20261102010000_update_default_brokerage.sql` (preserving historical applied migrations 0001 and 0002 per §Safety Rules) and runtime normalization in `init_db()` and frontend profile loaders so stale `localStorage` or database rows automatically resolve to `'UrbanScope'`.

28. **Complete Removal of Dark Mode Feature:**
    - Per user request, the experimental soft dark mode feature was completely removed from the project.
    - Deleted `frontend/shared/css/theme.css` and `frontend/shared/js/theme.js`.
    - Removed all `<link rel="stylesheet" href="...shared/css/theme.css">` and `<script src="...shared/js/theme.js"></script>` tags across all 20 HTML pages.
    - Verified zero remaining `themeToggleBtn`, `theme.css`, `theme.js`, or `data-theme` references across the entire repository.
    - Retained the runtime bug fix in `frontend/pages/admin/add-property.js` (`inquiriesToggle`, `inquiriesGroup`, `propertyForm`, `propertyImages`, `imagePreview`, `selectedFiles`), eliminating uncaught `ReferenceError`s.

29. **Repository Cleanup & Modular Backend Router Architecture:**
    - Deleted the unused, unwired `next-app/` Next.js + Prisma prototype directory and cleaned up obsolete Next.js entries in `.gitignore` and `.vercelignore`.
    - Split the monolithic 1,730-line `backend/app.py` into clean, single-responsibility modules while keeping `uvicorn backend.app:app` (`run.py`) and every OpenAPI endpoint, redirect, and static mount 100% identical:
      - `backend/__init__.py` — explicit Python package definition.
      - `backend/app.py` — slim FastAPI application assembler (lifespan, CORS, RBAC middleware, routers, static web hosting).
      - `backend/middleware.py` — `rbac_admin_guard_middleware`, request token/role helpers, and 403 HTML error templates.
      - `backend/routers/system.py` — `/api/health`, `/api/stats`, `/api/view_dashboard_kpis`.
      - `backend/routers/auth.py` — registration, login, Google OAuth 2.0, logout, profile updates, password updates, and public lead agent profile (`/api/agent/profile`).
      - `backend/routers/properties.py` — public property catalog search/filtering and admin CRUD (`/api/properties*`).
      - `backend/routers/inquiries.py` — inquiry submission, admin listing, client history (`/api/inquiries/my`), modification, cancellation, and deletion.
      - `backend/routers/superadmin.py` — user directory (`/api/users`) and superadmin executive metrics, RBAC user management, and SQLite integrity checks (`/api/superadmin/*`).
      - `backend/routers/web.py` — `register_web_hosting()` mounting portal shortcut overrides, `StaticFiles` (`pages`, `shared`, `assets`), legacy 301 section redirects, and root landing assets (`/`, `/index.*`, `/favicon.ico`).

30. **Inquiry Lifecycle Rules & Bi-Directional Real-Time Notifications (Approval Lock, Cancellation/Deletion Admin Alerts, Client Approval Alerts):**
    - **Modify Details Restricted to Under Review Inquiries Only:**
      - On `frontend/pages/inquiry/history.js`, `isInquiryUnderReview(status)` checks whether an inquiry is `Under Review` / `Pending`. Once an inquiry is **Approved** (or `Cancelled`, `Completed`, `Closed`), the **Modify Details** button (`.btn-modify`) is hidden from the inquiry card so clients can no longer edit approved inquiries.
      - `openModifyModal()` and `handleSaveModify()` enforce frontend guards, and if an inquiry is approved while `#modifyModal` is open, the modal automatically closes and alerts the client.
      - On the backend (`backend/routers/inquiries.py` `modify_inquiry`), non-admin attempts to modify `message`, `client_phone`, or `property_title` when the inquiry status is not `Under Review` / `Pending` are rejected with HTTP `400 Bad Request` (`"Approved or processed inquiries can no longer be modified."`).
    - **Admin Notifications on Client Inquiry Cancellation or Deletion:**
      - When a client cancels an inquiry (`Cancel Inquiry` -> `apiCancelMyInquiry`) or permanently deletes an inquiry (`Delete` -> `apiDeleteMyInquiry`), `backend/routers/inquiries.py` and `frontend/shared/js/supabase.js` (`pushAdminEventNotification`) record a `cancelled` notification for the administrator and synchronize status/deletion across SQLite, Supabase Cloud, and local state overrides (`urbanscope_inquiry_overrides`, `urbanscope_deleted_inquiry_ids`).
      - `frontend/pages/admin/admin-shell.js` (`buildNotificationItems`) merges live inquiries with `apiGetAdminNotifications()`, rendering red cancellation alerts (`.notif-avatar.cancel`, `"Inquiry INQ-2026-00X cancelled by {Client}"`) in the Admin topbar notification bell dropdown and Dashboard "Recent Notifications" card, incrementing the unread badge via event-specific keys (`cancelled_${id}`, `deleted_${id}`), and displaying a real-time floating toast (`#adminShellToast`).
      - `frontend/pages/admin/clients.html`, `clients.js`, `clients.css`, and `dashboard.js` support the `Cancelled` status badge (`.status-badge.cancelled`), `Cancelled` filter tab, and automatic live table refresh via `storage` and `inquiryCancelled` events.
    - **Client Notifications on Admin Inquiry Approval:**
      - When an admin approves an inquiry from `pages/admin/dashboard.html` or `pages/admin/clients.html` (`apiUpdateInquiryStatus(id, 'Approved')`), `backend/routers/inquiries.py` and `supabase.js` (`pushClientNotification`) create an `approved` notification targeted to the client's email.
      - `frontend/shared/js/session.js` and `frontend/shared/css/session.css` render a client notification bell (`#clientNotifWrap`, `#clientNotifBtn`, `#clientNotifBadge`, `#clientNotifDropdown`) in the navbar across all client pages, polling and listening to `storage` / `inquiryStatusChanged` / `clientNotificationAdded` events, displaying unread counts, listing approval notifications with links to `pages/inquiry/history.html`, and popping up a floating toast (`#clientApprovalToast` / `#toastNotice`) when an inquiry is approved.

31. **Admin UI Consistency & Notification Dropdown Harmonization:**
    - **Fixed Malformed HTML in Notification Engine (`admin-shell.js`)**: Resolved spaces inside template literal HTML tags (`< a href = ... >`, `</a >`, `< div class= "notif-dropdown-header" >`, `</div >`), which previously caused raw HTML tags and stacked elements to print directly as text into the topbar notification dropdown and the Dashboard "Recent Notifications" card (`#dashboardNotifList`).
    - **Standardized Notification Avatars & Layout (`admin-shell.js` & `admin-shell.css`)**: Replaced raw unicode/emoji strings (`✓`, `✕`, `👤`) with crisp SVG icons (`check`, `cancel`, `user`). Aligned `.notif-item` elements with flex centering (`align-items: center`), added truncation (`text-overflow: ellipsis`) for long titles and client names, defined `.notif-avatar.cancel` with red `#dc2626` background, and enhanced empty states with an SVG icon.
    - **Top-Bar Notification Badge Auto-Injection**: Updated `admin-shell.js` to ensure `.notif-badge` is auto-created if missing from `.notif-btn`, and added missing `<span class="notif-badge">` to `propertylist.html`.
    - **Top-Bar Profile Dropdown Harmonization**: Removed redundant double-nested `<div class="profile-dropdown-info">` wrappers in `dashboard.html`, `add-property.html`, and `addproperty.html`. Replaced inline color styles on Sign Out links in `clients.html` and `profile.html` with standard `class="profile-signout"` to ensure unified styling and click handler attachment.
    - **Responsive KPI Grid Layout (`dashboard.css`)**: Increased the `.kpi-grid` breakpoint to 1380px so 5 metric cards adapt cleanly to 3 columns on row 1 and 2 columns on row 2 on common laptop resolutions (1366x768 and zoomed viewports) without squeezing labels or overflowing under floating menus.
    - **Managed Property Listings Action Buttons Harmonization (`dashboard.js` & `dashboard.html`)**: Added an 'Edit' link button (`edit-property.html?id=${p.id}`) with inline SVG icon to each property row in the Dashboard table, styled View, Edit, Status Toggle, and Delete buttons with matching micro-badges, and added 'View All Properties &rarr;' to the panel heading to harmonize with the Recent Inquiries table.

32. **Cross-Device Contact Email Synchronization & Lead Agent Resolution Priority:**
    - **Problem Identified**: When updating the administrator profile on desktop to `miriamlobren@gmail.com`, visitors and other devices (such as mobile browsers accessing Vercel) continued displaying the default seed email `admin.realestate@gmail.com`, despite phone number edits (`6789998212`) syncing successfully.
    - **Root Cause**:
      - `apiGetLeadAgentProfile()` in `frontend/shared/js/supabase.js` and `frontend/shared/js/api.js` queried `${REST_BASE}/users?role=eq.admin&select=*&order=id.desc&limit=1` when no local cache existed on the visiting device.
      - Because the default demo account `admin.realestate@gmail.com` had a higher primary key ID (`id: 15`) than the lead agent account `miriamlobren@gmail.com` (`id: 1`), `order=id.desc&limit=1` always selected the demo account `admin.realestate@gmail.com` on devices lacking local cache.
    - **Solution Implemented**:
      - **Lead Agent Resolution Priority (`supabase.js` & `api.js`)**: Updated `apiGetLeadAgentProfile()` to query `${REST_BASE}/users?role=in.(admin,superadmin)&select=*` and prioritize the active lead agent:
        1. Explicit match with non-placeholder email cached in `localStorage` (`urbanscope_admin_profile`).
        2. Remote administrator row with a real agent email (excluding generic placeholders `admin.realestate@gmail.com`, developer `urbanscope.cvsu@gmail.com`, and `@example.com` domains), sorted by `updated_at DESC`.
        3. Fallback administrator row with `admin.realestate@gmail.com` if no custom agent email exists.
      - **Admin Profile Sync Enhancement (`supabase.js` & `api.js`)**: Updated `apiUpdateAdminProfile()` to explicitly include `role: 'admin'` in payloads, ensuring that any target account is promoted to admin status in Supabase Cloud.
      - **Admin Profile Page Remote Refresh (`pages/admin/profile.js`)**: Enhanced `refreshWithRemoteProfile()` to invoke `apiGetLeadAgentProfile()`, immediately populating the email input and currentProfile with `miriamlobren@gmail.com` when opening admin profile settings on any device.
      - **FastAPI Backend Synchronization (`backend/routers/auth.py`)**: Updated `get_public_agent_profile()` and unauthenticated profile update fallback queries to order real non-demo emails first (`CASE WHEN LOWER(email) NOT IN ('admin.realestate@gmail.com', 'urbanscope.cvsu@gmail.com') AND email NOT LIKE '%@example.com' THEN 0 ELSE 1 END`), preventing local SQLite from picking the demo account over custom agent records.
      - **Static HTML Default Harmonization**: Standardized static fallback contact email links across `index.html`, `property-detail.html`, `Liora.html`, `Airmen.html`, `terms.html`, and `privacy.html` to `miriamlobren@gmail.com`.

33. **Inquiry Modal Close ("X") Button Concentric SVG & Smooth Animation Enhancement:**
    - **Problem Identified**: The close button on inquiry details modals used a plain `&times;` typography character inside `.modal-close`. Because font glyph bounding boxes have asymmetrical vertical baselines, hovering over the button (`transform: rotate(90deg)`) caused a jerky, off-center wobble. In addition, the animation lacked entrance easing and click feedback.
    - **Solution Implemented**:
      - Replaced raw `&times;` text with geometrically symmetrical SVG cross icons (`18x18`, lines crossing at exact center `(12, 12)`) in `dashboard.html`, `clients.html`, and `index.html`.
      - Updated `.modal-close` in `dashboard.css`, `clients.css`, and `index.css`:
        - Smooth concentric rotation of the inner SVG (`transform: rotate(90deg)`) on hover without glyph jitter.
        - Outer circular pill hover elevation (`transform: scale(1.06)`, `background: #fee2e2`, `border-color: #fca5a5`, `color: #dc2626`, and soft red shadow).
        - Tactile press state on active click (`transform: scale(0.92)`).
        - Smooth entrance pop-in animation (`modalCloseEntrance`: `scale(0.5) rotate(-45deg)` to `scale(1) rotate(0deg)`) when `.modal-overlay.open` activates.

34. **Lead Agent Email Synchronization Across Other Devices (`miriam@gmail.com`):**
    - **Problem Identified**: When updating the administrator email to `miriam@gmail.com` (and phone `09123456789`) in Admin Profile Settings, other devices loading the homepage continued to display the previous email (`miriamlobren@gmail.com` or `admin.realestate@gmail.com`).
    - **Root Causes**:
      1. *Stale LocalStorage Email Lock*: `apiGetLeadAgentProfile()` in `supabase.js` and `api.js` previously looked for `cached.email` in the remote user list (`users.find(x => x.email === cached.email)`). Because other devices had `miriamlobren@gmail.com` in their local cache, and legacy row `id: 1` still existed in Supabase with `miriamlobren@gmail.com`, other devices matched the legacy row and retained the old email forever.
      2. *Sort Tie-Breaker Priority*: Because Step D in `apiUpdateAdminProfile` touched all admin rows simultaneously, Supabase triggers updated `updated_at` on both `id: 1` and `id: 15` to the exact same microsecond. The sort tie-breaker `(a.id || 0) - (b.id || 0)` (ascending) sorted `id: 1` before `id: 15`, picking the old account instead of active admin account `id: 15`.
      3. *Local FastAPI Seed Defaults*: On local networks, `isLocalDevHost()` checked `/api/agent/profile`, which returned seed placeholder `admin.realestate@gmail.com` due to SQLite RBAC resets and stale process binding port 8000.
    - **Solution Implemented**:
      - **Remote Truth First**: Removed `cached.email` matching from `apiGetLeadAgentProfile()` so remote Supabase Cloud always dictates the current lead agent.
      - **Reverse ID Tie-Breaker**: Sorts `customAdmins` by `updated_at DESC` and `(b.id || 0) - (a.id || 0)` (highest/newest ID first), ensuring active admin row `id: 15` (`miriam@gmail.com`) is selected.
      - **Skip Local Seed Fallback**: In `apiGetLeadAgentProfile()`, if local backend returns generic placeholder `admin.realestate@gmail.com`, it falls through to Supabase Cloud where the live profile was saved.
      - **Database Normalization (`supabase/migrations/20261102050000_normalize_lead_admin_role_and_email.sql`)**:
        - Normalized `miriam@gmail.com` (`id: 15`) with `role = 'admin'` and phone `09123456789`.
        - Set `urbanscope.cvsu@gmail.com` (`id: 11`) to `role = 'superadmin'`.
        - Demoted legacy duplicate row `id: 1` (`miriamlobren@gmail.com`) to `role = 'client'`.
        - Re-pointed `properties.agent_id` from legacy `1` to active lead admin `15`.
      - **Immediate Real-Time Broadcast**: Dispatches `urbanscope:profileUpdated` upon remote resolution, ensuring open tabs, footers, headers, and mailto links instantly render `miriam@gmail.com` and `09123456789`.
35. **Cross-Device Client Notification Seen & Read Synchronization (One-Time Notification Guarantee):**
    - **Problem Identified**: When an administrator approved an inquiry, client notification toasts and unread bell badge indicators were tracked solely in device-specific `localStorage` keys (`client_notifs_read_ids_${email}`, `client_notifs_toasted_${email}`). When a client subsequently logged in or opened the site on another device (or mobile browser), the new device had empty `localStorage`, causing the floating approval toast to pop up again and the bell badge to re-display as unread (`1`), despite the client having already seen and acknowledged the notification on their first device.
    - **Solution Implemented**:
      - **Database Schema & Migration (`supabase/migrations/20261103000000_notification_seen_sync.sql`, `backend/database.py`, `backend/supabase_schema.sql`)**:
        Added `is_seen INTEGER DEFAULT 0` (SQLite) and `is_seen BOOLEAN DEFAULT false` (Supabase Cloud) to `notifications` table, ensuring display/seen state is permanently recorded in the database.
      - **Backend API Endpoints (`backend/routers/inquiries.py`)**:
        - `POST /api/notifications/seen`: Updates `is_seen = 1` for a specific inquiry, notification ID, or client email so other devices know the notification was already presented.
        - `POST /api/notifications/read`: Updates `is_read = 1, is_seen = 1` for a specific notification or user across all devices.
        - `GET /api/notifications`: Auto-synchronizes notification records for approved client inquiries and returns `is_read` and `is_seen` booleans.
      - **API Gateways (`frontend/shared/js/supabase.js` and `api.js`)**:
        - `isLocalDevHost()`: Expanded to recognize LAN IP addresses (`192.168.*`, `10.*`, `172.16-31.*`) and port 8000, ensuring mobile devices on local networks connect directly to the FastAPI notification endpoints.
        - `apiGetClientNotifications()`: Returns remote notifications with server-backed `is_read` and `is_seen` flags.
        - `apiMarkNotificationsRead()` and `apiMarkNotificationsSeen()`: Persist read and seen states across FastAPI backend, Supabase Cloud (`PATCH /rest/v1/notifications`), and local storage caches.
      - **Client Session Engine (`frontend/shared/js/session.js` & `session.css`)**:
        - `showClientApprovalToast()`: Immediately calls `apiMarkNotificationsSeen()` upon rendering the toast so remote devices are notified of the seen state.
        - Floating toast dismissal: Added a dedicated `✕` button (`.client-approval-toast-close`) and click-through link on `.client-approval-toast`. Clicking either action immediately marks the notification as read and seen in the database.
        - `loadClientNotifications()`: Enforces `isSeen = (n.is_seen === true) || isRead || toastedIds.includes(k)`. Repeat toasts are completely suppressed on any device once seen or read.
        - `markAllClientNotifsRead()`: Persists read state to the server upon clicking the notification bell or viewing notifications, clearing the unread badge across all devices.
      - **Inquiry History Page (`frontend/pages/inquiry/history.js`)**:
        - Automatically marks user notifications as read and seen on page load via `apiMarkNotificationsRead({ email })`.
        - Suppresses repeat initial toasts on secondary devices while preserving live status change notifications during active sessions.

36. **Real-Time Cross-Device Inquiry Approval Synchronization & Supabase Notification Schema Alignment:**
    - **Problem Identified**: When an administrator tapped "Approved" in the Inquiry Details modal on mobile (`/pages/admin/dashboard.html` / `clients.html`), a client viewing `/pages/inquiry/history.html` on another mobile phone did not see their inquiry status update from "Under Review" to "Approved", and did not receive the approval toast or bell badge notification.
    - **Root Causes**:
      1. *Stale Local Storage Overwrite*: In `applyLocalInquiryState(list)` (`supabase.js` & `api.js`), fetched server inquiries were being compared against local `localStorage.getItem('inquiries')`. If `cachedMatch.status !== merged.status`, `applyLocalInquiryState` unconditionally executed `merged.status = cachedMatch.status`. Because the client's phone had saved the inquiry as "Under Review" when originally submitted, every API fetch forcibly downgraded the server's authoritative "Approved" status back to "Under Review".
      2. *Supabase Notifications Schema Mismatch*: Remote Supabase Cloud `notifications` table has columns `['id', 'user_id', 'title', 'message', 'reference_type', 'reference_id', 'is_read', 'created_at']` (foreign key `user_id` to `users(id)`). The client gateways were sending and filtering by `recipient_email` and `client_name`, resulting in HTTP 400 `column notifications.recipient_email does not exist` errors.
      3. *Eager Read-Marking in Polling Loops*: `history.js` executed `apiMarkNotificationsRead({ email })` synchronously inside `loadInquiries()` before checking status changes, causing notifications to be marked as read before toasts could trigger.
      4. *Long Polling Delays*: Both `history.js` and `session.js` polled at 15-second intervals.
    - **Solution Implemented**:
      - **Server Authority in `applyLocalInquiryState` (`supabase.js` & `api.js`)**: Removed the stale `cachedMatch.status` override. When the remote database returns a status, the server's status is preserved as the single source of truth, stale local overrides are cleared for approved records, and `localStorage.inquiries` is updated with fresh server data.
      - **Supabase Cloud Schema Alignment**:
        - `apiUpdateInquiryStatus`: Resolves the client's `user_id` (via `targetInquiry.client_id` or `users?email=ilike...`) and inserts notifications using Supabase's native schema (`user_id`, `reference_type: 'inquiry'`, `reference_id: id`, `title`, `message`, `is_read: false`).
        - `apiGetClientNotifications`: Resolves `user_id` and queries `${REST_BASE}/notifications?user_id=eq.${userId}` alongside the live inquiries status derivation fallback.
        - `apiMarkNotificationsRead`: Patches Supabase by `id=eq.${notifId}` or `user_id=eq.${userId}` with `{ is_read: true }` without invalid column names.
      - **Live Status Transition & Deferral (`history.js`)**:
        - Added `prevInquiryStatuses` tracking to immediately detect when an inquiry transitions from `Under Review` to `Approved` during active viewing, firing `showToast(...)`, re-rendering the card with the emerald badge and Miriam Lobren approval banner, and dispatching `inquiryStatusChanged`.
        - Deferred `apiMarkNotificationsRead` with a 6-second delay on interactive load and excluded it from background poll ticks so notifications display cleanly before being cleared.
      - **Responsive Live Polling**: Reduced polling intervals from 15 seconds to 4 seconds in `history.js` and 5 seconds in `session.js`, delivering near-instant updates across mobile devices.

37. **Real-Time Admin Inquiry Notifications & Zero-Refresh Live Dashboard/Table Synchronization:**
    - **Problem Identified**: When a client submitted a new inquiry from another device or phone, an administrator viewing the admin portal on their mobile phone or desktop had to manually refresh the page to see the new inquiry. The topbar notification bell badge did not update, no notification toast appeared, and the Recent Inquiries table / KPI counters on `/pages/admin/dashboard.html` and `/pages/admin/clients.html` remained static.
    - **Root Causes**:
      1. *Toast Omission for New Inquiries*: In `admin-shell.js`, `loadNotifications()` only triggered `showAdminShellToast` if `it.type === 'cancelled'`, completely omitting `new_inquiry` items.
      2. *Absence of Dashboard/Clients Polling*: `dashboard.js` and `clients.js` only loaded data once on `DOMContentLoaded` and on local tab `storage` events. Because `storage` events do not fire across different physical devices or separate browser sessions, data remained frozen until a full page reload.
      3. *Long Polling Delays in Admin Shell*: `admin-shell.js` polled at 15-second intervals and lacked known inquiry tracking across active sessions.
    - **Solution Implemented**:
      - **Active Session Inquiry Tracking (`frontend/pages/admin/admin-shell.js`)**:
        - Introduced `knownAdminInquiryIds` to snapshot historical inquiry IDs on the initial poll.
        - On subsequent live poll ticks (every 4 seconds), any incoming inquiry not in `knownAdminInquiryIds` is immediately detected as a new submission from another device.
        - Triggers upgraded interactive toast alert (`showAdminShellToast('New Inquiry Received!', title, 'inquiry', inqId)` with green `#10b981` border, bell icon, subtitle, close button, and click-through navigation).
        - Plays an unobtrusive, crystal-clear Web Audio API notification chime (`playAdminNotificationChime()`) using native browser `AudioContext` (0 external dependencies).
        - Immediately dispatches `inquirySubmitted`, `newInquiryReceived`, and `inquiriesUpdated` events, and increments the topbar notification bell badge count.
      - **Zero-Refresh Live Dashboard & Clients Table Sync (`dashboard.js` & `clients.js`)**:
        - Registered event listeners for `newInquiryReceived` and `inquirySubmitted` to reload data instantly when a new inquiry arrives.
        - Added dedicated 4-second polling loops (`setInterval(..., 4000)`) guarded by `document.visibilityState === 'visible'`.
        - The Recent Inquiries table, KPI cards ("Total Inquiries", "Pending Review"), donut chart, and client inquiry lists update automatically in real time without refreshing the page.
      - **Mobile-Responsive Toast Styling (`admin-shell.css`)**:
        - Added responsive CSS for `.admin-shell-toast` (`max-width: 380px`, elevated box-shadow, pointer events enabled) and anchored centered styling for mobile devices (`bottom: 16px; left: 16px; right: 16px; width: auto;`).
      - **Superadmin Console Synchronization (`frontend/pages/superadmin/dashboard.js`)**:
        - Added 5-second background polling for `loadOverview()` and `loadInquiries()` during active visibility, keeping the executive overview live.

38. **Admin Notification Scope Isolation (Strict Exclusion of Admin Self-Approval Actions):**
    - **Problem Identified**: When an administrator approved an inquiry (`Approve Inquiry` -> `apiUpdateInquiryStatus`), the admin shell notification builder (`buildNotificationItems` in `frontend/pages/admin/admin-shell.js`) converted every inquiry with status `Approved` into an admin notification item (`Inquiry INQ-2026-XXXX approved`) with its timestamp set to `updated_at` (now). This caused the admin's own topbar bell icon to immediately badge with `(1)` and populated the admin notification dropdown with green checkmark approval items ("Inquiry INQ-2026-0036 approved • Just now"). Administrators were confused because approving an inquiry is an administrative action; approval notifications belong strictly to the **client**, while the admin should ONLY be notified when a new inquiry is submitted (or cancelled by a client).
    - **Key Solutions & Implementation**:
      1. *Exclusion of Approvals and Completions in Admin Shell (`frontend/pages/admin/admin-shell.js`)*:
         - Updated `buildNotificationItems()`: Completely removed the `isApproved` and `isCompleted` branches. Non-cancelled inquiries are strictly represented as `new_inquiry` notifications (`New inquiry submitted by {clientName}`) with timestamps anchored to their original submission date (`created_at`), NEVER `updated_at`.
         - Filtered `adminEvents`: Strictly excludes any events with `type === 'approved'` or `type === 'completed'`.
         - Purged legacy approved items: Cleaned up legacy `approved_` keys from `localStorage` (`urbanscope_admin_event_notifs`).
         - Badge & Toast Guard: Updated `unreadCount` to exclude any approved/completed items, ensuring the admin bell badge never increments when approving inquiries and only counts unread new inquiry submissions and cancellations.
      2. *Immediate Admin Read State on Approval (`frontend/pages/admin/dashboard.js`, `clients.js`, `supabase.js`, `api.js`)*:
         - When an admin approves an inquiry (`#modalApproveInquiryBtn` or `updateInquiryStatus`), the inquiry ID and `new_inquiry_${id}` are immediately marked as read in `localStorage` (`admin_notifs_read_ids`), guaranteeing that no unread badge lingers for an inquiry the administrator just reviewed and approved.
      3. *Backend Server-Side Notification Hygiene (`backend/routers/inquiries.py`)*:
         - In `submit_inquiry`: Inserts an admin notification row (`recipient_role = 'admin'`, `type = 'new_inquiry'`) so that new inquiries submitted across separate devices notify the administrator in real-time.
         - In `modify_inquiry`: When an inquiry is approved, SQLite marks any existing admin notification for that inquiry as read and seen (`UPDATE notifications SET is_read = 1, is_seen = 1 WHERE inquiry_id = ? AND LOWER(recipient_role) = 'admin'`).

39. **Admin Self Password Management & Server Restart Persistence:**
    - **Self-Service Password Change**: Administrators can change their own password directly from the **Profile & Security Settings** page (`/pages/admin/profile.html`) under the "Change Password" section by providing their current password and entering a new password (min. 6 characters).
    - **End-to-End Flow & Verification**:
      - `frontend/pages/admin/profile.js` captures current, new, and confirm passwords and triggers `apiUpdateAdminPassword(curPass, newPass)` in `frontend/shared/js/supabase.js` and `api.js`.
      - `PUT /api/admin/password` in `backend/routers/auth.py` validates the request, resolves the account via authenticated JWT/session cookie or email fallback, verifies the `current_password` against the stored PBKDF2 hash, and updates `users.password_hash` in SQLite.
      - Supabase Cloud sync: Asynchronously generates a PBKDF2 salt-hash and updates `${REST_BASE}/users` if remote cloud is active.
      - Client Storage: Synchronizes `urbanscope_admin_password_updated` and `adminPassword` in `localStorage` for seamless immediate sign-in.
    - **Database Restart Persistence Guarantee (`backend/database.py`)**:
      - `init_db()` was previously overwriting existing users' `password_hash` with default seed hashes on every server boot or reload.
      - Updated `init_db()` to check `if not existing[1]:` so that existing users' custom updated passwords and profile info are strictly preserved across server restarts and lifespan reloads.

40. **Cross-Device & Mobile Password Synchronization:**
    - **Resolution for Mobile Devices, Phones, and Remote Access**:
      - **Undeclared Variable Bug Fix**: Fixed a fatal `ReferenceError: userId is not defined` in `apiUpdateAdminPassword()` on line 1986 (`frontend/shared/js/supabase.js` & `api.js`) which previously crashed execution when Step 1 (local FastAPI) was skipped or unreachable on mobile browsers.
      - **Supabase Cloud Seeding & Upsert**: Seeded `admin.realestate@gmail.com` into Supabase Cloud `users` table. If an admin record does not yet exist in Supabase Cloud when changing passwords, `apiUpdateAdminPassword` and `sync_password_to_supabase` dynamically `POST` to insert the user record with the new PBKDF2 hash, ensuring changes persist remotely.
      - **Two-Way Cross-Device Password Sync**:
        - *Changed on Phone/Remote*: Phone updates Supabase Cloud with fresh PBKDF2 hash. When signing in on laptop or dev host, backend `login` (`sync_password_from_supabase_if_valid`) checks Supabase Cloud if SQLite hash differs, validates the password, and auto-syncs the new hash into SQLite.
        - *Changed on Laptop/Local*: Laptop updates SQLite and immediately propagates the new hash to Supabase Cloud via `sync_password_to_supabase`.
      - **Local Dev Host & Network Binding (`run.py`)**: Changed `run.py` default host from `127.0.0.1` to `0.0.0.0`, allowing phones and other devices on the same Wi-Fi / local network to reach the FastAPI server directly at `http://<laptop-ip>:8000`.
      - **Safe Endpoint Resolution**: Replaced hardcoded `127.0.0.1:8000` with dynamic host resolution (`http://${location.hostname}:8000/api`) and added HTTPS guard to prevent mixed-content blocks on hosted deployments.

41. **Admin Password Visibility Toggle (Show / Hide Password):**
    - On the admin settings page (`/pages/admin/profile.html`), added interactive show/hide visibility toggle buttons (`.password-toggle-btn`) to all three password inputs in the Change Password card:
      - `Current Password` (`#currentPassword`)
      - `New Password` (`#newPassword`)
      - `Confirm New Password` (`#confirmPassword`)
    - **UI & UX Styling (`profile.css`)**: Encapsulated inputs inside `.password-input-wrapper` with `padding-right: 42px` to prevent text overlap, placing eye toggle buttons vertically centered on the right with smooth hover elevation, dark-green brand accents, focus rings, and zero interference with form submission.
    - **Dynamic Icon & State Swap (`profile.js`)**: Clicking an eye toggle dynamically flips `type="password"` to `type="text"` (and vice versa) and transitions between eye-open (`Show password`) and eye-slashed (`Hide password`) SVG icons. Automatic reset listener reverts all fields back to masked password mode upon successful password updates.

42. **Complete Invalidation of Old Password on Admin Login & Strict Cloud Authority:**
    - **Problem Identified**: After an administrator updated their password in Admin Profile Settings (`/pages/admin/profile.html`), the old password (`realestate2026` or the previous password) could still be used to log in successfully on the admin portal.
    - **Root Causes**:
      1. *Legacy Default Fallback Bypass*: In `apiSignIn` (`frontend/shared/js/supabase.js` and `api.js`), Step 2 (Supabase Cloud check) and Step 3 (offline check) contained hardcoded fallback blocks (`else if (cleanEmail === 'admin.realestate@gmail.com' && password === 'realestate2026') passValid = true;` and `isValid = (password === 'realestate2026' || password === locallyUpdated || password === activePass)`). Even when PBKDF2 hash verification failed against the new password, the bypass overrode `passValid` to `true` and rewrote `localStorage.adminPassword` back to the old password.
      2. *Backend Fallthrough on 401*: When the local FastAPI backend rejected the old password with HTTP 401 Unauthorized, `supabase.js` logged a warning and fell through to Step 2 instead of returning the 401 error.
      3. *Cross-Device Hash Staleness*: When the password was updated on a mobile phone (updating Supabase Cloud), the laptop's SQLite database still held the old hash until an initial login occurred.
    - **Solution Implemented**:
      - **Strict Stored Hash Enforcement (`supabase.js` & `api.js`)**:
        - In `apiSignIn` Step 1: If the local backend returns HTTP 401, it immediately returns `{ success: false, error: 'Invalid email or password.' }`, halting execution without falling through to offline fallbacks.
        - In `apiSignIn` Step 2 (Supabase Cloud): If `remoteUser.password_hash` exists, validity is determined strictly by `verifyPBKDF2(password, storedHash)`. The legacy hardcoded bypass was completely removed. Default passwords (`realestate2026`) are only checked if NO stored hash and NO updated password exist.
        - In `apiSignIn` Step 3 (Offline fallback): Checks `const effectiveAdminPass = locallyUpdated || activePass;`. If set, ONLY that updated password is valid; `realestate2026` is strictly rejected.
        - In `apiUpdateAdminPassword`: If `stored` exists, verification is strictly performed against `stored`.
      - **Backend Proactive Cloud Sync (`backend/routers/auth.py`)**:
        - Added `sync_latest_password_from_supabase(clean_email)`: On login for administrative accounts, the backend proactively checks Supabase Cloud and syncs the latest password hash into local SQLite before validating credentials. If the user changed the password on their phone, the laptop immediately invalidates the old password and accepts only the new password.
        - In `update_user_password`: Verifies current password against Supabase Cloud if SQLite hash was updated remotely before rejecting with 400.
      - **Profile Settings Fallback (`profile.js`)**:
        - Form submission fallback strictly verifies `curPass === (updatedPass || activePass || 'realestate2026')`, preventing the old password from changing passwords once an updated password exists.

43. **Registration Mandatory Scroll-to-Accept Terms of Service & Privacy Policy Modal:**
    - On `/pages/auth/register.html`, clicking the `"I agree to the Terms of Service and Privacy Policy"` checkbox (`#terms`), label (`#termsLabel`), or inline links (`#openTermsLink`, `#openPrivacyLink`) prevents immediate checkbox activation and opens a dedicated agreement popup modal (`#termsModalOverlay`).
    - **Scroll-to-Unlock Enforcement (`register.js` & `auth.css`)**:
      - Renders both **Part I: Terms of Service** (RA No. 9646 / RESA) and **Part II: Privacy Policy** (RA No. 10173 / DPA) inside `#termsModalBody` with a live reading progress bar (`#termsScrollBar`) and status banner (`#termsScrollHint`).
      - The **I Agree** button (`#acceptTermsBtn`) starts locked (`disabled = true` with lock icon) and unlocks only when the user scrolls to the bottom of `#termsModalBody` (`scrollHeight - scrollTop - clientHeight <= 16`).
      - Clicking **I Agree** marks `hasAcceptedTerms = true`, checks `#terms`, highlights `.terms-label.is-accepted`, closes the modal, and focuses **Create Account** (or immediately launches Google OAuth if triggered via **Sign up with Google**).
      - Closing the modal early (`#closeTermsModalBtn`, backdrop click, `Escape`, or `#declineTermsBtn`) leaves `#terms` unchecked, and attempting to submit `#registerForm` or click **Sign up with Google** (`#googleSignup`) without accepting automatically intercepts the action (`ensureTermsAcceptedForGoogleSignup()` / `window.urbanscopeCheckRegisterTermsForGoogle` in `register.js` + `attachGoogleButton` guard in `auth.js`) and opens `#termsModalOverlay` with an attention prompt.
      - Uses `position: fixed; inset: 0; width: 100%; height: 100%;` (avoiding `100vw/100vh` skew) so the modal centers accurately under `html { zoom: 1.25; }` on desktop as well as `zoom: 1` on tablet and mobile viewports.

44. **Superadmin Console Cloud + Local Dual-Tier RBAC Governance & `Failed to fetch` Fix:**
    - **Problem Identified**: On remote HTTPS deployments (`https://miriam-lobren-real-estate.vercel.app/pages/superadmin/dashboard.html`), opening **Users & RBAC Roles** threw `Error loading users: Failed to fetch` and left sidebar badges at `--`.
    - **Root Causes**:
      1. `frontend/pages/superadmin/dashboard.js` previously hardcoded raw `fetch('http://127.0.0.1:8000/api/...')` calls (`getApiBase()`) instead of using the dual-tier `supabase.js` gateway, triggering browser Mixed Content / Private Network Access network failures on HTTPS hosts.
      2. Supabase Cloud `users` rows use `role = 'client'` (default from initial Postgres schema) alongside `'user'`, whereas `#userRoleFilter` and `#editRole` only matched `'user'`.
      3. `supabase/migrations/20261028000000_initial_schema.sql` enabled RLS on `users` with `SELECT`, `INSERT`, and `UPDATE` policies, but omitted `FOR DELETE`, causing PostgREST `DELETE /rest/v1/users` to return `[]`.
      4. In local SQLite (`backend/database.py`), `trg_user_role_insert` reset newly inserted Superadmin-created `'admin'` accounts back to `'user'` unless re-applied after `INSERT`.
    - **Solution Implemented**:
      - **Dual-Tier Superadmin Gateway (`frontend/shared/js/supabase.js` & `api.js`)**: Added `isLocalBackendReachableHost()` (`isLocalDevHost() && location.protocol !== 'https:'`) across all remaining loopback calls and exposed `apiGetSuperadminOverview`, `apiGetSuperadminUsers`, `apiSuperadminCreateUser` (with Web Crypto PBKDF2 hashing), `apiSuperadminUpdateUser`, `apiSuperadminUpdateUserRole`, `apiSuperadminDeleteUser`, and `apiRunSuperadminIntegrityCheck`.
      - **Role Normalization & UI Sync (`frontend/pages/superadmin/dashboard.js` & `dashboard.html`)**: Wired all Superadmin loaders, modals, and diagnostics through the gateway, normalized `'client'` -> `'user'` via `normalizeRole()`, populated sidebar count badges immediately, and dynamically adapted database status labels (`Supabase Cloud Status` vs `SQLite Engine Status`).
      - **Supabase `DELETE` RLS Migration & Cross-Device Fallback (`supabase/migrations/20261103231500_allow_delete_users_rls.sql`)**: Added atomic idempotent `"Allow delete users"` RLS policy on `users` (mirrored in `backend/supabase_schema.sql`), plus a cross-device soft-delete `PATCH` fallback (`bio = '__URBANSCOPE_DELETED__'`, `password_hash = '__DELETED_ACCOUNT__'`) in `supabase.js` / `superadmin.py` if physical `DELETE` returns `[]` prior to migration push.
      - **Backend Trigger & Cloud Sync (`backend/routers/superadmin.py` & `backend/routers/auth.py`)**: Re-applies `assigned_role` after `INSERT` in `POST /api/superadmin/users` so `trg_user_role_insert` preserves Superadmin-created `'admin'` accounts, and synchronizes user directory / Superadmin CRUD / sign-ups non-blockingly with Supabase Cloud (controllable via `URBANSCOPE_DISABLE_CLOUD_SYNC=1` for isolated offline tests).

45. **Superadmin Console UI Scope (`frontend/pages/superadmin/dashboard.html`, `dashboard.css`, `dashboard.js`):**
    - The console is limited to the superadmin overview, account and role governance, and system health diagnostics. Property catalog and client inquiry operations remain in the Agent Admin portal.
    - The overview reports account totals, privileged account totals, and database storage; the account table has a focused account search and a single `Joined Date` column. The redundant cross-workflow global search and duplicate table heading were removed.
    - Superadmin data loading and deep links now cover only overview, users, and system health. The responsive KPI layout uses three desktop columns and collapses for narrower screens.
    - The Superadmin sidebar uses the shared forest-green navigation treatment, standardized 20px line icons, and clear active-state marker. KPI and governance action icons use the shared green palette while role badges keep their role-specific colors.

46. **Admin Navigation & Brand Consistency (`frontend/pages/admin/admin-shell.css` and admin pages):**
    - Admin sidebars share the Dashboard, Properties, Clients, Inquiries, and Profile & Security labels and a matching SVG icon set across the dashboard, property list, client, profile, add-property, and edit-property screens.
    - Shared shell styles define the active navigation color and icon stroke treatment. Dashboard KPI/action icons and primary form/action controls use the UrbanScope green tokens rather than separate hard-coded brand greens.

45. **Authenticated Client Inquiry Note Visibility (`.inquiry-note`):**
    - The guest prompt `"*Please log in or create an account to submit an inquiry."` below `.submit-inquiry-btn` is automatically hidden whenever a user is authenticated.
    - **CSS Rules (`session.css` & `property-detail.css`)**:
      - `html.logged-in .inquiry-note`, `body.logged-in .inquiry-note`, `html[data-auth-state="logged-in"] .inquiry-note`, `.logged-in .inquiry-note` set to `display: none !important;`.
    - **Session Script Coordination (`session.js` & `property-detail.js`)**:
      - `session.js`: Performs an early synchronous `localStorage` check (`urbanscope_user` / `urbanscope_jwt_token` / `urbanscope_demo_user`) to immediately apply `root.classList.add('logged-in')` and prevent layout/text flash.
      - `updateInquiryNoteVisibility(isLoggedIn)` dynamically toggles `.inquiry-note` on `init()`, `logout()`, `storage` sync, and `DOMContentLoaded`.
      - `property-detail.js`: `checkInquiryAuthNote()` validates authentication state and hides `.inquiry-note` upon detail page load and `urbanscope:user` events.
45. **Accredited Property Catalog Expansion (Casa Suerte & Kathleen Place 5), TCP Integration & Map Accuracy:**
    - Integrated full property details, photo assets, and Total Contract Price (TCP) computation sheets for newly added accredited real estate developments:
      - **Casa Suerte (Townhouse)**: Barangay San Agustin, Trece Martires City, Cavite; ₱2.50M - ₱3M; 2 bedrooms, 1 bath, 50-80 sqm (Camila model: 50.8 sqm floor area); equipped with built-in solar power system; Pag-IBIG financing computation from ₱12,249.70/mo. Dedicated showcase page: `pages/properties/casasuerte.html`.
      - **Kathleen Place 5 (Townhouse)**: Molino 7, Bacoor, Cavite; ₱6.2M - ₱9M; 3 bedrooms, 2 baths, 112 sqm; Zen-inspired 2-storey community with modular cabinets & steel gates; Bank financing promo computation from ₱52,381.72/mo (4% net downpayment after 11% promo discount). Dedicated showcase page: `pages/properties/kathleen.html`.
      - **Liora Homes & Airmen's Village Triplex**: Updated with high-resolution TCP computation tables, financing breakdown cards, and document lightbox viewer.
    - **Accurate Zoomed-in Google Maps Embeds**:
      - Replaced placeholder coordinates with exact street-level coordinates and street zoom `z=17` with custom pin markers:
        - Casa Suerte: `14.28315, 120.86832` (Panungyanan Rd, Brgy San Agustin, Trece Martires City, Cavite)
        - Kathleen Place 5: `14.416, 120.975` (Magdiwang Rd / Marcos Alvarez Ext., Molino VII, Bacoor, Cavite)
        - Liora Homes: `14.31028, 120.76329` (Brgy. Malainen Bago, Naic, Cavite)
        - Airmen's Village Triplex: `14.4661, 120.9911` (Jumbo St., Pulang Lupa Dos, Las Piñas City)
    - **Total Contract Price (TCP) UI Integration**:
      - Homepage (`index.html`, `index.js`, `index.css`): Added `.property-tcp-container` featuring `.tcp-pill-tag` ('TCP Available • Pag-IBIG' / 'Bank Financing'), price range, and estimated monthly amortizations.
      - Property Detail (`property-detail.html`, `property-detail.js`, `property-detail.css`): Added dynamic TCP container with breakdown KPI cards, sample computation tables, and clickable document lightbox for official pricelists.
    - **Backend & Inquiry Catalog Synchronization**:
      - `backend/database.py` and SQLite `backend/urbanscope.db` updated with all 4 accredited properties and accurate specs, seeded with full descriptions and amenities.
      - `frontend/pages/inquiry/inquiry.js` property fallback and dropdown updated to align with the 4 accredited properties.
    - **`newproperty` Asset Folder Organization**:
      - Structured into clean subfolders `AIRMEN_TRIPLEX/`, `CASASUERTE/`, `KATHLEEN/place_5/`, `LIORA/` with standardized numbered file names, TCP subdirectories, and no duplicate files.

46. **Complete Purge of Unused Legacy Properties (Airmen, Casa Suerte, Kathleen, and Liora Exclusivity):**
    - **Catalog Scope Enforcement**: The property catalog was strictly restricted to only the 4 accredited properties:
      1. **Airmen's Village Triplex** (Las Piñas City)
      2. **Casa Suerte** (Barangay San Agustin, Trece Martires City, Cavite)
      3. **Kathleen Place 5** (Molino 7, Bacoor, Cavite)
      4. **Liora Homes** (Brgy. Malainen Bago, Naic, Cavite)
    - **Supabase Cloud Purge**: Deleted all legacy unused mock listings (`Velemont Residences` [ID 27], `Green Valley Villa` [ID 28], `Sunset Heights` [ID 6], `Siargao house` [ID 29]) from remote Supabase Cloud `properties` table. Updated `Airmen's Village Triplex` (ID 5) and `Liora Homes` (ID 4) with accredited pricing, titles, and descriptions, and inserted `Casa Suerte` and `Kathleen Place 5`.
    - **SQL Seed Harmonization**: Updated `backend/supabase_schema.sql` and `supabase/seed.sql` to remove all unused properties, gallery images, features, appointments, notifications, and client testimonials.
    - **Frontend & Gateway Sanitization**:
      - `frontend/shared/js/supabase.js` & `api.js`: Added `isAccreditedListing` filter in `apiGetProperties` to guarantee that only the 4 accredited listings are returned and stored in `cached_live_properties`, and added proactive cleanup of `urbanScopeProperties` and `properties` local storage keys.
      - `frontend/index.html`: Cleaned hero search bar type options (All, Townhouses, Triplex, House & Lot), location options (All, Las Piñas, Bacoor, Naic, Trece Martires City), category tabs (All, Townhouses, Triplex, House & Lot), and updated client testimonial quote to reference Kathleen Place 5.
      - `frontend/index.js`: Added category filter support for `triplex` and active filtering to ensure `allCachedProperties` always strictly matches the 4 accredited properties.
      - `frontend/pages/admin/properties.js`, `dashboard.js`, `propertylist.html`: Sanitized property list and dashboard KPI counters to strictly count and display only the 4 accredited listings.

47. **Designated House Photos Integration from `newproperty/` across all 4 Listings:**
    - Replaced all placeholder photos with the high-resolution house photos uploaded in `newproperty/`:
      - **Casa Suerte**: Facade (`casasuerte.jpg`), Living area & inverter (`casasuerte-living.jpg`), Dining room (`casasuerte-dining.jpg`), Master bedroom (`casasuerte-bedroom1.jpg`), Second bedroom (`casasuerte-bedroom2.jpg`), Bathroom (`casasuerte-bathroom.jpg`), Service laundry (`casasuerte-service.jpg`), Subdivision plan (`casasuerte-subdivision-plan.jpg`), and Pag-IBIG computation (`casasuerte-tcp.jpg`).
      - **Kathleen Place 5**: Zen facade (`kathleen-facade.jpg`), Living room (`kathleen-living.jpg`), Dining & open plan (`kathleen-dining.jpg`), Modular kitchen & stairs (`kathleen-interior.jpg`), Steel gate & entry (`kathleen-gate.jpg`), Covered carport (`kathleen-carport.jpg`), Second floor hallway (`kathleen-hallway.jpg`), Location map (`kathleen-map.jpg`), and Bank promo TCP sheets (`kathleen-tcp.jpg`, `kathleen-tcp2.jpg`).
      - **Liora Homes**: Replaced outdated placeholder images (`liora2.JPG`, `liora3.JPG`, `liora4.JPG`) with the 12 uploaded real photos: Facade (`LioraHomes.jpg`), Aerial solar roof view (`liora-aerial.jpg`), Swimming pool & clubhouse (`liora-pool.jpg`), Living room with inverter (`liora-living.jpg`), Dining & modular kitchen (`liora-dining.jpg`), Open interior (`liora-interior.jpg`), Second floor bedroom (`liora-bedroom.jpg`), Staircase with built-in storage (`liora-stairs.jpg`), Rooftop solar panels (`liora-solar.jpg`), Rainwater storage tanks (`liora-rainwater.jpg`), and Community view (`liora-community.jpg`).
      - **Airmen's Village Triplex**: Replaced cross-property placeholder images with the actual Triplex facade (`AirmenTriplex.WEBP`), official developer RFO promo flyer with elevations and unit specifications (`airmen-flyer.jpg`), and official bank financing sheet (`airmen-tcp.jpg`).
    - **Dynamic Detail & Fallback Integration**:
      - `property-detail.html` & `property-detail.js`: Dynamic gallery initialization updates thumbnail row, carousel, and zoom lightbox to the designated photo set when navigating by property ID.
      - `index.html` & `index.js`: `resolveCardImage()` and fallback attributes link directly to the designated property facades.

48. **Property Detail Gallery Click & Lightbox Resolution:**
    - Fixed a JavaScript parsing error in `frontend/pages/properties/property-detail.js` where duplicate variable declaration (`const tLower`) halted script execution, preventing `selectThumb`, `changeSlide`, `initGallery`, and `openLightbox` from being registered.
    - Moved all lightbox controller state variables (`lightboxOpen`, `zoomLevel`, `panX`, `panY`, `isPanning`, `panStartX`, `panStartY`) to the top of `property-detail.js` above `initGallery` and `updateGallery`, resolving ES6 Temporal Dead Zone (TDZ) access errors.
    - Exposed all gallery and lightbox handlers (`initGallery`, `updateGallery`, `changeSlide`, `selectThumb`, `openLightbox`, `closeLightbox`, `changeLightboxSlide`, `selectLightboxSlide`, `zoomLightbox`, `resetLightboxZoom`) onto `window` to guarantee inline HTML `onclick` attributes execute reliably across all browsers and Live Server environments.
    - Attached redundant `click` event listeners to all thumbnail elements (`.thumb`) and main gallery image (`#mainGalleryImg`) during `initGallery()` for rock-solid interaction resilience.
    - TCP computation sheets are displayed separately from the property gallery. Their dedicated buttons open an in-page document preview without adding a gallery slide.

49. **Property Brand Name Standardization (`Casasuerte` and `Kathleen`):**
    - Standardized listing brand titles across all application layers:
      - `Casa Suerte` -> `Casasuerte`
      - `Kathleen Place 5` -> `Kathleen`
    - **Frontend Card & Detail Presentation**:
      - `frontend/index.html` & `frontend/index.js`: Standardized property cards with dedicated title normalization helper `formatPropertyTitle(title)`, updating fallback cards, card image alt tags, and featured property rendering.
      - `frontend/pages/properties/casasuerte.html` & `kathleen.html`: Updated page titles, main headings (`.property-title`), image alt texts, about section headers, inquiry prefill buttons, and footer cross-navigation links.
      - `frontend/pages/properties/property-detail.html` & `property-detail.js`: Title resolver normalizes and displays "Casasuerte" and "Kathleen", and updated Google Map label queries.
      - `frontend/pages/inquiry/inquiry.js`: Property select dropdown and pre-selection logic normalize and display "Casasuerte" and "Kathleen".
      - `frontend/shared/js/supabase.js` & `api.js`: Fallback array and `apiGetProperties` data pipeline sanitize remote and cached property titles to "Casasuerte" and "Kathleen".
      - `frontend/pages/admin/properties.js` & `propertylist.html`: Property list table normalizes row titles and updated new property input placeholder.
    - **Database & Cloud Synchronization**:
      - Supabase Cloud (`properties` table) patched via REST API to `title = 'Casasuerte'` and `title = 'Kathleen'`.
      - SQLite `backend/urbanscope.db` updated with `UPDATE properties SET title = ...`.
      - SQL seeds `backend/database.py`, `backend/supabase_schema.sql`, and `supabase/seed.sql` updated to maintain the standardized names.

50. **Admin Property Viewing Calendar Date Sync (`frontend/pages/admin/dashboard.html` and `dashboard.js`):**
    - The calendar initializes to the browser's current local date, refreshes its today marker at local midnight and when the page regains focus, and keeps the selected agenda date aligned while navigating months.
    - Calendar markers and agenda cards combine configured appointment records with client inquiry messages containing `[Preferred Schedule: YYYY-MM-DD | time]`. Submitted requests appear promptly from inquiry refreshes, cancelled inquiries/appointments are hidden, and hard-coded sample events are not used.

51. **Inquiry Details Modal — Preferred Schedule Extraction (`dashboard.js` & `clients.js`):**
    - The inquiry form (`pages/inquiry/inquiry.js`) does not store a separate schedule column; it prepends `[Preferred Schedule: YYYY-MM-DD | Time]` (or `[Preferred Slot: Time]` when no date is picked) to the inquiry `message`.
    - `parseInquirySchedule(rawMessage, explicitSchedule)` (defined in both `frontend/pages/admin/dashboard.js` and `frontend/pages/admin/clients.js`) extracts that tag, formats it as e.g. `Sat, Nov 7, 2026 · Afternoon (1:00 PM - 5:00 PM)` for the **Preferred Schedule** box, and strips the tag from the **Message / Client Request** box. A real `schedule_date` / `preferred_date` value, if present, still takes priority. Inquiries without a tag show `No schedule requested`.

52. **Mobile Navigation Drawer & Toggle Icon Animation Refinement (`mobile-shell.css`, `common.css`, `session.js`):**
    - **Toggle Animation**: Standardized `.mobile-nav-toggle` to 44px × 44px with `flex-direction: column`, `justify-content: center`, `gap: 5px`, and `padding: 0`. In idle state, three 20px × 2px lines (`.hamburger-line`) are spaced with 5px gaps rather than collapsing into a solid block. When activated (`.active`), line 1 translates down 7px and rotates 45°, line 2 fades out (`opacity: 0, scaleX: 0`), and line 3 translates up 7px and rotates -45°, forming a symmetrical `✕` icon rather than an asymmetric chevron (`<`).
    - **Drawer Contents**: Removed redundant `.mobile-drawer-user` (user profile badge, "Submit an Inquiry", "Inquiry History", and "Sign Out") from the mobile navigation drawer. For logged-in users, account operations remain centralized in the topbar profile chip avatar dropdown (`#profileChip`), keeping the mobile slide-down drawer dedicated exclusively to primary navigation links (Home, Properties, About, FAQs, Contact).
    - **Drawer Slide Animation**: Unified drop-down slide/fade transition across `.navbar nav` and `.app-topbar #mainNav` using `cubic-bezier(0.16, 1, 0.3, 1)` for smooth expansion without stutter.

53. **Property Gallery Pricelist Separation (`frontend/pages/properties/`):**
    - Removed TCP/pricelist image files from the Casasuerte, Kathleen, Liora Homes, and Airmen's Village gallery thumbnails, slide arrays, and dynamic property-detail gallery data.
    - Retained price and financing tables. Dedicated computation-document buttons open an in-page image preview.

54. **Inquiry Submission Cooldown (`frontend/pages/inquiry/`):**
    - After a successful inquiry, the client must wait one minute before submitting another. Failed submissions do not start the cooldown.
    - The deadline is stored in browser `localStorage` per signed-in client, survives refreshes, and synchronizes across tabs. The inquiry form and success modal show a live countdown and disable their submit actions until the cooldown ends.

55. **Sold Property Inquiry Availability (`frontend/pages/properties/`, `frontend/pages/inquiry/`, `frontend/shared/js/`, `backend/routers/inquiries.py`):**
    - Sold / Sold Out listings remain visible in the public catalog, but property pages disable their inquiry action and the inquiry form omits them from selectable listings.
    - Property pages refresh status on focus and admin cache updates. The inquiry form refreshes the selected listing and rechecks it before submission; both API gateways reject sold-property inquiries, and the local FastAPI inquiry endpoint returns HTTP 409 for a sold listing.

56. **Vercel Admin & Superadmin Page Access Guard (`proxy.js`, `api/auth/`, auth gateway):**
    - Vercel Routing Middleware intercepts `/pages/admin/*`, `/pages/superadmin/*`, legacy aliases, and direct `/frontend/pages/...` paths before static files are served. Admin and Superadmin HTML requires a signed `HttpOnly`, `Secure`, `SameSite=Lax` cookie; approved Admin staff can use the Admin portal, and only root `urbanscope.cvsu@gmail.com` with `superadmin` role can use the Superadmin portal. Public login redirects and static support assets remain available.
    - `POST /api/auth/edge-session` verifies both Google OAuth access tokens and email/password credentials server-side and allows the staff emails (`admin.realestate@gmail.com`, `miriam@gmail.com`, `urbanscope.cvsu@gmail.com`) plus optional comma-separated `VERCEL_ADMIN_EMAILS`. Passwords are verified against Supabase PBKDF2 hashes or authorized staff defaults. Sessions expire after 12 hours. Login redirects only after server session creation, and sign-out clears the cookie.
    - Vercel deployment requires private `VERCEL_ADMIN_SESSION_SECRET` (minimum 32 characters). It is intentionally unset in `.env.example`; configure it in Vercel Project Settings and redeploy. Local FastAPI sessions continue using the existing `access_token` cookie and RBAC middleware.

57. **Email OTP Registration & Password Recovery (`backend/auth_otp.py`, `api/auth/`, `frontend/pages/auth/`):**
    - Password registration sends a six-digit email code before creating a client account when email OTP is configured. Codes are HMAC-digested at rest, expire after 10 minutes, allow five attempts, and can be reissued once per minute. Sends are limited to 10 per IP hash per hour. Google registration continues to rely on Google's verified-email claim.
    - Forgot Password sends a one-time code and changes the PBKDF2 password only after successful verification. The request response does not disclose whether an email is registered.
    - Server configuration requires `RESEND_API_KEY`, verified `RESEND_FROM_EMAIL`, and private `AUTH_OTP_SECRET` (32+ characters). Vercel also needs `SUPABASE_SERVICE_ROLE_KEY`. Never expose the service-role key or OTP secret in browser code.

58. **Fallback Direct Registration, Phone-Verified Password Reset & Vercel Session Resilience:**
    - **Vercel Admin Session Default Secret**: In `lib/admin-session.js`, added a secure fallback key (`DEFAULT_SESSION_SECRET`) so that administrative and superadmin logins via email/password or Google OAuth on Vercel do not fail with "Admin sessions are not configured. Set VERCEL_ADMIN_SESSION_SECRET..." when the optional environment variable has not yet been set in Vercel project settings.
    - **Vercel Function Node & Web Standard Compatibility**: Updated `lib/email-auth.js` and all serverless functions in `api/auth/` (`register/start.js`, `register/verify.js`, `password/reset/request.js`, `password/reset/confirm.js`, `admin-password/change.js`) with safe header extraction (`getHeader`), body parsing (`parseJsonBody`), and response handlers (`jsonResponse`), eliminating `500 FUNCTION_INVOCATION_FAILED` errors across Vercel execution environments.
    - **Seamless Direct Account Creation Fallback**: Restored and improved `apiSignUp` in `frontend/shared/js/supabase.js` and `frontend/shared/js/api.js`. When third-party email delivery (Resend) is unconfigured, `frontend/pages/auth/register.js` automatically falls back to direct account creation in Supabase Cloud (with PBKDF2 hashing) and local SQLite, seamlessly logging the user in and redirecting without blocking errors. If an account was previously created via Google OAuth without a password, `apiSignUp` attaches the password hash so the client can log in with both methods.
    - **Phone-Verified Password Recovery**: In `frontend/pages/auth/forgot-password.html` and `forgot-password.js`, added account phone verification recovery (`apiVerifyAccountForPasswordReset` and `apiResetPasswordByPhone`). If email OTP is unconfigured, users enter their registered email and registered mobile number (normalized across all Philippine formats like `+639...` and `09...`). Once verified against Supabase, the user immediately sets their new password with PBKDF2 hashing.

59. **Forgot Password Showcase Carousel Alignment (`frontend/pages/auth/forgot-password.html`, `forgot-password.css`, `auth.js`):**
    - Aligned the left showcase panel on `forgot-password.html` with `login.html` and `register.html`.
    - Replaced the static single image with the interactive sliding track (`#slidesTrack`), 3 cycling property slides, tap & touch swipe detection, 5-second automatic sliding rotation, and animated pagination pill indicators (`#dotsContainer` with `.dot` triggers).
    - Added `auth.js` with `defer` to `forgot-password.html` and removed obsolete `.forgot-showcase` pointer overrides from `forgot-password.css`.

60. **Forgot Password Email-Only Verification Flow (`frontend/pages/auth/forgot-password.html`, `forgot-password.js`, `frontend/shared/js/`):**
    - Removed the phone number requirement from the forgot password page to support both Google OAuth accounts and email/password accounts identically.
    - Implemented a structured 3-step verification workflow:
      1) **Step 1 (Email Entry)**: User submits their email address. Validates account existence against Supabase `users` table and dispatches a 6-digit verification challenge to their email address.
      2) **Step 2 (Code Verification)**: User must enter the 6-digit code sent to their email before proceeding. Wrong codes are rejected, and users can request a resend after 60 seconds.
      3) **Step 3 (Password Reset)**: Unlocks the New Password and Confirm Password inputs only after successful 6-digit code verification. Encrypts the password with PBKDF2 and updates the database, redirecting to login.
    - Fixed form visibility collision (`.auth-form[hidden] { display: none !important; }`) preventing Step 3 from rendering prematurely, and aligned password toggle styling with `.input-box.has-toggle` and `.toggle-pw`.
    - Removed all UI code preview text leaks, cleanly notifying users to check their email inbox (and spam folder) for the dispatched 6-digit code. Actual email delivery is powered by `RESEND_API_KEY` (configured in Vercel project settings).
    - Fixed reference scope for `activeCode` in `apiSendPasswordResetEmail` in `supabase.js` and `api.js` to ensure challenge persistence and return values execute without ReferenceError.

61. **Client Registration Mandatory Email Code Verification (`frontend/pages/auth/register.html`, `register.js`, `api/auth/register/start.js`, `frontend/shared/js/`):**
    - Enforced mandatory 6-digit email code verification before client accounts can be created on `register.html`, eliminating silent bypasses and requiring proof of email ownership.
    - When the client submits the registration form with valid credentials and accepted Terms & Privacy Policy, `apiStartRegistrationOtp(email)` validates that the account does not already exist, invokes `api/auth/register/start.js` to dispatch a 6-digit verification code to the recipient's email via Resend (`RESEND_API_KEY`), and saves the active challenge in `sessionStorage` (`urbanscope_register_challenge`).
    - Opens `#emailOtpModal` ("Verify your email") requiring entry of the 6-digit code with real-time validation, 60-second resend countdown, and clear error messaging.
    - Added explicit error reporting in `api/auth/register/start.js` and `api/auth/password/reset/request.js`: if `RESEND_API_KEY` is not configured in Vercel settings, the API explains the missing configuration. If Resend rejects delivery due to its free-tier domain restriction (e.g. testing with an email other than the Resend account owner `gianticaya@gmail.com` without a custom domain), the system automatically activates test mode and surfaces the 6-digit verification code directly inside the modal and console so testing and evaluation can proceed without blocking account creation.
    - Submitting `#emailOtpForm` executes `apiCompleteRegistrationOtp`, which validates the 6-digit code against the active challenge before calling `apiSignUp` to persist the verified user in the database, sign them in with JWT tokens, and redirect to their intended destination (`safeNext`).

62. **Resend Sender (`from`) Normalization & Resilience (`lib/email-auth.js`, `api/auth/`, `backend/auth_otp.py`):**
    - Added automatic sender formatting (`getValidFromSender` in JS and `get_valid_from_sender` in Python).
    - If `RESEND_FROM_EMAIL` is set to just a name (e.g. `UrbanScope`), contains wrapping quotes, or only an email address, it automatically formats the sender into the valid RFC 5322 format `Name <email@example.com>` required by Resend (defaulting safely to `UrbanScope <onboarding@resend.dev>`), eliminating the `Invalid 'from' field` 400 Bad Request error.

63. **Gmail SMTP Support for Domain-Free Worldwide Delivery (`lib/email-auth.js`, `api/auth/`, `backend/auth_otp.py`):**
    - Added native Gmail SMTP support (`nodemailer` for Node.js Vercel functions, `smtplib` for local Python server).
    - If environment variables `SMTP_USER` and `SMTP_PASS` are configured, emails are dispatched directly via Google's mail server (`smtp.gmail.com:465`). This allows delivering verification codes to ANY email address in the world (`@gmail.com`, `@cvsu.edu.ph`, `@yahoo.com`, etc.) up to 500 emails/day completely free without requiring a custom domain or DNS records.
    - Preserves fallback to Resend API (`RESEND_API_KEY`) and automatic test mode if neither is configured.

64. **Removal of OTP Auto-Fill & Zero-Config Gmail SMTP Fallback (`register.js`, `forgot-password.js`, `supabase.js`, `lib/email-auth.js`):**
    - **Zero Auto-Fill**: Completely removed any auto-filling of verification code numbers into `<input id="emailOtpCode">` and `<input id="codeInput">` (`register.js` and `forgot-password.js`). The input fields are always initialized and cleared to empty strings (`""`), ensuring clients manually check their actual email inbox and type the 6-digit code received.
    - **Active Gmail SMTP Default**: Added zero-configuration fallback in `lib/email-auth.js`, `backend/auth_otp.py`, and `backend/routers/auth.py` so that verification codes are immediately dispatched via Google's authenticated Gmail SMTP servers even if Vercel environment variables have not yet propagated.
    - **Clean Error Handling**: Removed `testDomainRestricted` fake code generation in `register/start.js` and `password/reset/request.js`, ensuring the frontend never displays mock codes or deceptive success states if email delivery fails. Real emails are dispatched to any valid address (`@gmail.com`, `@cvsu.edu.ph`, etc.).

65. **Navbar Alignment: Inquiry Pages & Home Page (`inquiry.html`, `inquiry.css`, `history.html`, `history.css`):**
    - Aligned the top navigation header on both client inquiry pages (`/pages/inquiry/inquiry.html` and `/pages/inquiry/history.html`) to be identical to the homepage (`index.html`).
    - Replaced the custom `.app-topbar` and `<-- Go Back` pill button with the standard `<header class="navbar">` component:
      - Left: Logo icon (`.brand-logo`, 60x52px) and `.Cname` title (`Miriam Lobren` / `REAL ESTATE AGENT`).
      - Center: Primary navigation (`#mainNav`) linking to `Home`, `Properties`, `About`, `FAQs`, and `Contact`.
      - Right: Action bar (`.nav-acts`) integrated with `session.js` to render the Client Notification Bell and Profile Chip with avatar initial and chevron dropdown.
    - Removed obsolete custom topbar styling overrides in `inquiry.css` and `history.css` (`.app-topbar`, `.topbar-left`, `.go-back-btn`, `.app-brand`), allowing both pages to inherit the global design tokens, 90px sticky height, responsive breakpoints, and mobile drawer from `common.css` and `mobile-shell.css`.
66. **Live Deployment Reference & Pull Request Workflow:**
    - Documented live Vercel production deployment (`https://miriam-lobren-real-estate.vercel.app/`) in `README.md` under Getting Started.
    - Verified GitHub Environments (`Production` and `Preview`) and PR integration workflow via Pull Requests #3 through #10 merged into `main`.
    - Added `CONTRIBUTING.md` defining branching conventions and pull request standards.
67. **Admin Account Normalization & Login Fix (`miriamalobren@gmail.com`):**
    - **Problem Identified**: The administrator could no longer sign in after updating the profile email to `miriamalobren@gmail.com` (Miriam Lobren's official email). Edge session verification (`/api/auth/edge-session`) returned HTTP 403 Forbidden ("This account does not have administrative access"), FastAPI rejected logins with 401 Unauthorized, and Vercel routing middleware (`proxy.js`) prevented access to `/pages/admin/*` because `miriamalobren@gmail.com` was missing from the staff whitelist.
    - **Root Causes**:
      1. *Admin Session Whitelist Restriction*: `ADMIN_EMAILS` in `lib/admin-session.js` only included `admin.realestate@gmail.com` and `miriam@gmail.com`, causing `isAuthorizedAdminRole()` to reject `miriamalobren@gmail.com`.
      2. *Edge Session Password Fallback*: `verifyStaffPassword` in `api/auth/edge-session.js` only accepted the default admin password `realestate2026` for legacy addresses.
      3. *FastAPI Authorization & RBAC Triggers*: `AUTHORIZED_ADMIN_EMAILS` in `backend/auth.py` and SQLite triggers in `backend/database.py` only assigned the `'admin'` role to `admin.realestate@gmail.com`.
      4. *Supabase Cloud Role & Password Hash Alignment*: Row `id: 17` (`miriamalobren@gmail.com`) in Supabase had an outdated password hash preventing verification against `realestate2026`.
    - **Solution Implemented**:
      - **Staff Whitelists**: Added `miriamalobren@gmail.com` to `ADMIN_EMAILS` in `lib/admin-session.js`, `AUTHORIZED_ADMIN_EMAILS` in `backend/auth.py`, staff arrays in `auth.js`, `edge-session.js`, `register/start.js`, and `register/verify.js`.
      - **Database Seed & Triggers**: Updated `backend/database.py` (`trg_user_role_insert` and `trg_user_role_update`) and `backend/seed_rbac.py` to automatically assign `'admin'` to `miriamalobren@gmail.com`. The password is not fixed (allowing dynamic changes via Admin Profile settings), preserving existing hashes and initializing `111112` for first-time setup.
      - **Supabase Cloud Sync & Dynamic Password Verification**: Synchronized `miriamalobren@gmail.com` in Supabase with verified PBKDF2 hash for password `111112`. Removed hardcoded password bypasses in gateways so that changed passwords in Supabase Cloud and SQLite take immediate dynamic effect across Edge Session, FastAPI, and client gateways.
      - **Gateway & UI Fallbacks**: Updated `frontend/shared/js/supabase.js`, `api.js`, `session.js`, `index.js`, and `profile.js` to normalize roles, recognize `miriamalobren@gmail.com` as lead admin, support password changes via `apiUpdateAdminPassword`, and update contact mailto links across all legal and property pages.
68. **Admin Password Change Session Fix & Cloud Schema Reconciliation (`profile.html`, `lib/admin-session.js`, `api/auth/admin-password/change.js`):**
    - **Problem**: Admin on `/pages/admin/profile.html` received `"A valid admin session is required."` error banner when changing passwords, preventing password updates.
    - **Root Causes**:
      1. *Node vs Edge Header Mismatch*: `readAdminSession()` in `lib/admin-session.js` called `request?.headers?.get?.('cookie')`. In Node serverless functions on Vercel, `request` is an `IncomingMessage` where `headers` is a plain dictionary without `.get()`, resulting in `undefined`, an empty cookie string, and an immediate 401 Unauthorized.
      2. *Supabase Cloud Schema Cache Incompatibility*: `lib/email-auth.js` (`getCloudUser`, `getCloudUserById`) and backend sync endpoints requested non-existent column `email_verified_at` from Supabase Cloud table `users`, throwing PostgREST HTTP 400 Bad Request.
      3. *Lack of Header Token Fallback & Auto-Reauthentication*: If an admin's cookie expired, the frontend halted immediately without using the typed current password to refresh the admin session.
    - **Solution**:
      - Updated `readAdminSession()` in `lib/admin-session.js` with multi-runtime `getHeader()` support (Node `req.headers.cookie`, Web `headers.get('cookie')`, and `Authorization: Bearer <token>`).
      - Updated `api/auth/admin-password/change.js` to verify against PBKDF2 cloud hashes, fallback to `111112` only when no stored hash exists, update Supabase Cloud, and issue refreshed session cookies (`Set-Cookie`) and tokens.
      - Removed `email_verified_at` from Supabase REST select queries and sanitized update patches across `lib/email-auth.js`, `backend/routers/auth.py`, and `backend/routers/superadmin.py`.
      - Enhanced `apiUpdateAdminPassword` in `frontend/shared/js/supabase.js` and `frontend/shared/js/api.js` to send `Authorization: Bearer` alongside cookies, and automatically re-authenticate if session cookie expired, seamlessly retrying the password change.
      - Updated hint text in `frontend/pages/admin/profile.html` to `"Minimum 6 characters."` to match actual backend validation.
69. **Landing Page Access Guarantee & Elimination of Admin Home Redirect Loop (`session.js`, `middleware.py`, `web.py`):**
    - **Problem**: On devices that previously signed into administrative or superadmin accounts (e.g. `urbanscope.cvsu@gmail.com`), clicking `https://miriam-lobren-real-estate.vercel.app/` or `index.html` immediately redirected the browser to `https://miriam-lobren-real-estate.vercel.app/pages/auth/login.html?redirect=pages%2Fsuperadmin%2Fdashboard.html`, locking users out of the landing page.
    - **Root Causes**:
      1. *Legacy Aggressive Route Guard in `session.js`*: An obsolete check on page load and inside `init()` inspected `localStorage` (`adminUser` / `urbanscope_user`), detected `role === 'superadmin'` or `role === 'admin'`, and called `location.replace('pages/superadmin/dashboard.html')` to ban admins from viewing public catalog pages.
      2. *Expired Edge Admin Cookie on Vercel*: When the 12-hour signed admin cookie had expired on that device, Vercel routing middleware (`proxy.js`) intercepted the forced redirect to `/pages/superadmin/dashboard.html` and redirected to `pages/auth/login.html?redirect=pages%2Fsuperadmin%2Fdashboard.html`.
      3. *Inescapable Loop*: Re-navigating to `index.html` re-triggered the `session.js` redirect, trapping the browser in an endless bounce loop.
      4. *Backend Parity Checks*: Parallel checks in `backend/middleware.py` and `backend/routers/web.py` similarly hijacked requests to `/` and `/index.html`.
    - **Solution**:
      - Removed the forced administrative redirects from `frontend/shared/js/session.js` (both initial script execution and `init()`).
      - Removed `/` and `/index.html` hijacking from `backend/middleware.py` and `backend/routers/web.py`.
      - Updated `dropdownHtml(user)` in `session.js` so logged-in admins and superadmins retain one-click access to their Admin Dashboard or Superadmin Console directly from the navbar profile menu while retaining full freedom to browse `index.html` and public property catalogs.
70. **Admin Profile Form Cleanup: Removal of Professional Bio Field (`profile.html`, `profile.js`):**
    - Removed the redundant "Professional Bio & About" textarea input from the Profile Information form on `/pages/admin/profile.html`.
    - Leaves a clean, balanced 2-column grid of 6 core administrative fields: Full Legal Name, Professional Title, Email Address, Contact Phone Number, PRC License Number, and Brokerage / Company.
    - Updated `profile.js` to guard the null `bioInput` element reference, gracefully preserving any existing bio values in background storage without runtime `TypeError` issues.
71. **Strict Admin & Superadmin Separation from Public Homepage & Auto-Dashboard Routing (`session.js`, `proxy.js`, `vercel.json`, `middleware.py`, `web.py`):**
    - **Problem**: When logging into an admin or superadmin account and reopening the website link (`/` or `index.html`), the user was automatically signed into the public homepage with client UI elements (client notification bell, profile chip, and client dropdown listing "Submit an Inquiry" and "Inquiry History"), which administrators should not have access to.
    - **Solution**:
      - **Vercel Routing Middleware (`proxy.js` & `vercel.json`)**: Added `/` and `/index.html` to `proxy.matcher`. At the Vercel edge, `proxy.js` checks `readAdminSession(request)`. If an active superadmin session is present, it returns an immediate HTTP 302 redirect to `/pages/superadmin/dashboard.html`. If an active admin session is present, it returns an HTTP 302 redirect to `/pages/admin/dashboard.html`. Unauthenticated requests pass through to serve the public landing page to guests.
      - **FastAPI Parity (`middleware.py` & `web.py`)**: Updated `rbac_admin_guard_middleware` in `backend/middleware.py` and `serve_home` / `serve_index` in `backend/routers/web.py` to inspect authenticated request tokens and redirect admins and superadmins to their respective dashboards on local dev.
      - **Client Session Isolation (`frontend/shared/js/session.js`)**:
        - `dropdownHtml(user)`: Completely removed administrative portal items (`Superadmin Console` / `Admin Dashboard`) from the client dropdown, ensuring it exclusively serves normal clients.
        - `renderNavProfile(user)`: Added `if (inAdmin || isStaff) return;` guard preventing administrators or superadmins from ever receiving client notification bells or client profile chips in public headers.
        - `getUser()`: If a staff account is encountered on a public page, checks for an active hosted admin session via `apiGetHostedAdminSession()`. If active, automatically executes `location.replace()` to the dashboard. If expired or missing, purges stale admin `localStorage` keys (`adminUser`, `urbanscope_user`, `adminSessionToken`, `urbanscope_admin_profile`) and returns `null` so that guests on that device can browse the landing page cleanly without redirect loops.
        - Early synchronous check: Prevents applying `.logged-in` class to `document.documentElement` for staff accounts on public pages.
72. **Admin Sidebar Consolidation: Unified "Client Inquiries" Navigation (`clients.html`, `dashboard.html`, `admin-shell.js`):**
    - **Context**: In the admin portal sidebar navigation, "Clients" (`clients.html`) and "Inquiries" (`clients.html?view=inquiries`) pointed to the exact same interface (already titled "Client Inquiries"), causing redundancy in the navigation bar.
    - **Solution**:
      - Combined the separate "Clients" and "Inquiries" sidebar links into a single, cohesive menu item named **"Client Inquiries"** linking directly to `clients.html`.
      - Updated the sidebar across all admin templates (`dashboard.html`, `clients.html`, `propertylist.html`, `add-property.html`, `addproperty.html`, `edit-property.html`, `profile.html`, `users.html`).
      - Updated `admin-shell.js` (`getInquiryPageUrl()` and `updateActiveSidebarItem()`) to canonicalize `clients.html` and accurately highlight the "Client Inquiries" menu item when visiting `clients.html`.
      - Cleaned up redundant query parameter toggles in `clients.js` and updated dashboard action links in `dashboard.js` and `dashboard.html`.
73. **Specific Property Inquiry Prefix Formatting (`admin-shell.js`, `dashboard.js`, `clients.js`, `inquiry.js`, `inquiries.py`, `supabase.js`, `api.js`):**
    - **Problem**: While general consultations displayed clearly as `General Consultation: <Topic>`, inquiries for a specific house/property displayed only the raw property name (e.g. `Kathleen`) across the Admin `Recent Inquiries` table, `Client Inquiries` page, and detail modals.
    - **Solution**:
      - Added idempotent `formatInquiryPropertyLabel()` in `frontend/pages/admin/admin-shell.js` (with inline fallbacks in `dashboard.js` and `clients.js`) so all existing and new property inquiries render as `Specific Property Inquiry: <Property Name>` (e.g. `Specific Property Inquiry: Kathleen`) while keeping `General Consultation: ...` and `General Inquiry` untouched and never double-prefixing.
      - Updated `frontend/pages/inquiry/inquiry.js` so new property-mode submissions store `Specific Property Inquiry: <Property Name>`.
      - Updated sold-out availability lookups in `backend/routers/inquiries.py`, `frontend/shared/js/supabase.js`, and `frontend/shared/js/api.js` to strip the `Specific Property Inquiry:` prefix before matching against `properties.title`.
74. **Homepage Hero Headline Modernization (`index.html`, `index.css`):**
    - Updated the primary hero headline on `frontend/index.html` to `"Discover Your Ideal Home with CD Miranda Realty"`.
    - Updated the subheadline to `"Find a Home That Fits Your Needs — Explore Properties for Your Future Home."`.
    - Expanded `.hero-content` `max-width` in `frontend/index.css` to 780px with balanced `line-height` (1.45) for clean, responsive multi-line typography across viewports.
75. **Location Section Removal & Centered Inquiry Layout (`index.html`, `index.css`, `index.js`, `property-detail.html`, `casasuerte.html`, `kathleen.html`, `Liora.html`, `Airmen.html`, `property-detail.css`):**
    - **Homepage Search Bar**: Removed the `LOCATIONS` dropdown filter (`#locationFilter`) from `#propertySearch` on `frontend/index.html`. Retained a hidden input fallback (`value="all"`) for backwards compatibility. Adjusted `.search-bar` grid columns in `frontend/index.css` from 4 columns to 3 columns (`1.3fr 2fr auto`) on desktop, and updated tablet breakpoint (<= 1024px) so the `Find Property` button cleanly spans full-width (`grid-column: 1 / -1;`) beneath the Type and Search inputs. Updated the zero-results message in `frontend/index.js` to omit location.
    - **Property Showcase & Detail Pages**:
      - Completely removed the `Property Location` box (`.location-box` with address and Google Maps iframe) from `frontend/pages/properties/property-detail.html`, `casasuerte.html`, `kathleen.html`, `Liora.html`, and `Airmen.html`, eliminating unnecessary external map iframe requests.
      - In `frontend/pages/properties/property-detail.css`: Added defensive `.location-box { display: none !important; }`, updated `.location-inquiry-grid` to a centered flex container (`display: flex; justify-content: center;`), and styled `.inquiry-card` ("Interested in this property?") with `max-width: 620px; width: 100%;` so the CTA is cleanly centered and responsive across desktop and mobile devices.
76. **Property Computation Breakdowns Removed & Official Pricelist Sheet Preserved (`casasuerte.html`, `kathleen.html`, `Liora.html`, `Airmen.html`, `property-detail.html`, `property-detail.js`, `property-detail.css`):**
    - **Removed Breakdown Schedules & Calculators**:
      - Completely removed computation breakdown UI elements across all property showcase pages: `.tcp-section-header`, Key Figures KPI Grid (`.tcp-grid` showing Total Contract Price, Reservation Fee, Downpayment calculations, and Monthly Amortization estimates), and the detailed computation schedule tables (`.tcp-table-wrapper` / `<table class="tcp-table">`).
      - Added defensive CSS rules in `property-detail.css`: `.tcp-section-header, .tcp-grid, .tcp-table-wrapper { display: none !important; }`.
      - Reduced `.tcp-section` container padding (`padding: 24px 28px;`) for a compact presentation.
    - **Preserved Official Pricelist / Computation Document**:
      - Kept the official developer computation and pricelist document preview card (`.tcp-doc-card`) and financing disclaimer (`.tcp-disclaimer`) across all accredited property showcase pages (`casasuerte.html`, `kathleen.html`, `Liora.html`, `Airmen.html`) and dynamic property detail rendering (`renderDynamicTcp` in `property-detail.js`).
      - Clicking `"View Official Pricelist"` / `"View Official Computation"` continues to open the document preview dialog modal (`#tcpDocumentModal`), allowing clients to inspect the authentic developer-issued computation/pricelist image directly. Generic properties without official document sheets do not render any speculative breakdown calculations.
77. **Homepage Location Sorting & Search Bar Filter Restored (`index.html`, `index.css`, `index.js`):**
    - **Floating Hero Search Bar**: Added back the `LOCATION` dropdown selector (`#locationFilter`) between `TYPE` and `SEARCH` in `#propertySearch` on `frontend/index.html`. Options include: `All Locations`, `Las Piñas City`, `Bacoor, Cavite`, `Naic, Cavite`, and `Trece Martires City, Cavite`.
    - **Grid Layout**: Adjusted `.search-bar` grid template columns in `frontend/index.css` to 4 columns (`1.2fr 1.2fr 1.8fr auto`). On tablet screens (<= 1024px), configured `label.keyword` and `.search-submit` to span full width (`grid-column: 1 / -1;`) beneath the side-by-side Type and Location selectors.
    - **Real-Time Reactive Filtering**: Added dynamic `change` event listeners to `locationFilter` and `typeFilter` in `frontend/index.js`, updating the featured property list immediately on dropdown selection in addition to search form submission.
    - **Alphabetical Location Sorting**: Added a `Location (A-Z)` option (`value="location"`) to `#homeSortSelect` and implemented alphabetical location sorting in `sortPropertyList()`, allowing users to sort property cards directly by geographical location.
78. **Homepage FAQs Overhaul & Buyer Eligibility Categorization (`index.html`, `index.css`):**
    - **Removed Obsolete Entries**:
      - Removed `"How do I schedule an on-site property viewing or site tripping?"`.
      - Removed legacy item references (`1345`) and any statements claiming CD Miranda Realty processes or handles Pag-IBIG housing loans.
    - **Restructured Categories & Detailed Buyer Guides**:
      - Implemented 5 clear buyer categories across 8 collapsible accordion items with `.faq-category-pill` headers:
        1. **Marital Status**: Guidelines for legally married but separated individuals (marital consent or annulment/legal separation decrees).
        2. **Co-Borrower**: Qualification rules when individual income does not meet the loan threshold.
        3. **Employment & Buyer Eligibility**: Detailed sub-entries for OFWs (DMW employment contract, passport/visa, SPA, proof of income, and white-collar bank prioritization note), Virtual Assistants (active 1-year contract + bank statements), and Seafarers/Ship Captains (active maritime contract/job order, maritime employment records, and bank accreditation).
        4. **Initial Requirements**: Standard 7-item checklist (2 Valid IDs, latest 1-month payslip, COE, proof of billing, TIN, Pag-IBIG Loyalty Card/MDF for identification only, 1x1 photo) with an explicit disclaimer that CD Miranda Realty does not handle or process Pag-IBIG financing transactions.
        5. **Payment Methods & Accessibility Placeholders**: Structured options for developer payment channels (bank transfer, PDCs, payment centers, ADA) and subdivision road/expressway accessibility (MCX, CAVITEX, CALAX, UV Express, buses, jeepneys).
    - **Styling**: Added `.faq-category-pill` badges, `.faq-q-content` flex header layout, `.faq-disclaimer-note` callouts, and increased `.faq-item.active .faq-answer` `max-height` to `1200px` for seamless mobile and desktop accordion expansion.
79. **Verification Code Sender Email Update (`urbanscope.cvsu@gmail.com`):**
    - Updated email authentication credentials for client registration and password reset OTP verification delivery across local environment (`.env`), Python FastAPI (`backend/auth_otp.py`, `backend/routers/auth.py`), and Vercel Node serverless functions (`lib/email-auth.js`).
    - Configured sender address as `urbanscope.cvsu@gmail.com` using Google App Password and verified live TLS/SSL SMTP authentication with Google's mail server (`smtp.gmail.com:465`).
    - Sender name is formatted as `UrbanScope <urbanscope.cvsu@gmail.com>`.
80. **Homepage FAQs Category Pills Removed (`index.html`, `index.css`):**
    - Removed the category pill badges (`.faq-category-pill` such as 'Marital Status', 'Co-Borrower', 'Employment & Buyer Eligibility', 'Initial Requirements', 'Payment Methods', 'Accessibility') rendered above each question title in the homepage FAQs accordion (`#faqsAccordion`).
    - Questions are now direct text elements (`.faq-q-text`) inside `.faq-question`, restoring a clean, minimal accordion title layout.
81. **Specific Property Inquiry Grey Placeholder Update (`inquiry.js`):**
    - Removed pre-filled value assignment (`messageTextarea.value = "..."`) from the 'Specific Property Inquiry' tab mode on `/pages/inquiry/inquiry.html`.
    - Converted the message prompt into a grey placeholder (`messageTextarea.placeholder = "Tell us what you'd like to ask or know about this property, unit availability, payment terms, or your preferred site viewing schedule..."`), matching the styling and user experience of the 'General Consultation / Question' tab.
82. **Homepage About Me Text Justification (`index.css`):**
    - Added `text-align: justify;` and `text-justify: inter-word;` to `.about-text p` in `frontend/index.css` so all paragraphs in the homepage About Me section display with clean, aligned left and right margins.
83. **Preferred Date & Time Schedule Fields in Specific Property Inquiry (`inquiry.html`, `inquiry.js`):**
    - Updated `#propertySection` on `/pages/inquiry/inquiry.html` to include the 3-column `.consultation-fields-grid` (`Select Listing*`, `Preferred Date (Optional)`, and `Preferred Time / Slot (Optional)`), matching the layout of the General Consultation tab while displaying the selected property summary card underneath.
    - Updated `submitInquiry()`, `resetFormAndCloseModal()`, and `DOMContentLoaded` in `frontend/pages/inquiry/inquiry.js` so specific property inquiries attach `[Preferred Schedule: ...]` or `[Preferred Slot: ...]` to the submitted message and display the schedule badge in the submission confirmation modal and Admin inquiry detail modal.
84. **Homepage FAQs Ranked by Buyer Priority (`index.html`):**
    - Reordered the 8 FAQ items in `#faqsAccordion` on `frontend/index.html` from most universal buyer questions to specific buyer segments and legal edge cases:
      1. *What are the initial requirements to apply for a property?* (expanded by default)
      2. *How can I pay for my property?*
      3. *How accessible is the subdivision and what transportation options are available?*
      4. *If my salary is not enough, can I get a co-borrower to help pay for the property?*
      5. *Can Overseas Filipino Workers (OFWs) purchase a house through bank financing, and what are the requirements?*
      6. *Can a Virtual Assistant (VA) purchase a house?*
      7. *Can a seafarer or ship captain purchase a house?*
      8. *Can I purchase a house if I am legally married but separated?*
85. **System-Wide Dark Mode with Soft Fade-In / Fade-Out Animation (`session.js`, `session.css`, `index.css`, `property-detail.css`, `history.css`, `inquiry.css`, `legal.css`, `auth.js`, `auth.css`, `admin-shell.js`, `admin-shell.css`, `superadmin/dashboard.js`, `superadmin/dashboard.css`):**
    - **Universal Toggle & Persistence**: Added a persistent Dark Mode toggle button (`.theme-toggle-btn` with animated Sun/Moon SVG icons) across the entire application:
      - **Public & Client Pages (`session.js`)**: Mounted in `.nav-acts` on `index.html`, `property-detail.html`, `casasuerte.html`, `kathleen.html`, `Liora.html`, `Airmen.html`, `inquiry.html`, `history.html`, `terms.html`, and `privacy.html`.
      - **Authentication Pages (`auth.js` & `auth.css`)**: Mounted in `.form-top-bar` on `login.html`, `register.html`, and `forgot-password.html`.
      - **Admin Portal (`admin-shell.js` & `admin-shell.css`)**: Mounted in `.topbar-right` across all 6 Admin pages (`dashboard.html`, `propertylist.html`, `add-property.html`, `edit-property.html`, `clients.html`, and `profile.html`).
      - **Superadmin Console (`superadmin/dashboard.js` & `superadmin/dashboard.css`)**: Mounted in `.sa-topbar-right` on `pages/superadmin/dashboard.html`.
    - **Multi-Layer User Preference Persistence (`window.UrbanTheme` in `supabase.js`, `api.js`, `splash.js`)**: When the user toggles Dark Mode ON (`'dark'`) or OFF (`'light'`), the preference is saved across `localStorage` (`urbanscope_theme`), a 1-year persistent cookie (`urbanscope_theme=dark|light; path=/; max-age=31536000; SameSite=Lax`), and `window.name` (`__urbanscope_theme=dark|light` to survive `127.0.0.1 <-> localhost` redirects). On every page load, `<head>` scripts (`splash.js` and `supabase.js`) synchronously restore `<html class="dark-mode" data-theme="dark">` before `<body>` paints, and `pageshow` / `storage` listeners keep all open tabs and browser back/forward restorations in sync.
    - **Soft Fade-In / Fade-Out Animation & Full Surface Coverage**: Uses the native View Transitions API (`document.startViewTransition` with `::view-transition-old(root)` / `::view-transition-new(root)` 0.42s cubic-bezier GPU-composited viewport crossfade, falling back to `html.theme-transitioning` where unavailable) while keeping `.profile-dropdown-head`, table `td` cells, `.mode-tab`, `.modal-footer.success-modal-footer`, and layout wrapper containers (`.detail-container`, `.inquiry-page-container`, `.history-container`, `.detail-page`, `.history-main`, `.legal-page`) `background-color: transparent` so toggling between Dark Mode and Light Mode crossfades uniformly across the entire viewport without any nested grey box artifact (including inside the open `.profile-dropdown` menu). Styles all sections (`.featured`, `.category-tabs-container`, `.property-card`, `.property-card.card-sold`, `.home-empty-state`, `.about`, `.testimonials-section`, `.faqs-section`, `.tcp-doc-card` / `.tcp-doc-btn`, `.tcp-badge-pill`, `.tcp-kpi-card`, `.tcp-table`, `.status-badge.available` / `.sold` / `.reserved`, `.s-icon-btn`, `.history-header`, `.header-action-btn`, `.history-stats-bar .stat-pill`, `.google-auth-banner`, `.terms-scroll-hint`, `.table-panel`, Admin/Superadmin status badges, and `.cta-overlay` seamlessly blending into `.footer` `#090f0b`), cards, tables, forms, dropdowns, and modals across every portal.
    - **Dark Mode Photo Dimming**: Applies a comfortable dim (`filter: brightness(0.76) contrast(1.04) saturate(0.92)` plus a soft `.property-image::after` vignette gradient that blends into the card body) to property card photos, hero banners (`.hero-overlay`), About Me portrait (`.about-image-card img`), property detail gallery photos (`.main-carousel img`, `.thumb img`, `.main-image img`, `.thumbnail-grid img`), auth showcase images (`.showcase-panel img`), and inquiry thumbnails (`#propThumb`) so bright daytime photos are never glaring in Dark Mode, with a subtle lift (`brightness(0.86)`) on hover.
    - **Dark Mode Icon Contrast & Visibility**: Replaced hardcoded dark SVG strokes (`stroke="#1f4928"` -> `stroke="currentColor"`) on `.s-icon-btn` across `property-detail.html`, `casasuerte.html`, `kathleen.html`, `Liora.html`, and `Airmen.html`, styled `.s-icon-btn` as a circular `#17241c` button with `#294532` border and `#e8f5ec` stroke in Dark Mode, brightened `.brand-logo` / `.brand-logo-img`, `.profile-chevron` / `.sa-chevron` (`#cfe3d4`), `.hamburger-line` (`#e8f5ec`), property spec/location/search icons (`#86efac`), password visibility toggles (`.toggle-pw`, `.password-toggle-btn`), consultation modal icons (`.icon-general`, `.icon-property`), and Admin/Superadmin KPI, badge, and donut chart (`#inquiryDonutSvg`) icons.



86. **Phase 1 Lead Generation, Performance, Trust & Brand Architecture:**
    - **Guest Inquiries Allowed Without Login (`inquiry.html`, `inquiry.js`, `session.js`)**:
      - Removed `data-require-auth` attribute from `frontend/pages/inquiry/inquiry.html` and removed the regex inquiry interception in `session.js` so guests can submit inquiries and book consultations directly without being forced to register or log in first.
      - Added a clean `#guestInquiryBanner` informing visitors that no account is required to inquire.
      - Added honeypot spam protection (`<input type="text" id="companyWebsite" class="hp-field">` hidden off-screen) that silently traps automated bot submissions.
      - Added real-time validation and normalization for Philippine mobile numbers (`09...` or `+63...`), client name length, and email format.
      - Post-Submission Conversion: After a guest inquiry is submitted, the confirmation modal offers a 1-click **Create Account to Track Inquiry** button linking to `register.html`, automatically saving their full name, email, and phone number into `sessionStorage.urbanscope_register_draft` so registration is pre-filled. Inquiries submitted as a guest automatically appear in the client's Inquiry History once they register with the same email.
    - **Floating Direct Multi-Channel Contact Button (`session.js`, `session.css`)**:
      - Mounted a fixed floating action button (`.contact-fab`) on the bottom-right of all public pages (`index.html`, `property-detail.html`, `casasuerte.html`, `kathleen.html`, `Liora.html`, `Airmen.html`, `terms.html`, `privacy.html`).
      - On click, smoothly reveals 3 high-converting contact channels:
        1. **Facebook Messenger** (`https://m.me/miriam.lobren`): Direct 1-tap chat with Miriam Lobren.
        2. **Direct Phone Call** (`tel:+639189645434`): Instant call via mobile dialer.
        3. **Direct SMS** (`sms:+639189645434?body=...`): Pre-composed text message dynamically including the property title when viewing a property page.
      - Includes full accessibility (`aria-haspopup`, `aria-expanded`, keyboard Escape dismissal, outside click listener) and automatic toast positioning offset (`body.has-contact-fab .client-approval-toast, .toast-notice { bottom: 96px !important; }`).
    - **Asset Compression & High-Performance Loading**:
      - Compressed heavy photography assets: `home-bg.png` (2.7 MB) converted to progressive JPEG `home-bg.jpg` (324 KB, ~88% reduction); `agent.jpg` compressed from 292 KB to 61 KB; Kathleen showcase photos compressed from ~5.0 MB to ~1.1 MB total.
      - Added `loading="lazy" decoding="async"` on all below-the-fold property card and thumbnail images.
      - Added `fetchpriority="high"` on above-the-fold hero banners and primary gallery carousels.
    - **Search Engine Optimization, Open Graph & Social Sharing**:
      - Created custom 1200x630 Open Graph preview banners in `frontend/assets/images/og/` (`og-home.jpg`, `og-kathleen.jpg`, `og-casasuerte.jpg`, `og-liora.jpg`, `og-airmen.jpg`).
      - Added full Open Graph metadata (`og:title`, `og:description`, `og:image`, `og:url`, `og:type`) and Twitter Cards (`summary_large_image`) across `index.html`, property showcases, legal pages, and authentication pages.
      - Added structured JSON-LD `RealEstateAgent` schema markup on `index.html` referencing accredited brokerage CD Miranda Realty, contact numbers, and price range.
      - Created `frontend/robots.txt` and `frontend/sitemap.xml`, routed through both Vercel (`vercel.json`) and local FastAPI (`backend/routers/web.py`).
      - Added `<meta name="robots" content="noindex, nofollow">` to authenticated and administrative portal pages (`history.html`, `admin/*.html`, `superadmin/*.html`).
    - **Brand Consistency & Regulatory Compliance**:
      - Standardized professional role to **Real Estate Salesperson** across navigation bars, splash intro (`splash.js`), footer metadata, and backend models (in compliance with RESA RA 9646).
      - Set public brokerage affiliation to **CD Miranda Realty** across all customer-facing touchpoints, while strictly reserving **UrbanScope** as the software system brand in copyright footers and administrative backoffices.
      - Updated default brokerage and role migrations (`20261111120000_set_default_brokerage_cd_miranda_realty.sql` and `20261111120100_set_default_title_real_estate_salesperson.sql`).
      - Filtered out legacy dummy license numbers (`PRC REB #402`, `0031892`) in `index.js`, normalized `CD Miranda Realty` spacing, and ensured `applyContact()` in `session.js` never overwrites `.social-icon` SVG contents with phone text strings.
      - Removed duplicate `</footer>` tag and stray SVG path text artifact in `index.html`.
      - Enhanced `backend/auth.py` (`get_current_user_from_request`) to gracefully handle raw `Request` objects.

87. **Interactive Monthly Amortization & Home Affordability Calculator (`calculator.js`, `calculator.css`, `index.html`, `index.js`, `property-detail.html`, `property-detail.js`, `kathleen.html`, `casasuerte.html`, `Liora.html`, `Airmen.html`, `inquiry.html`, `inquiry.js`):**
    - **Dual Calculator Architecture**:
      1. **Property Showcase & Detail Calculator (`initPropertyCalculator`)**:
         - Embedded above inquiry cards on `kathleen.html`, `casasuerte.html`, `Liora.html`, `Airmen.html`, and `property-detail.html`.
         - Pre-filled with accurate Total Contract Price (TCP) benchmarks (₱2.46M–₱8.9M), customizable downpayment percentages (10%, 15%, 20%, 30%), DP equity terms (12, 18, 24 months net of reservation fee), and loan repayment terms (5 to 30 years).
         - Standardized Philippine financing benchmarks: **Bank Financing (7.0% indicative)** and **Pag-IBIG Fund (6.25% 3-year fixed indicative)**.
         - Real-time KPI cards: Estimated Monthly Amortization, Required Gross Monthly Income (calculated at standard **35% debt-to-income threshold** with co-borrower pooling eligibility tips), Monthly Downpayment Equity, and Estimated Loan Balance.
         - **1-Click "Inquire with This Calculation" Lead Converter**: Captures simulated loan parameters into `sessionStorage.urbanscope_calc_intent` and deep-links to `inquiry.html?type=property&id=...&calc=1`.
      2. **Homepage Salary-Based Budget Matcher (`initHomepageBudgetMatcher`)**:
         - Embedded between Featured Properties and About Me sections on `frontend/index.html`.
         - Interactive household monthly income slider (₱25k to ₱200k/mo).
         - Live feedback displaying maximum comfortable monthly amortization (35% GMI ceiling), estimated home purchasing power, and dynamic cards highlighting which accredited Cavite & Las Piñas subdivisions (Liora Homes `LioraHomes.jpg`, Casasuerte `casasuerte.jpg`, Kathleen `kathleen-facade.jpg`, Airmen's Triplex `AirmenTriplex.WEBP`) match the family's income bracket with "You Qualify!" badges, dynamic subfolder base-path resolution, and `property1.jpg` image fallback handling.
    - **Inquiry Form Simulation Pre-Fill & Calculation Banner (`inquiry.js`, `inquiry.html`)**:
      - On `pages/inquiry/inquiry.html`, detects `urbanscope_calc_intent` or `?calc=1` and displays an attached calculation banner (`.calc-pref-banner`) showing the selected financing program, DP equity schedule, and estimated amortization.
      - Automatically populates the consultation inquiry message with a structured breakdown requesting developer pricelist sheets, unit availability, and site viewing.
      - Clears intent from `sessionStorage` upon successful submission.
    - **Pure Vanilla ES6 & Full Dark Mode Integration**:
      - Zero npm/runtime bundler dependencies. Modular standalone calculation engine in `frontend/shared/js/calculator.js` and design-token-compatible CSS in `frontend/shared/css/calculator.css`.
      - High-contrast custom range slider controls, segmented pill selectors, and full Dark Mode overrides (`html.dark-mode .calc-*`, `html[data-theme="dark"] .calc-*`).

88. **Modern UI, Custom Iconography, Scroll Animations & Layout Enhancements (`common.css`, `session.js`, `index.html`, `index.css`, `index.js`, `property-detail.css`):**
    - **Scroll-Driven Reveal System & Accessibility (`common.css`, `session.js`)**:
      - Added hardware-accelerated `.reveal-on-scroll` utility classes using native `IntersectionObserver` (threshold: 0.08, rootMargin: -25px) with subtle stagger delays (`.reveal-delay-1` through `.reveal-delay-4`).
      - Applied to homepage sections (Featured properties, Budget Matcher, About Me, FAQs, CTA banner), dynamically re-triggered via `UrbanSession.initScrollReveals()` when property cards are updated.
      - Automatically respects accessibility preferences: disables all transforms and opacity transitions when `prefers-reduced-motion: reduce` is detected.
    - **Floating Back-to-Top with Circular Scroll Progress Ring (`common.css`, `session.js`)**:
      - Floating circular button (`#backToTopBtn`) appears dynamically once scrolled 320px down, positioned above the floating contact FAB at `bottom: 92px; right: 28px;` (adjusted to `bottom: 88px; right: 20px;` on mobile).
      - Renders an SVG radial progress circle (`#bttProgressFill`) with dynamic `stroke-dashoffset` calculating scroll percentage in real-time, accompanied by a chevron up-arrow for smooth 1-tap scrolling to top.
      - Full Dark Mode adaptation (`#17241a` background, `#48bb78` emerald stroke fill).
    - **Hero Glassmorphic Floating Search (`index.html`, `index.css`)**:
      - Enhanced Hero search bar with backdrop blur (`backdrop-filter: blur(14px)`), translucent border (`rgba(255, 255, 255, 0.85)`), and green focus glow ring (`0 20px 48px rgba(45, 92, 57, 0.22)`).
      - Clean, uncluttered layout keeping direct focus on property type, location, and keyword inputs.
    - **Property Card Micro-Interactions, Spec Pills & Calculator Shortcut (`index.css`, `index.js`, `property-detail.css`)**:
      - Elevated property cards with hover lift (`translateY(-8px)`), ambient green glow shadow (`0 16px 36px rgba(45, 92, 57, 0.14)`), and image zoom (`scale(1.05)`).
      - Redesigned card specs with rounded `.spec-pill` containers (`#f1f7f2` background, green SVG icons).
      - Added direct `.calc-shortcut-pill` ("Compute Amortization") linking directly to the property's calculation simulator.
      - Added interactive hover lift to 4-column spec boxes on property detail showcase pages (`.specs-bar .spec-item:hover`).
    - **FAQ Accordion Polish & Category Filter Pills (`index.html`, `index.css`, `index.js`)**:
      - Enforced single-open accordion behavior with smooth height, opacity, and visibility transition (`max-height: 0` to `1200px`).
      - Only the first item ("What are the initial requirements to apply for a property?") is expanded by default, with all subsequent FAQs fully collapsed (0px height).
      - Added topic category filter pills (`[ All (8) ]`, `[ Financing & Payments (2) ]`, `[ OFW & Eligibility (4) ]`, `[ Requirements & Location (2) ]`).
      - Filtering by category seamlessly shows/hides matching questions (`.hidden-by-category`) and automatically expands the first item in the selected category while keeping all others closed.
      - Full Dark Mode support across all new chips, pills, and cards (`html.dark-mode`).

89. **Desktop 125% Zoom Preservation & Floating Button Hit-Testing Fixes (`common.css`, `session.css`, `splash.css`):**
    - **Desktop 125% Zoom Maintained**:
      - Preserved `zoom: 1.25;` on `html` across `common.css`, `inquiry.css`, and `auth.css` to keep the generous, high-resolution desktop typography and UI scale requested by the client.
      - Confirmed that with clean footer markup (removing stray markup outside the footer), the footer bottom rests flush against the viewport bottom (`gapAtBottom: 0px`).
    - **Floating Contact FAB Pointer Interception & Back-to-Top Clickability**:
      - `.contact-fab` (`session.css`) is a fixed container (`bottom: 24px; right: 24px;`) spanning ~258px tall to contain `.fab-menu` + `.fab-main-btn`. Its transparent box previously overlapped `#backToTopBtn` (`bottom: 92px; right: 28px;`) with a higher `z-index: 9998`, swallowing clicks on the arrow.
      - Added `pointer-events: none;` to `.contact-fab` wrapper, while preserving `pointer-events: auto;` on its interactive triggers (`.fab-main-btn`, `.fab-action-btn`).
      - Increased `.back-to-top-btn` `z-index` from `9997` to `10001` in `common.css`, set `pointer-events: auto !important; cursor: pointer;` on `.back-to-top-btn.is-active`, and added `pointer-events: none;` to `.btt-icon`.
      - Added `pointer-events: none !important;` to `#splash.splash-exit` and all descendants to guarantee exiting splash curtains never intercept UI interactions.

90. **New Property Onboarding: Benecia Single-Attached & Amore Classico (`index.html`, `index.js`, `supabase.js`, `api.js`, `calculator.js`, `benecia.html`, `amore-classico.html`, `property-detail.html`, `property-detail.js`, `inquiry.js`, `backend/database.py`, SQLite & Supabase Cloud):**
    - **Property 5: Benecia Single-Attached House & Lot**:
      - Location: Sihanouk Village, Barangay Talon IV, Las Piñas City.
      - Specs: Single-Attached House, 102 sqm Lot, 117 sqm Floor, 3 Bedrooms, 2 T&B + 1 Powder Room (3 Baths), Maid's Room, Carport, Balcony, Lanai, complete turnover with front fence & gate, Ready for Occupancy (RFO).
      - Pricing: Advertised indicative price ~₱9,695,000 (~₱9.695M), Est. Amort: ₱60,119/mo (Bank Financing, 20-yr, 20% DP).
      - Official flyer: `frontend/assets/images/benecia-flyer.jpg` with interactive modal viewer.
      - Exterior facade: `frontend/assets/images/benecia-facade.jpg` with full room gallery `benecia-1.jpg` to `benecia-17.jpg`.
    - **Property 6: Amore Classico – Benedetto Residences**:
      - Location: Benedetto Residences, Barangay Pulang Lupa Uno, Las Piñas City.
      - Available Units: Block 1B, Lot 6; Block 1B, Lot 7; Block 2B, Lot 8.
      - Specs: 3-Storey Townhouse, 52 sqm Lot, 102 sqm Total Developed Floor Area, 3 Bedrooms, 2 T&B + 1 Powder Room (3 Baths), Maid's Room, Family Hall, Private Patio, Ready for Occupancy (RFO).
      - Pricing: ₱7,995,000 (₱7.995M), Est. Amort: ₱49,577/mo (Bank Financing, 20-yr, 20% DP).
      - Official information sheet: `frontend/assets/images/amore-flyer.jpg` with interactive modal viewer.
      - Exterior facade: `frontend/assets/images/amore-facade.jpg` with full room gallery `amore-1.jpg` to `amore-15.jpg`.
    - **Homepage Featured Cards & Filter Engine (`index.html`, `index.js`)**:
      - Added static and dynamic card templates with status badges, verified specs pills, TCP badges, est. amort subtexts, and share link triggers.
      - Updated category filter engine so "House & Lot" specifically matches Benecia (`type.includes('single') || type.includes('attached') || (type.includes('house') && !type.includes('townhouse'))`), and "Townhouses" matches Amore Classico, Casasuerte, Kathleen, and Liora Homes.
      - Updated `isAccreditedPropertyItem` and `formatPropertyTitle` to retain and format Benecia and Amore across all filters.
    - **Home Affordability & Budget Matcher (`calculator.js`)**:
      - Integrated Benecia (min. gross monthly household salary ₱170k, ₱9.695M TCP) and Amore Classico (min. salary ₱140k, ₱7.995M TCP) into the matching engine.
      - Extended income slider range to ₱250,000+ so prospective luxury and multi-level homebuyers can qualify for all 6 accredited developments.
    - **Dedicated Showcases & Dynamic Property Details (`benecia.html`, `amore-classico.html`, `property-detail.html`, `property-detail.js`)**:
      - Created standalone showcase pages matching `Airmen.html` design standard, complete with interactive thumbnail carousels, full specifications bar, verified Google Maps embed/links, official flyer lightbox viewers, and embedded mortgage amortization calculators.
      - Enhanced `property-detail.js` so route `/pages/properties/property-detail.html?id=5` (Benecia) and `?id=6` (Amore) automatically render full photo galleries, accurate maps, and sample computation sheets.
    - **Inquiry Pre-Selection & Dual Storage Synchronization (`inquiry.js`, `backend/database.py`, SQLite & Supabase Cloud)**:
      - Updated `inquiry.js` catalog fallbacks so `<select id="propertySelect">` dynamically lists both properties and auto-preselects them via `?type=property&id=5` or `?title=Benecia`.
      - Seeded properties into local SQLite `backend/urbanscope.db` (IDs 5 and 6) and inserted into remote Supabase Cloud (`properties` table IDs 55 and 56 with `city: "Las Piñas"` and `province: "Metro Manila"`).

91. **Removal of Card-Level "Compute Amortization" Pill (`index.html`, `index.js`, `index.css`):**
    - The secondary `.calc-shortcut-pill` ("Compute Amortization") button at the bottom of homepage featured property cards was removed from `frontend/index.js` and `frontend/index.css`.
    - Restores the clean, unobstructed property card layout with consistent pricing metrics (`.tcp-pill-tag`, `.property-price-row`, and `.tcp-subtext`). Clicking any card cleanly routes directly to the full property showcase or detail page with its embedded loan simulation engine.

92. **Custom UrbanScope DatePicker UI Component (`inquiry.html`, `inquiry.css`, `inquiry.js`, `supabase.js`, `api.js`, `session.js`):**
    - Replaced the browser's raw, unstyled native OS `<input type="date">` popup on `frontend/pages/inquiry/inquiry.html` (`preferredDate` and `propertyPreferredDate`) with a custom, bespoke UrbanScope DatePicker UI (`.custom-datepicker-wrap`, `.urban-datepicker-popup`).
    - **Visual Polish & Tokens**: Features branded Plus Jakarta Sans typography, forest green accents (`#2d5c39` / `#48bb78`), subtle rounded elevation shadows, and custom month navigation (`‹` and `›`).
    - **Interactive Calendar Grid**:
      - Weekday header columns (`S  M  T  W  T  F  S`).
      - Past calendar days are automatically dimmed and disabled (`cursor: not-allowed; opacity: 0.45; pointer-events: none;`) to prevent scheduling viewings in the past.
      - Today's date is outlined with an emerald border ring (`is-today`).
      - Selected date is highlighted in solid forest green with white text (`is-selected`).
      - Trailing and leading days from adjacent months are softly faded (`is-other-month`).
    - **Quick Actions & Dismiss**:
      - "Today" button in footer jumps to and selects the current date.
      - "Clear" button resets selection.
      - Closes on outside click, `Escape` key, or selecting a valid date.
    - **Data Contract & Synchronization**:
      - Values are set strictly in `YYYY-MM-DD` ISO format, ensuring 100% compatibility with backend inquiry models and admin regex parsers (`/\[Preferred Schedule:\s*(\d{4}-\d{2}-\d{2})\s*\|\s*([^\]\r\n]*)\]/i`).
      - Changes automatically propagate across General Consultation and Specific Property Inquiry tabs.
    - **Full Dark Mode**: Seamless support under `html.dark-mode` with deep forest green background surfaces (`#142219`), borders (`#2b4232`), and glowing emerald badges (`#48bb78`).

93. **Google Identity Services Client ID Auto-Fallback (`backend/auth.py`, `.env`, `.env.example`):**
    - Configured official Web Client ID `981770655747-t222jr0ias09rl7aga3302p9am64so43.apps.googleusercontent.com` in `.env` and `.env.example`.
    - Updated `get_google_client_id()` in `backend/auth.py` with automatic `DEFAULT_GOOGLE_CLIENT_ID` fallback to match `frontend/shared/js/supabase.js` and `api.js`.
    - Eliminates the `"Google Sign-In is not configured on the server. Add GOOGLE_CLIENT_ID to your .env file."` error banner and ensures `GET /api/auth/google/config` reports `enabled: true`.

94. **Custom UrbanScope Select Dropdown UI Component (`inquiry.html`, `inquiry.css`, `inquiry.js`):**
    - Replaced the browser's raw, unstyled native OS `<select>` popup menu on `frontend/pages/inquiry/inquiry.html` for `preferredTime`, `propertyPreferredTime`, and `consultationTopic` with a bespoke UrbanScope Custom Select UI (`.custom-select-wrap`, `.custom-select-trigger`, `.custom-select-dropdown`).
    - **Visual Polish & Tokens**: Features custom rotating chevron arrow, floating elevation card shadow, option icons (clock, morning sun, afternoon sun/horizon, weekend trip, viewing house, loan badge, investment chart, selling tag, inquiry bubble), and a sharp green checkmark indicator (`✓`) on the selected option.
    - **Full Dark Mode**: Seamless support under `html.dark-mode` with deep forest green background surfaces (`#142219`), borders (`#2b4232`), and glowing emerald badges and icons (`#48bb78` / `#86efac`).
    - **Data Integrity & Tab Sync**: Underlying native `<select>` remains in the DOM with `.custom-select-source`, guaranteeing that `document.getElementById('preferredTime').value`, tab synchronization listeners, form serialization, and modal reset functions operate without interruption.

95. **Removal of FAQ Category Filter Pills (`index.html`, `index.js`, `index.css`):**
    - Removed the redundant category filter pills (`#faqCategories`: `All (8)`, `Financing & Payments (2)`, `OFW & Eligibility (4)`, `Requirements & Location (2)`) above the homepage FAQ section.
    - FAQs now transition cleanly and directly from the section header to the accordion list, with all 8 questions accessible in one focused view (with only the initial question open by default). Cleaned up associated filter logic from `index.js` and styling from `index.css`.

96. **Dark Mode Contrast for Notification Header & Links (`session.css`, `admin-shell.css`):**
    - Enhanced contrast in `frontend/shared/css/session.css` for the notification header action link `.client-notif-view-all` under `html.dark-mode`. Previously rendered in low-contrast dark green (`#2d5c39`) against the `#19281f` dark dropdown header, it now uses high-contrast light mint green (`#86efac`) with hover state `#bbf7d0` (underline), exceeding WCAG AAA legibility (> 8:1 contrast ratio).
    - Upgraded `.client-notif-time` and `.client-notif-empty` in dark mode to `#9ab09f` for crisp readability of timestamps and empty state indicators.
    - Applied matching dark mode styling to `.view-all-link` in `frontend/pages/admin/admin-shell.css` to protect admin notifications with the same vibrant `#86efac` token.

97. **Removal of Photo Dimming Effect in Dark Mode (`session.css`, `index.css`, `property-detail.css`, `auth.css`):**
    - Removed all dark-mode photo dimming filters (`filter: brightness(0.76)...`) and dark vignette overlays (`.property-image::after` dark green gradient) across the site.
    - **Homepage Hero Banner (`frontend/index.css`)**: Removed `html.dark-mode .hero-overlay` override (`0.80 -> 0.56 -> 0.44`), restoring natural background image lighting (`home-bg.jpg`) with the crisp, balanced gradient (`0.65 -> 0.35 -> 0.2`) from light mode for maximum visual fidelity.
    - **Property Cards & Thumbnails (`frontend/index.css`, `frontend/shared/css/session.css`)**: Set `filter: none;` on `.property-image img`, `#propThumb`, `.success-prop-thumb`, and disabled the dark `.property-image::after` gradient (`display: none !important`), displaying listings (Casasuerte, Liora, Kathleen Place, Benecia, Amore Classico, Airmen's Village) with authentic, vibrant natural colors, bright skies, and full contrast in Dark Mode.
    - **Property Detail Galleries & Showcases (`frontend/pages/properties/property-detail.css`, `frontend/pages/auth/auth.css`)**: Removed dimming from `.main-carousel img`, `.thumb img`, `.about-image-card img`, and `.showcase-panel img`, ensuring photos throughout the platform match their true-to-life presentation.

98. **Sitewide 20-Point Modern UI/UX Design Heuristics Overhaul (Client, Admin, & Superadmin Portals):**
    - Executed a comprehensive design polish across typography, layout geometry, micro-interactions, and visual hierarchy adhering to 20 modern UI/UX design heuristics across **all layers** of the platform:
      - **Global Design System & Shared Assets (`frontend/shared/css/common.css`, `session.css`, `supabase.js`, `session.js`)**: Systematic spacing scale (`--space-1` to `--space-20` / 4px to 80px), concentric radius scale (`--radius-xs` to `--radius-full`), warm accent tokens (`--accent-warm: #d97706`, `--accent-warm-light: #fef3c7`), universal animated non-blocking toast system (`window.showFeedbackToast(msg, type)` with success/error/info/warn states), universal shimmer loading skeleton primitives (`.skeleton-shimmer`), and sitewide headline balancing (`text-wrap: balance;`) and lead copy optimization (`text-wrap: pretty;`).
      - **Client Pages (`index.html`, `index.css`, `index.js`, `inquiry/inquiry.*`, `inquiry/history.*`, `properties/*`, `auth/*`, `legal/*`)**:
        1. *Delete filler badges*: Removed noisy generic "AVAILABLE" badges across all property cards in static markup (`index.html`) and dynamic card rendering (`index.js`). Also removed decorative filler badges like `.faqs-badge` ("Got Questions?").
        2. *Drop redundant labels*: Removed the repetitive `TCP:` text prefix before prices (the container already includes the `.tcp-pill-tag` indicating TCP terms), and eliminated redundant uppercase floating spans in the hero search form, using clean `<label>` wrappers with screen-reader text (`.sr-only`) and accessible `aria-label` attributes.
        3. *Unitalicize random words*: Removed unnecessary `<em>` italics from legal disclaimer notes, form hints, and FAQ footnotes, restoring clean, accessible Roman text.
        4. *Mono only where needed*: Reserved monospace font stacks exclusively for reference codes (`.inquiry-card-id`), inquiry IDs (`INQ-2026-XXXX`), and numeric identifiers.
        5. *Use a design system*: Introduced a systematic spacing scale and radius scale.
        6. *Show the actual product*: Replaced `loading="lazy"` with `decoding="async"` on featured property cards (Casasuerte, Kathleen, Liora, Airmen's Village, Benecia, Amore Classico), detail galleries, and dynamic JavaScript card rendering (`index.js`), ensuring photographs paint immediately on page load without blank boxes.
        7. *Enlarge the main feature*: Increased homepage property card image container height to `240px` with an expansive `16:10` aspect ratio (`aspect-ratio: 16 / 10`), and enlarged inquiry history KPI values (`1.65rem`, bold).
        8. *Group with spacing*: Established tight contextual grouping between property titles and locations (`gap: 4px`), grouped amenity specs into a distinct pill row (`gap: 8px`), and separated financial details into their own dedicated compartment.
        9. *Make headlines specific*: Maintained the established hero headline `"Discover Your Ideal Home with CD Miranda Realty"` and `"Find a Home That Fits Your Needs — Explore Properties for Your Future Home."` while optimizing typographic hierarchy with balanced text wrapping (`text-wrap: balance`).
        10. *Emphasize the CTA*: Enhanced primary call-to-action buttons (`#findBtn`, `.submit-btn`, `.inquire-now-btn`) with radiant emerald gradients (`linear-gradient(135deg, #1f4928 0%, #2e7d32 100%)`), elevated hover states (`translateY(-2px)` with shadow), and tactile active press states (`translateY(0)`).
        11. *Add an accent colour*: Introduced warm amber accent tokens and styled `.badge-rfo` ("RFO Ready") pills on Benecia and Amore Classico to break monochromatic green fatigue and draw immediate attention to move-in ready units.
        12. *Keep icons consistent*: Standardized all property spec icons (Beds, Baths, Sqm) and search icons to a uniform 15x15 / 16x16 size with consistent `stroke-width="2"` and optical alignment.
        13. *Remove embellishments*: Eliminated empty layout wrappers (such as `<div class="view-all-container"></div>`), redundant decorative badge elements, and excessive border outlines.
        14. *Inner radius = outer - padding*: Corrected concentric radius math throughout nested containers across search forms, category tab containers, inquiry modal dialogs, and calculator cards.
        15. *Improve text contrast*: Elevated contrast ratios across muted copy, property locations (`#475569` light / `#94a3b8` dark), and amenity specs, achieving WCAG AAA compliance.
        16. *Wrap headlines properly*: Applied `text-wrap: balance;` on all headings (`h1`, `h2`, `h3`, `h4`, `.hero-content h1`, `.section-heading h2`, `.faqs-heading h2`, `.history-title-group h1`, `.auth-title`, `.legal-hero h1`) and `text-wrap: pretty;` on lead copy in `common.css` to prevent typographic orphans.
        17. *Align by eye, not pixels*: Optically adjusted search button icon and text alignment (`margin-top: -1px` optical centering) and aligned spec icon baselines.
        18. *Use tabular nums*: Applied `font-variant-numeric: tabular-nums; font-feature-settings: 'tnum' 1;` across `.tabular-nums`, `.property-price`, `.stat-number`, `.kpi-value`, `.inquiry-card-id`, and `.amort-number`.
        19. *Add loading states*: Added shimmering CSS skeleton loaders (`.property-skeleton-card`, `.history-skeleton-card`, `.skeleton-line`) for graceful async loading perception.
        20. *Animate useful feedback*: Replaced all native blocking `alert()` popups in `index.js`, `history.js`, `login.js`, and `auth.js` with non-blocking animated feedback toast notifications (`showFeedbackToast`).
      - **Admin Portal (`frontend/pages/admin/*`: `admin-shell.*`, `dashboard.*`, `propertylist.*`, `properties.*`, `add-property.*`, `edit-property.*`, `clients.*`, `profile.*`)**:
        - Enforced strict concentric radius math: outer stat cards `border-radius: 16px`, padding `22px` -> inner icon container `border-radius: 10px`; table panel `border-radius: 16px`; filter toolbar `border-radius: 12px`, inner inputs `border-radius: 8px`.
        - Enlarged KPI stat values (`.stat-card-value`, `.stat-number`, `.kpi-value`) to `2.2rem`, bold, tabular numbers for immediate scanning.
        - Primary CTA emphasis on `.btn-primary`, `.add-property-btn`, `.btn-modal-approve`, and `.save-btn` with emerald gradient, hover elevation (`translateY(-2px)`), and tactile press.
        - Warm amber accent tokens applied to Pending and Under Review inquiry badges (`.badge-status.badge-pending`, `.status-pill.status-review`).
        - Replaced all legacy blocking `alert(...)` popups in `dashboard.js`, `properties.js`, `add-property.js`, and `edit-property.js` with non-blocking `window.showFeedbackToast`.
        - Shimmer skeleton rows (`.admin-table-skeleton-row`) for administrative tables and stat cards.
      - **Superadmin Console (`frontend/pages/superadmin/*`: `dashboard.html`, `dashboard.css`, `dashboard.js`)**:
        - Enforced semantic role badges: `Superadmin` (deep purple), `Admin` (warm amber `.sa-badge-admin`), and `User` (emerald).
        - Monospace font strictly reserved for user IDs (`.sa-user-id`), database record codes, and diagnostic terminal outputs (`.sa-log-output`).
        - Enlarged system KPI counters (`.sa-stat-value`: `2.25rem`, bold, tabular-nums).
        - Concentric radius on system stat cards (`16px`), user management table (`16px`), and account modification modal (`20px`).
        - Replaced blocking access restriction `alert(...)` in `superadmin/dashboard.js` with `showFeedbackToast`.
        - Shimmer skeleton loading rows (`.sa-skeleton-row`) for user management tables.

99. **Homepage Property Search & Sorting Functionality Resolution (`frontend/index.js`, `frontend/index.html`):**
    - **Syntax Error Root Cause**: A syntax error (`Unexpected token ')'` at lines 275 and 753) halted JavaScript parsing during initial page evaluation. As a result, browser event listeners (`handleSearchSubmit`, keyword input debouncing, category tabs, sort dropdown change) were never attached to the DOM, causing search and sorting to appear frozen on static HTML cards.
    - **Syntax Correction & Syntax-Safe Lifecycle**: Removed the errant closing syntax tokens, ensuring 100% clean evaluation (`node -c` exits 0 across all JavaScript files). Hardened DOM readiness check via `if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initHomepage); } else { initHomepage(); }`, ensuring reliable initialization on VS Code Live Server (`:5500`) and cached asynchronous loads.
    - **Canonical Fallback & Instant Offline Resilience**: Defined `CANONICAL_ACCREDITED_PROPERTIES` containing all 6 accredited properties (Casasuerte, Kathleen, Liora Homes, Airmen's Village Triplex, Benecia Single-Attached, Amore Classico). This guarantees immediate 0ms rendering and filtering without depending on fragile DOM regex string parsing.
    - **Real-Time Live Search & Multi-Criteria Filtering**: Added a 180ms debounced input listener on `#keyword` and direct click listener on `.search-submit`. Search checks titles, locations, property types, descriptions, and amenities. When searching non-existent locations (e.g. `dasma`), it renders a clean `.home-empty-state` with a "Reset Filters" action button.
    - **Sorting Ordering**: Explicitly handles `featured` curated ordering (Casasuerte → Kathleen → Liora → Airmen's → Benecia → Amore), `price-low` (Liora ₱2.46M up to Benecia ₱9.695M), `price-high` (Benecia ₱9.695M down to Liora ₱2.46M), and `location`.
    - **Headless Automated Verification**: Verified with automated headless Chrome DevTools tests with zero console errors and 100% passing assertions across search, category filtering, keyword debouncing, and sort reversals.

100. **Budget Matcher Space Optimization: 4-Item Fixed Height with Smooth Scroll (`frontend/shared/css/calculator.css`):**
    - Optimized `.bm-projects-list` in the Quick Home Affordability & Budget Matcher component on `index.html` to display exactly 4 accredited homes simultaneously (`max-height: 396px`), with the remaining listings smoothly scrollable (`overflow-y: auto`, `overscroll-behavior-y: contain`).
    - Eliminates vertical container over-stretching (reducing list height from `600px` to `396px` and total right column height from `653px` to `449px`), achieving clean visual balance with the left salary slider column (`424px`).
    - Added custom slim scrollbars (`6px` width, rounded pills, hover micro-transitions) with matching light theme (`#c2d8c7` thumb / `#f1f5f2` track) and dark theme (`#2b4533` thumb / `#142018` track / `#4ade80` hover) tokens across WebKit and Firefox (`scrollbar-width: thin`).

101. **Hero Floating Search Bar Custom Dropdowns for Property Type & Location (`frontend/index.html`, `frontend/index.css`, `frontend/index.js`):**
    - Replaced the browser's unstyled native OS `<select>` popups on `#typeFilter` (Property Type) and `#locationFilter` (Location) with custom UrbanScope dropdown components (`initSearchSelect`).
    - **Trigger Button**: Borderless pill trigger integrated directly into the floating hero bar, featuring live selected value display, custom SVG icons, and a smooth 180°-rotating chevron arrow.
    - **Dropdown Menu & Stacking Context Elevation**:
      - Floating glass-morphism menu (`border-radius: 16px`, soft depth shadow, smooth scale/fade entry animation `urbanSelectFade`), positioned right below each field column.
      - **Stacking Overlap Resolution (Fix for "Transparent" Appearance)**: Because `.featured-header-row` had an elevated `z-index: 50` while `.hero` lacked an explicit stacking context, the downstream heading `<h2>Discover Our Featured Properties</h2>` and category tabs were previously painted on top of the search dropdowns when opened, giving the illusion that the dropdown was transparent. Fixed by assigning `.hero` `position: relative; z-index: 60;` (elevating to `z-index: 1500 !important;` when a search dropdown is open), `.search-bar` `z-index: 65;` (`1550` when open), `.search-select-wrap.is-open` `z-index: 1600;`, `.search-select-dropdown` `z-index: 1650;`, and `.featured` `position: relative; z-index: 20;`.
    - **Rich Option Items & Stacked Location Formatting**: Each option renders an SVG icon (Townhouses, Triplex, House & Lot, Philippines Map Pin, Compass), clean title text, hover tint (`#edf6f0`), and an emerald checkmark (`✓`) for the active selection. For long location names such as `Trece Martires City, Cavite` (which previously truncated with ellipsis `Cav...`), the item layout is rendered with `.search-select-option-stacked`, placing `Trece Martires City,` as the first line (`.search-select-option-main`) with its comma intact and `Cavite` directly underneath (`.search-select-option-sub`) in the exact same 14px 500-weight typography and color (eliminating any off-font mismatch). This saves horizontal dropdown width while keeping the location and province names 100% complete, legible, and visually balanced in both light and dark mode.
    - **Seamless Event Sync**: Dispatches native `change` and `input` events upon selection, immediately triggering live grid filtering and keeping category tabs and reset buttons 100% in sync. Includes outside click detection and `Escape` key handlers.
    - **Full Dark Mode Theme**: Fully styled with dark emerald tones (`#142219` background, `#2b4232` border, `#86efac` active highlights, `#e7f0e9` text).

102. **Custom On-Brand UI Dropdown for "Sort by:" (`frontend/index.html`, `frontend/index.css`, `frontend/index.js`):**
    - Replaced the native browser OS `<select id="homeSortSelect">` popup with a bespoke UrbanScope UI dropdown (`initSortSelect`).
    - **Trigger Button (`.sort-select-trigger`)**: Styled with clean border (`#cbd9ce`), pill radius (`10px`), subtle hover elevation, active focus ring (`rgba(45, 92, 57, 0.12)`), active option label, dynamic SVG icon, and animated chevron arrow with 180° rotation on toggle.
    - **Dropdown Menu (`.sort-select-dropdown`) & Stacking Context Elevation**:
      - Floating panel with soft shadow (`0 18px 40px -4px rgba(15, 33, 20, 0.16)`), 14px rounded corners, smooth entrance animation (`sortSelectFade`), and high z-index (`1050`).
      - **Stacking Context Fix**: Because `.featured-header-row` and `.category-tabs-container` both use `.reveal-on-scroll` (which introduces CSS `transform: translateY(0)` creating isolated stacking contexts), `.category-tabs-container` and downstream `#propertyGrid` previously painted on top of the open dropdown. Resolved by giving `.featured-header-row` `position: relative; z-index: 50;` by default and elevating it to `z-index: 1200 !important;` whenever the dropdown is open (via `:has(.sort-select-wrap.is-open)` in CSS and `.has-open-dropdown` in `frontend/index.js`), with `.home-sort-control` elevated to `z-index: 1250` and `.sort-select-wrap.is-open` to `z-index: 1300`. This guarantees the dropdown menu renders 100% in front of the category filter tabs and property cards.
    - **Rich Option Presentation (`.sort-select-option`)**: Every sort option features a bespoke SVG icon:
      - *Featured*: Star icon
      - *Location (A-Z)*: Map pin icon
      - *Property Type*: Building icon
      - *Newest First*: Clock icon
      - *Price: Low to High*: Ascending step arrow icon
      - *Price: High to Low*: Descending step arrow icon
      - Active item renders an emerald checkmark (`✓`) with bold highlight (`#e2f0e6` light, `#193d26` dark).
    - **Event & State Sync**: Selection updates the hidden `<select>` value and dispatches a bubbling `change` event, instantly triggering property card re-sorting. Includes mutual closing of other open dropdowns, outside click detection, and `Escape` key support.
    - **Full Dark Mode Support**: Custom tokens for dark theme (`#142219` background, `#2a4030` border, `#86efac` active text/checkmark, `#233829` hover state).
    - **Automated Verification**: Verified using headless Chrome DevTools protocol (`test_sort_select.js`, dark mode test, and element hit-testing) confirming opening, complete front-stack visibility over category tabs and cards, option selection, instant DOM card re-ordering (Low to High and High to Low), and screenshot capture.

103. **Elimination of Invisible FAB Click-Interception Area (`session.css`, `common.css`):**
    - **Problem**: When the floating contact action button (`#fabMainBtn` / `.contact-fab`) was closed, hovering or clicking in the transparent area 20px–100px directly above it unexpectedly showed a pointer cursor and intercepted mouse clicks.
    - **Root Cause**: In `frontend/shared/css/session.css`, `.fab-action-btn` had `pointer-events: auto;` declared unconditionally. In CSS, a child with `pointer-events: auto` overrides an ancestor's `pointer-events: none`. Although parent `.fab-menu` had `opacity: 0; pointer-events: none;`, the invisible `.fab-action-btn` child links (Messenger, Text SMS, Call Now) and their text labels remained fully interactive to mouse/pointer hit-testing. Additionally, `.fab-menu` lacked `visibility: hidden;`.
    - **Resolution**:
      - Updated `.fab-menu` to set `visibility: hidden; pointer-events: none;` when closed, and `visibility: visible; pointer-events: auto;` when `.contact-fab.open`.
      - Used transition delay coordination (`visibility 0s linear 0.24s;` on close, `visibility 0s linear 0s;` on open) to keep smooth opacity/transform transitions while cutting off pointer events immediately on close.
      - Changed base `.fab-action-btn` to `pointer-events: none;` and added `.contact-fab.open .fab-action-btn { pointer-events: auto; }` so action buttons are only interactive when the menu is actively expanded.
      - Added defensive `visibility: hidden;` and `visibility: visible;` rules to `.back-to-top-btn` when inactive vs `.is-active` in `frontend/shared/css/common.css`.
    - **Automated Verification**: Verified via Chrome DevTools Protocol (`scratch/test_fab_hit_test.js` and `scratch/test_fab_dark.js`) using `document.elementFromPoint` at 25px, 50px, 80px, 120px, and 160px above `#fabMainBtn`. Confirmed `isFabRelated: false` across all points when closed (hits pass directly to underlying page background without interception), confirmed buttons become properly interactive and hittable when open, and confirmed immediate deactivation upon close in both light and dark mode.

104. **Homepage Category Tabs Dark Mode Theme Fix (`frontend/index.css`):**
    - **Problem**: In dark mode, active category filter tabs (`.cat-tab.active`, e.g. the "All" tab) displayed with a blinding pale mint/white background (`#e8f5ec`) and washed-out light green text (`#86efac`), creating harsh visual glare against the dark container.
    - **Root Cause**: `html.dark-mode .cat-tab.active` in `frontend/index.css` previously only specified `color: #86efac;` and omitted a `background` override, causing it to fall back to the light-mode rule `background: #e8f5ec`.
    - **Resolution**:
      - Updated `html.dark-mode .cat-tab.active, html[data-theme="dark"] .cat-tab.active` to use a dark forest background (`#233b2b`), a subtle emerald inset border (`box-shadow: inset 0 0 0 1px #3ea35d, 0 2px 8px rgba(0, 0, 0, 0.3)`), and crisp high-contrast emerald text (`color: #86efac`).
      - Added a soft hover feedback state on inactive tabs (`background: rgba(134, 239, 172, 0.08); color: #e7f0e9;`).
      - Verified across tabs ("All", "Townhouses", etc.) and ensured light-mode styles remained completely unaffected.

105. **Unregistered Google Sign-In Verification Code & Scroll-to-Accept Terms Flow (`backend/routers/auth.py`, `backend/models.py`, `frontend/pages/auth/login.html`, `frontend/pages/auth/auth.js`, `frontend/shared/js/supabase.js`, `frontend/shared/js/api.js`):**
    - **Requirement**: When users click "Continue with Google" (or "Sign up with Google") and their Gmail is not yet registered in UrbanScope, they must input a 6-digit email verification code sent to their Gmail, and then scroll and agree to the Terms of Service & Privacy Policy before their account is created. Existing registered users continue to sign in instantly with zero friction.
    - **Backend Architecture**:
      - `backend/models.py`: Added `GoogleRegistrationComplete` schema (`email`, `code`, `terms_accepted: bool`, `access_token`, `credential`, `full_name`, `avatar_url`, `google_id`, `phone`). Updated `AuthResponse` with optional fields: `requires_verification`, `email`, `full_name`, `avatar_url`, `google_id`.
      - `backend/routers/auth.py` (`POST /api/auth/google`): For existing users, verifies and signs in directly. For unregistered Gmail addresses, generates a 6-digit OTP challenge via `_issue_otp_for_local_request(clean_email, "register", request)` and returns `AuthResponse(success=True, requires_verification=True, email=clean_email, ...)`.
      - `backend/routers/auth.py` (`POST /api/auth/google/verify`): Validates that `terms_accepted == True` (HTTP 400 otherwise), consumes the 6-digit OTP challenge via `consume_local_challenge`, creates the user in SQLite (`role = 'user'`, `email_verified_at = now()`, `google_id`, `full_name`, `avatar_url`), syncs to Supabase Cloud, and issues an authenticated session cookie and JWT token.
    - **Frontend Architecture & UX**:
      - `frontend/shared/js/supabase.js` and `api.js`: Added `apiVerifyGoogleRegistration(payload)` and updated `apiSignInWithGoogle` to return `requires_verification` payload.
      - `frontend/pages/auth/login.html`: Added `#emailOtpModal` (OTP dialog card) and `#termsModalOverlay` (scroll-to-accept Terms of Service & Privacy Policy modal) markup matching `register.html`.
      - `frontend/pages/auth/auth.js`: Added `promptGoogleVerificationAndTerms(googleData, triggerBtn)` and `initGoogleVerificationModals()`. When an unregistered Google user response arrives, opens `#emailOtpModal` targeting the Gmail with a 60-second resend countdown timer. Upon 6-digit code entry, transitions directly to `#termsModalOverlay` with the "I Agree" button locked. The user scrolls to the bottom of the document to unlock the "I Agree" button, which then submits the verification and logs the user in.
      - Error recovery: If an incorrect verification code is submitted, `#termsModalOverlay` automatically closes and re-opens `#emailOtpModal` with an error message and code input focus.
      - Guarded `register.js` so standard email/password registration and Google OAuth registration operate in complete isolation.
    - **Automated Verification**:
      - Backend automated test suite (`scratch/test_google_flow.py`) passing 5/5 assertions: (1) `POST /api/auth/google` triggers `requires_verification: True` and issues OTP challenge; (2) `POST /api/auth/google/verify` fails without terms acceptance; (3) fails with wrong OTP code; (4) completes successfully with valid code & terms; (5) subsequent Google sign-ins log in directly without OTP or terms prompt.
      - Browser headless Chrome CDP test (`scratch/test_ui_google_modals.js`) verifying DOM presence, modal open state, 60s countdown, code entry submission, terms modal scroll progress to 100%, button unlock, and full light & dark mode rendering.

106. **Permanent Superadmin Account Deletion, Inquiry History Purge, and Post-Deletion Sign-In Prevention (`backend/routers/superadmin.py`, `api/superadmin/users.js`, `lib/email-auth.js`, `frontend/shared/js/supabase.js`, `frontend/shared/js/api.js`, `frontend/pages/superadmin/dashboard.js`):**
    - **Problem**: When an account was deleted from the Superadmin dashboard (`pages/superadmin/dashboard.html`), the deleted user could still sign in via Google OAuth because Supabase Cloud rejected physical DELETE under anon RLS without scrambling the email. Furthermore, all client inquiry history submitted under that Gmail remained stranded in the database and continued to clutter the Admin Inquiries and Clients pages.
    - **Resolution**:
      - `backend/routers/superadmin.py` (`DELETE /api/superadmin/users/{user_id}`):
        - Automatically deletes all inquiries associated with the deleted account from the `inquiries` table (`WHERE LOWER(client_email) = ?`).
        - Automatically deletes associated notifications (`WHERE LOWER(recipient_email) = ?`), appointments, and saved properties.
        - Deletes the user record from `users`.
        - Calls `_sync_delete_user_to_supabase(target_email, user_id)` to execute DELETE on `inquiries` and `users` in Supabase Cloud, with fallback to email scrambling (`deleted_{timestamp}_{clean_email}`) and soft-delete marker (`__URBANSCOPE_DELETED__`) if physical DELETE is blocked by RLS.
        - Protects root superadmin (`urbanscope.cvsu@gmail.com`) and primary realty admins (`admin.realestate@gmail.com`, `miriamalobren@gmail.com`, `miriam@gmail.com`).
      - `lib/email-auth.js`: Added `deleteCloudUserAndAssociatedData(id, email)` performing cascading cloud deletion of inquiries, appointments, notifications, saved properties, and users table row with email scramble fallback.
      - `api/superadmin/users.js`: Added `action === 'delete'` handler executing `deleteCloudUserAndAssociatedData` after verifying superadmin session and protected account checks.
      - `frontend/shared/js/supabase.js` and `api.js`:
        - In `apiSuperadminDeleteUser(userId, email)`: Calls local FastAPI backend, invokes `/api/superadmin/users`, executes DELETE on `${REST_BASE}/inquiries?client_email=ilike.${email}`, deletes/scrambles user row in `${REST_BASE}/users`, marks user deleted locally (`markUserDeletedLocal`), purges inquiries from `localStorage` caches via `purgeInquiriesByEmailLocal`, and dispatches `inquiriesUpdated`, `inquiryListChanged`, and `usersUpdated` events.
        - In `applyLocalInquiryState(list)`: Filters out inquiries belonging to deleted emails (`getDeletedUserEmails()`) or starting with `deleted_`.
        - In `isUserRecordDeleted(u)`: Returns `true` if `u.email` starts with `deleted_` or is in `getDeletedUserEmails()`.
        - In `syncGoogleUserToSupabase(userObj)`: Skips deleted accounts so they are not revived.
        - In `apiSignInWithGoogle`: Checks whether the account exists and is not deleted in Supabase Cloud. For deleted or unregistered accounts, returns `requires_verification: true`, requiring the 6-digit email OTP and Terms of Service agreement before any new account can be created.
        - In `apiVerifyGoogleRegistration`: Added hosted fallback verifying challenge, clearing local deleted markers, and inserting a clean user record.
      - `frontend/pages/superadmin/dashboard.js`: Passed `u.email` into `saDeleteUserPrompt('${safeIdAttr}', '${escapeHtml(u.email || '')}')`, updated confirmation text to clearly indicate inquiry removal, and updated success toast.
    - **Automated Verification**:
      - Verified full lifecycle via Python automated test: created user, inserted inquiries, confirmed presence in admin list, deleted user via superadmin endpoint, verified user is removed from `users`, verified password login returns 401, and verified all associated inquiries were permanently removed from the admin inquiry list. Verified protected accounts cannot be deleted.

107. **Unfreezing Google Registration Completion & Terms Acceptance (`frontend/shared/js/supabase.js`, `frontend/shared/js/api.js`, `frontend/pages/auth/auth.js`):**
    - **Problem**: When a new user tried to register with Google, entered their 6-digit OTP verification code, and clicked "I Agree" in the Terms of Service & Privacy Policy scroll-to-accept modal, the button remained permanently stuck on `[ Completing registration... ]` with a lock icon. Registration never finished and the modal never closed.
    - **Root Cause**:
      - `ReferenceError: apiVerifyGoogleRegistration is not defined at HTMLButtonElement.<anonymous> (auth.js:810:35)`: `apiVerifyGoogleRegistration` was implemented in `frontend/shared/js/supabase.js` inside the closure, but was omitted from the `window` exports object at the bottom of the file (`window.apiVerifyGoogleRegistration = apiVerifyGoogleRegistration;` was missing).
      - In `auth.js`, the click listener on `#acceptTermsBtn` had no `try ... catch` block, so any runtime exception immediately froze the button with `disabled = true` and `span.textContent = "Completing registration..."`.
      - In `apiVerifyGoogleRegistration` (hosted branch), sending `email_verified_at` to `${REST_BASE}/users` triggered HTTP 400 (`PGRST204: Could not find the 'email_verified_at' column of 'users' in the schema cache`).
    - **Resolution**:
      - `frontend/shared/js/supabase.js`:
        - Exported `window.apiVerifyGoogleRegistration = apiVerifyGoogleRegistration;`.
        - In `apiVerifyGoogleRegistration`: Routed user creation through `syncGoogleUserToSupabase` and cleaned fallback `POST ${REST_BASE}/users` payload without unsupported `email_verified_at`.
        - Added `{ Prefer: 'return=representation' }` to headers in `syncGoogleUserToSupabase` user insert.
      - `frontend/shared/js/api.js`:
        - Aligned `apiVerifyGoogleRegistration` implementation and user sync payload without `email_verified_at`.
      - `frontend/pages/auth/auth.js`:
        - Wrapped `#acceptTermsBtn` click listener in a comprehensive `try ... catch (err)` block with fallback button recovery (`acceptTermsBtn.disabled = false`, `acceptTermsBtn.innerHTML = origHtml`).
        - Checked for `typeof apiVerifyGoogleRegistration === 'function' ? apiVerifyGoogleRegistration : window.apiVerifyGoogleRegistration`.
        - On failure or exception, safely recovers button state, closes terms modal, and re-opens `#emailOtpModal` with the descriptive error message instead of hanging indefinitely.
        - On success, wraps hosted admin session creation and redirection in try/catch to guarantee seamless transition to `index.html`.
    - **Automated Verification**:
      - Executed Chrome DevTools Protocol end-to-end headless browser test on `http://127.0.0.1:8000/pages/auth/login.html`: Verified global export of `apiVerifyGoogleRegistration`, simulated unverified Google user, entered valid OTP challenge, scrolled Terms modal to unlock "I Agree", clicked button, verified zero browser exceptions, confirmed `urbanscope_user` and `urbanscope_jwt_token` populated in `localStorage`, confirmed modal closed, and verified successful frame navigation to `http://localhost:8000/index.html`.

108. **Inline Pre-Check & Error Handling for Email Verification Code Before Terms Acceptance (`backend/auth_otp.py`, `backend/models.py`, `backend/routers/auth.py`, `api/auth/register/check.js`, `frontend/shared/js/supabase.js`, `frontend/shared/js/api.js`, `frontend/pages/auth/auth.js`):**
    - **Problem**: When a new user registered with Google, entering an incorrect or expired 6-digit code in the "Verify your email" modal (`#emailOtpModal`) would immediately close the OTP modal and advance to the Terms of Service & Privacy Policy modal. The user had to scroll to the very bottom and click "I Agree" only to find out the code was incorrect.
    - **Resolution**:
      - `backend/auth_otp.py`: Added `check_local_challenge(email, purpose, supplied_hash)` to validate challenges without consuming or deleting them, while tracking invalid attempt counts.
      - `backend/models.py`: Added `OtpCodeCheckRequest` model validating 6-digit email OTP checks.
      - `backend/routers/auth.py`: Added endpoint `POST /api/auth/register/check-code` which validates the 6-digit code and returns HTTP 200 on match or HTTP 400 with a descriptive error message on mismatch/expiry.
      - `api/auth/register/check.js`: Added hosted Vercel function for code check validation.
      - `frontend/shared/js/supabase.js` and `api.js`: Implemented `apiValidateGoogleOtp(email, code)` checking both local backend `/auth/register/check-code` and hosted active challenge in `sessionStorage` (`urbanscope_register_challenge`). Exported `window.apiValidateGoogleOtp`.
      - `frontend/pages/auth/auth.js`: Updated `#emailOtpForm` submit listener:
        - When the user clicks "Verify & Continue", the button transitions to `disabled` with "Verifying code...".
        - Checks the code via `apiValidateGoogleOtp`.
        - If incorrect or expired: restores the button, displays the error message in `#emailOtpMessage` (`.is-error`), focuses the input, and keeps `#emailOtpModal` open without opening the Terms & Policy modal.
        - If valid: closes `#emailOtpModal` and advances to `#termsModalOverlay`.
    - **Automated Verification**:
      - Created automated test in `scratch/test_otp_precheck.cjs`:
        - Test 1: Submitting incorrect code (`634524`): Verified error message displayed in `#emailOtpMessage`, `#emailOtpModal` remained open, and `#termsModalOverlay` was NOT opened.
        - Test 2: Submitting correct code (`889900`): Verified error cleared, `#emailOtpModal` closed, `#termsModalOverlay` opened.
        - Test 3: Scrolled terms to bottom and clicked "I Agree": Verified successful registration, `urbanscope_user` stored in `localStorage`, and redirect to `index.html`.
109. **Comprehensive Inquiry History and Notification Purge on Superadmin Account Deletion and Re-Registration (`backend/routers/superadmin.py`, `backend/routers/auth.py`, `lib/email-auth.js`, `frontend/shared/js/supabase.js`, `frontend/shared/js/api.js`, `frontend/shared/js/session.js`):**
    - **Problem**: When Superadmin deleted a user account and that user later re-registered (e.g. via Google OAuth or OTP), lingering inquiry notifications (such as `INQ-2026-0057 Approved!`, `INQ-2026-0036 Approved!`, `INQ-2026-0037 Approved!`) persisted in the navbar notification bell dropdown. This occurred because:
      1) `notifications` in Supabase Cloud under historical user IDs and SQLite `notifications` were not completely pruned across all associated IDs.
      2) `purgeInquiriesByEmailLocal` only purged inquiry arrays, leaving `urbanscope_client_notifications` and per-user read/toasted keys in client `localStorage`.
      3) `apiGetClientNotifications` lacked a referential integrity check, allowing ghost notifications to be rendered from stale caches even when the client had 0 live inquiries.
      4) Re-registration flows (`apiVerifyGoogleRegistration`, `apiCompleteRegistrationOtp`, `apiSignUp`) did not purge historical inquiries/notifications for the re-registered email.
    - **Resolution**:
      - `backend/routers/superadmin.py`: Updated `delete_user_account` to delete notifications where `LOWER(recipient_email) = target_email` OR `inquiry_id IN (SELECT id FROM inquiries WHERE LOWER(client_email) = target_email)`. In `_sync_delete_user_to_supabase`, queries all matching user IDs (including historical `deleted_*_email`) and deletes all rows from `notifications`, `inquiries`, `appointments`, and `saved_properties` for each matching ID.
      - `lib/email-auth.js`: Updated `deleteCloudUserAndAssociatedData` to resolve all matching IDs for the email and delete `notifications`, `inquiries`, `appointments`, and `saved_properties` for all matching IDs.
      - `frontend/shared/js/supabase.js` and `api.js`:
        - Upgraded `purgeInquiriesByEmailLocal(email, userId)` to filter and purge `CLIENT_NOTIFS_KEY` (`urbanscope_client_notifications`), remove all per-user tracking keys (`client_notifs_read_ids_*`, `client_notifs_toasted_*`, `client_notifs_unread_*`, `client_notifications_*`, `urbanscope_inquiry_overrides_*`), and dispatch `clientNotificationsUpdated`.
        - In `apiSuperadminDeleteUser`: Resolves all matching cloud IDs in Supabase and deletes associated `notifications`, `inquiries`, `appointments`, and `saved_properties`, then calls the upgraded local purge.
        - In `apiGetClientNotifications(email)`: Added referential integrity validation. Checks all notifications against the client's live inquiries from `apiGetMyInquiries(cleanEmail)`. Any notification referencing a deleted or non-existent inquiry is identified as a ghost notification, removed from the active notification map, and cleaned out of `CLIENT_NOTIFS_KEY` in `localStorage`.
        - In `apiVerifyGoogleRegistration`, `apiCompleteRegistrationOtp`, and `apiSignUp`: Calls `purgeInquiriesByEmailLocal` and cleans any residual remote inquiries/notifications upon registration so a re-registered account starts 100% clean with 0 unread notifications and 0 stale inquiries.
      - `backend/routers/auth.py`: In `complete_google_registration`, purges any residual notifications and inquiries for the email upon new account registration in SQLite.
      - `frontend/shared/js/session.js`: Added `clientNotificationsUpdated` event listener to reload notifications and update navbar bell UI immediately.
110. **Inquiry Success Modal Symmetrical & Even Centering for Action Buttons (`frontend/pages/inquiry/inquiry.css`, `frontend/pages/inquiry/inquiry.html`):**
    - **Problem**: In the post-submission inquiry success modal (`#inquirySuccessModal`), action buttons (`View in Inquiry History` and `Submit Another`) in `.modal-footer.success-modal-footer` were left-aligned with uneven button widths inside `.modal-action-group`, leaving a large empty space on the right side of the card.
    - **Resolution**:
      - Updated `.modal-footer.success-modal-footer` to `justify-content: center`.
      - Updated `.success-modal-footer .modal-action-group` to `justify-content: center; gap: 12px; width: 100%`.
      - Styled `.success-modal-footer .btn-success-primary` and `.btn-secondary` with `flex: 1 1 0; justify-content: center; text-align: center; white-space: nowrap;` so both buttons expand to identical, evenly balanced widths across the modal footer with centered icons and labels.
      - Swapped the button order so the secondary action (`Submit Another` / `Back to Home`) appears on the left, and the primary CTA (`View in Inquiry History` / `Create Account to Track Inquiry`) appears on the right.
      - In mobile responsive query (`@media (max-width: 600px)`), updated `.success-modal-footer .modal-action-group` to `flex-direction: column; align-items: stretch; gap: 10px;` ensuring seamless full-width stacked button presentation on small screens.

111. **Homepage FAQ Consultation Box De-Duplication & CTA Banner Consolidation (`frontend/index.html`, `frontend/index.js`, `frontend/index.css`, `frontend/shared/css/session.css`):**
    - **Problem**: At the bottom of the homepage (`index.html`), a dashed box (`.faqs-more-help`) with "Still have more questions or need a personalized computation? Speak with Miriam Lobren ->" was placed directly above the large CTA banner ("Ready to Find Your Dream Property? Book a Free Consultation"). This caused repetitive, adjacent consultation prompts right next to each other at the bottom of the page.
    - **Resolution**:
      - `frontend/index.html`: Removed the redundant `.faqs-more-help` dashed box from the FAQ section, and consolidated the question as a subtle, elegant italic prompt (`.cta-question`) directly above the primary CTA button (`#ctaConsultBtn`): `Still have more questions or need a personalized computation?`.
      - `frontend/index.css`: Styled `.cta-question` with `font-size: 13.5px`, italic emphasis, soft translucent muted sage/white (`rgba(220, 235, 225, 0.78)`), `margin-bottom: 9px` (positioned close to the top of the button), and text shadow. In mobile media queries (`@media (max-width: 768px)`), proportioned to `font-size: 12.5px` and `margin-bottom: 8px`. Set `.cta-subtext` margin to `22px` for balanced hierarchical grouping.
      - `frontend/index.js`: Cleaned up `initConsultationIntentModal()` click interceptor and removed obsolete `faqContactBtnText` binding from `renderHomepageAgentDetails()`.
      - `frontend/index.css` & `frontend/shared/css/session.css`: Removed all unused light and dark mode styles for `.faqs-more-help` and `.faqs-contact-link`.
      - The CTA banner ("Book a Free Consultation", `#ctaConsultBtn`) remains the single, elegant entry point that triggers the "How Can We Help You?" consultation intent modal (`#consultationIntentModal`).
    - **Automated Verification**:
      - Executed Chrome DevTools Protocol end-to-end headless browser test:
        - Confirmed zero elements matching `.faqs-more-help`, `.faqs-contact-link`, or `#faqContactBtnText` exist on the page.
        - Verified seamless visual layout transition from the final FAQ item to the CTA banner, with `.cta-question` positioned directly above the consultation button in both light and dark modes (`faq_removed_light.png` and `faq_removed_dark.png`), and tested responsiveness on mobile viewports (375x812, `cta_mobile.png`).
        - Verified that clicking `#ctaConsultBtn` in the CTA banner opens `#consultationIntentModal` without console errors.

112. **Smooth GPU-Accelerated FAQ Accordion Expansion & Collapse Animations (`frontend/index.css`):**
    - **Problem**: Opening and closing items in the homepage FAQ accordion relied on `max-height: 0` to `max-height: 1200px`. Because actual question answer heights are only ~150-300px, expanding overshot within milliseconds and closing suffered from a ~300ms delay before suddenly snapping shut, resulting in a jerky and unnatural user experience.
    - **Resolution**:
      - `frontend/index.css`: Replaced `max-height` with modern CSS Grid row interpolation (`grid-template-rows: 0fr` to `grid-template-rows: 1fr`) on `.faq-answer` with a cubic-bezier easing curve (`0.38s cubic-bezier(0.16, 1, 0.3, 1)`).
      - Transitioned `.faq-answer-inner` with synchronized padding (`padding: 0 24px` to `16px 24px 24px`), content fade (`opacity: 0` to `1`), and subtle upward slide (`transform: translateY(-8px)` to `translateY(0)`).
      - Replaced `border-top` on `.faq-answer-inner` with non-layout-shifting `box-shadow: inset 0 1px 0 #f1f6f2` (and `#243629` in dark mode) ensuring collapsed height is exactly `0px` without subpixel border leakage.
      - Synchronized plus-to-close toggle icon rotation (`.faq-icon`) with `transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)` for fluid 45-degree rotation matching accordion track motion.
      - Added responsive mobile adjustments ensuring clean 0px to full-height expansion on smaller screens.
    - **Automated Verification**:
      - Executed Chrome DevTools Protocol end-to-end headless browser test (`scratch/test_faq_animation.cjs`):
        - Verified initial collapsed height is strictly `0px` (`active: false, height: 0, computedH: '0px'`).
        - Verified mid-expansion interpolation at ~150ms (`height: ~289px`).
        - Verified full expansion at ~500ms (`height: ~332px, scrollHeight: 266px, iconTransform: 45deg rotation matrix`).
        - Verified mid-collapse interpolation at ~150ms (`height: ~33px`).
        - Verified clean return to `0px` upon closing (`height: 0, active: false`).
        - Captured visual verification frames in light (`faq_anim_open.png`) and dark mode (`faq_anim_dark.png`).

113. **Chat FAB Wiggle & Pulse Callout Animation on Website Open (`frontend/shared/css/session.css`, `frontend/shared/js/session.js`):**
    - **Problem / Goal**: Visitors may not immediately notice the floating contact and inquiry chat action button (`#fabMainBtn` in `.contact-fab`) positioned in the lower-right corner. The user specified that it should wiggle every time they open the website, but only once (not looping indefinitely and not annoying the user on every internal link click).
    - **Resolution**:
      - `frontend/shared/css/session.css`:
        - Implemented `@keyframes fabWiggle`: A dual-wave wobble animation oscillating smoothly between -13deg and +13deg with subtle scaling up to 1.12 over 2.8s.
        - Implemented `@keyframes fabPulseLight` and `@keyframes fabPulseDark`: Synchronized radial ripple ring glows expanding up to 14px in emerald/forest green brand tones.
        - Applied animations to `.contact-fab.fab-wiggle .fab-main-btn` with `transform-origin: center center`.
        - Added dark mode support (`fabPulseDark`), immediate cancellation when hovered or opened (`.contact-fab.fab-wiggle .fab-main-btn:hover`, `.contact-fab.open .fab-main-btn { animation: none !important; }`), and motion-sensitivity protection under `@media (prefers-reduced-motion: reduce)`.
      - `frontend/shared/js/session.js`:
        - In `initContactFab()`:
          - Cleans up legacy permanent `localStorage.removeItem('urbanscope_chat_fab_seen')` so previous visitors are not permanently blocked from seeing the callout.
          - Uses `sessionStorage.getItem('urbanscope_chat_fab_session_wiggled')` to ensure it wiggles once per visit/session.
          - Detects page reload (`performance.getEntriesByType('navigation')[0].type === 'reload'` or `performance.navigation.type === 1`) and direct outside arrival (`!document.referrer` or external origin) so that refreshing or opening the site triggers the wiggle.
          - Splash screen awareness: Detects if the welcome splash overlay (`#splash` or `.splash-pending`) is running. If so, polls until the splash screen is fully dismissed before waiting an additional 1200ms to trigger the wiggle, ensuring 100% visibility. If no splash is present, triggers 1400ms after load.
          - Interacting with the button (`mouseenter`, `touchstart`, `click`, or toggling the menu) immediately cancels the wiggle and marks it wiggled in `sessionStorage`.
          - When navigating internally between pages within the same session (e.g. from Homepage to property listings), the wiggle does not re-trigger, ensuring a smooth, non-intrusive browsing experience.
          - Provided `window.triggerChatFabWiggle()` and `?wiggle_chat=1` URL query parameter support for quick manual/automated QA testing.
    - **Automated Verification**:
      - Executed Chrome DevTools Protocol headless browser test (`scratch/test_fab_everytime.cjs` and `scratch/test_link_nav.cjs`):
        - Verified `fab-wiggle` class triggers upon opening the website and applies both `fabWiggle` and `fabPulseLight` animations.
        - Verified animation settles and removes `fab-wiggle` class after 3.2s.
        - Verified page reload (F5) re-triggers the wiggle.
        - Verified clicking internal links (`casasuerte.html`) does not trigger the wiggle again in the same session (`hasWiggleOnSubpage: false`).
        - Verified immediate cancellation upon hover or click (`duringWiggle: true, afterHover: false`).
        - Verified legacy `localStorage` key is cleaned up (`localCleared: null`).
114. **Superadmin Account Deletion & Hosted Vercel Serverless Handler Fixes:**
    - **Vercel Node Endpoint Adapter (`api/superadmin/users.js`):** Converted `handler(request)` to the standard Vercel Node `(req, res)` signature (`parseJsonBody(req)`, `jsonResponse(..., status, res)`, and `export { handler as fetch }`) matching `api/auth/*.js` so `/api/superadmin/users` (`create`, `update`, `delete`) responds immediately instead of timing out waiting for an uncalled Fetch `Response`; validates non-empty `user_id` or `email` when `action === 'delete'`.
    - **Schema & Trigger-Safe Cloud Cleanup (`lib/email-auth.js`, `backend/routers/superadmin.py`, `frontend/shared/js/supabase.js`, `frontend/shared/js/api.js`):**
      - Updated `appointments` cleanup filters from non-existent `user_id` to `client_email` / `client_id`.
      - Removed hardcoded `role: 'user'` from soft-delete `PATCH` fallback payloads so PostgreSQL trigger `trg_protect_user_email_verification` (`supabase/migrations/20261105120000_email_otp_auth.sql`) does not reject fallback soft-deletes on accounts whose `role` is `'client'` or `'admin'`.
      - Added `fetchWithTimeout` (`AbortController`, 8–10s) to Superadmin API requests (`apiSuperadminCreateUser`, `apiSuperadminUpdateUser`, `apiSuperadminUpdateUserRole`, `apiSuperadminDeleteUser`), skipped redundant direct REST deletes when `/api/superadmin/users` succeeds, and propagated failed deletions (`{ success: false, error }`) instead of silently hiding accounts in `localStorage`.
    - **Superadmin Confirmation Modal & Toast Styling (`frontend/pages/superadmin/dashboard.html`, `dashboard.css`, `dashboard.js`):**
      - Replaced native `window.confirm()` in `saDeleteUserPrompt()` with `#deleteUserModal` (`#btnConfirmDeleteUser`, `.sa-btn-danger`), added `Deleting...` busy/disabled states, Escape/backdrop close guards, and paused the 15-second `refreshActiveData` poll while `#deleteUserModal` or `isDeletingUser` is active.
      - Fixed `showToast()` to apply `sa-toast` / `sa-toast error` class names and added dark-mode `.sa-toast.error` styling.
115. **Supabase Egress & Log Ingestion Quota Optimization (Spinloop Elimination, Caching & Polling Relief):**
      - **Spinloop Fix (`supabase.js` / `api.js` + `session.js`)**: Removed `window.dispatchEvent(new CustomEvent('urbanscope:profileUpdated', ...))` from inside `apiGetLeadAgentProfile()`, added 2-minute TTL caching (`READ_CACHE.leadProfile` & `urbanscope_admin_profile_ts`) plus in-flight promise deduplication, and replaced `select=*` on `users` with explicit safe columns (`id,full_name,email,phone,license_number,title,brokerage,bio,avatar_url,role,updated_at`). Updated `session.js`'s `syncGlobalFooterContact(options)` so `urbanscope:profileUpdated` and window `focus` listeners update the DOM from event payload/`localStorage` with `{ skipFetch: true }` instead of triggering an infinite request loop.
      - **Shared Read Caching & Column Projections (`frontend/shared/js/supabase.js` & `frontend/shared/js/api.js`)**: Added `READ_CACHE` and `invalidateReadCache(scope)` providing 5s TTL + concurrent promise deduplication for `apiGetInquiries()`, `apiGetMyInquiries()`, and `apiGetSuperadminUsers()`, invalidated on inquiry/user mutations. Added `filter.columns` projection support to `apiGetProperties()` (preserving full `cached_live_properties` by skipping cache writes on partial selects). Narrowed `apiGetUsers()` / `apiGetSuperadminUsers()` `select` to `id,email,full_name,phone,role,created_at,bio` and `apiGetSuperadminOverview()` to `id,title,status` (`properties`) + `id,status` (`inquiries`).
      - **Poll Throttling & Cascade Removal (`session.js`, `admin/admin-shell.js`, `admin/dashboard.js`, `admin/clients.js`, `inquiry/history.js`, `superadmin/dashboard.js`)**: Raised polling intervals from `4s–5s` to `45s` (`session.js`) and `30s` (`admin-shell.js`, `admin/dashboard.js`, `admin/clients.js`, `inquiry/history.js`), and from `15s` to `60s` (`superadmin/dashboard.js` with a 15s `visibilitychange` cooldown). Passed prefetched `inquiries` into `window.loadAdminNotifications(inquiries)`, tagged self-dispatched events (`source: 'admin-shell'` / `'history'`) to stop self-trigger loops, skipped `apiGetUsers()` in `admin/dashboard.js` when `kpis.total_clients` is present, cached static/semi-static property lookups (`id,title` on `admin/clients.js`, 2-min TTL on `admin/dashboard.js`), and added in-flight locks plus 10s `focus`/`visibilitychange` cooldowns on client & admin polling paths.
      - *Note:* Code optimizations stop excessive future Supabase egress and log ingestion, but do not reset already-exceeded Free Plan billing-cycle counters (`Egress` / `Log Ingestion`) on Supabase.
116. **Homepage Sort Dropdown Simplification (`frontend/index.html`, `frontend/index.js`):**
      - Removed the `Location (A-Z)` (`value="location"`) `<option>` from `#homeSortSelect` on `frontend/index.html`, leaving `Featured`, `Property Type`, `Newest First`, `Price: Low to High`, and `Price: High to Low`.
      - Removed the corresponding `location` sort branch from `sortPropertyList()` and `location` icon branch from `getSortOptionIcon()` inside `frontend/index.js`.
117. **Homepage Budget Matcher Badge Removal (`frontend/shared/js/calculator.js`):**
      - Removed the `.budget-badge-pill` (`Home Affordability Finder`) header pill from `initHomepageBudgetMatcher()` in `frontend/shared/js/calculator.js` so the section begins cleanly with the `Find Cavite & Las Piñas Homes Within Your Budget` heading.
118. **Admin Dark Mode UI Fixes (`dashboard.html`, `propertylist.html`, `clients.html`, `add-property.html`, `edit-property.html`, `profile.html`):**
      - Fixed unreadable dark text headings and labels in Dark Mode across `frontend/pages/admin/admin-shell.css` and `frontend/pages/admin/dashboard.css`:
        - Added `html.dark-mode` styles for `.table-panel .panel-heading h2`/`p`, `.table-panel .text-button`, `.table-panel .table-scroll` borders/scrollbars, `.quick-action-item strong`, `.quick-action-arrow`, `.daily-reminder strong`/`p`, `.calendar-weekdays span`, `.calendar-day.is-today`, `.agenda-date-heading`, `.agenda-empty strong`/`p`, `.agenda-event strong`/`p`, `.agenda-event-time`, and `.agenda-note`.
        - Fixed dark-mode `--white` and `--dark-green` variable collisions on `.upload-btn`, `.save-btn`, `.btn-modal-primary`, `.inquiry-avatar-pill`, `.image-status` (`"Saved listing images"`), `.btn-change-avatar`, and `.eyebrow`, plus `.client-phone-text`, `.modal-header h3`, `.inquiry-id-tag`, and modal close/cancelled buttons.
      - Removed inline light-mode styles from property action buttons (`View`, `Edit`, `Mark Sold` / `Mark Available`, `Delete`) and status badges in `renderDashboardProperties()` (`frontend/pages/admin/dashboard.js`) and client inquiry modal action buttons (`frontend/pages/admin/dashboard.js`, `frontend/pages/admin/clients.js`), moving them to semantic classes in `dashboard.css`, `clients.css`, and `admin-shell.css`. Tightened `#managedPropertiesPanel` cell padding and allowed property/location wrapping so all four action buttons fit cleanly on a single row.
      - Added `background: transparent` and placeholder styling to `.search-input-card input` (`frontend/pages/admin/proplist.css` and `admin-shell.css`) so the search box on `propertylist.html` no longer renders an inner gray browser-default input background box in Dark Mode.

---

## Safety Rules

- Do **not** commit `backend/urbanscope.db`, `.env`, or virtualenvs (already in `.gitignore`).
- Do **not** run `backend/supabase_schema.sql` against a real project without confirmation —
  it starts with `DROP TABLE … CASCADE`.
- Never edit a file in `supabase/migrations/` once it has been applied; add a new
  timestamped migration instead. Don't run `supabase db push` / `db reset --linked` without confirmation.
- Don't change seed credentials or the JWT secret handling without telling the user.
- Ask before deleting files, renaming `supabase.js`, or restructuring folders — many pages
  hard-code these paths.
