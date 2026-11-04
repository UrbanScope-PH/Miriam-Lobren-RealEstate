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
| Frontend | Static **HTML + vanilla CSS + vanilla JS (ES6)** — no framework, no bundler, no npm |
| Backend | **Python 3 + FastAPI + Uvicorn** (`backend/`) |
| Database | **SQLite** file `backend/urbanscope.db` (auto-created and seeded) |
| Auth | PBKDF2 password hashes + **Google Identity Services (OAuth 2.0)** + **PyJWT** bearer tokens in `localStorage` |
| Fonts | Plus Jakarta Sans, Dancing Script (Google Fonts) |

---

## Setup & Run

```powershell
pip install -r backend/requirements.txt
python run.py            # serves site + API on http://127.0.0.1:8000
```

- Site: `http://127.0.0.1:8000/` · API docs: `http://127.0.0.1:8000/docs`
- `run.py` uses `uvicorn --reload`, so Python edits hot-reload.
- Env vars (or `.env` in root — see `.env.example`): `HOST`, `PORT`, `URBANSCOPE_SECRET_KEY`, `GOOGLE_CLIENT_ID`.
- Frontend also works from VS Code Live Server (`:5500/frontend/`); it calls the API at `http://127.0.0.1:8000/api`.
- **Reset data:** delete `backend/urbanscope.db` and restart (or run `python backend/seed_rbac.py`).

Demo logins:
- Superadmin: `urbanscope.cvsu@gmail.com` / `urbanscope2026`
- Admin: `admin.realestate@gmail.com` / `realestate2026`

There is **no test suite, linter, or build step**. Verify changes by running the server
and exercising the page / `/docs` endpoint you touched.

---

## Repository Map

```text
run.py                 Starts FastAPI + static site (uvicorn backend.app:app)
backend/               app.py (FastAPI assembler), middleware.py (RBAC guard), routers/ (system, auth, properties, inquiries, superadmin, web), database.py, models.py, auth.py, seed_rbac.py, migration_rbac.sql
frontend/              Everything the browser loads (served at /)
  index.html/.css/.js  Home page
  pages/properties/    property-detail (?id=N), Liora.html & Airmen.html showcases (properties.html catalog was removed)
  pages/inquiry/       Inquiry form (inquiry.html) & client history (history.html) (requires login: <html data-require-auth>)
  pages/auth/          Unified login (auto-routes by role) & register
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
  `apiGetGoogleConfig`, `apiSignInWithGoogle`, `apiSignOut`, `apiGetCurrentUser`,
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

---

## Conventions

- **No new dependencies or frameworks** (no React, Tailwind, jQuery, npm) unless the user asks.
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
