# UrbanScope — Development Changelog & Chat History

This document records all features, enhancements, bug fixes, user requests, architectural decisions, and verification steps implemented during our pair-programming sessions.

---

## 📌 Session Summary Table

| Date | Category | Summary of Changes | Key Files |
| :--- | :--- | :--- | :--- |
| **Oct 2026** | **Admin Features** | Profile picture upload with strict `< 5MB` limit, canvas compression, topbar avatar sync, reset photo option | `profile.html`, `profile.js`, `profile.css` |
| **Oct 2026** | **Admin UI** | Inquiry details modal (`#inquiryModal`) replacing native browser `alert()` popups with mailto trigger | `dashboard.html`, `dashboard.js`, `dashboard.css` |
| **Oct 2026** | **Inquiry Flow** | Consultation intent modal (`#consultationIntentModal`) on homepage for general vs. property inquiries | `index.html`, `index.js`, `index.css` |
| **Oct 2026** | **Inquiry Page** | Dual-mode inquiry form (General Consultation topic picker vs Specific Property picker), pre-selection support | `inquiry.html`, `inquiry.js`, `inquiry.css` |
| **Oct 2026** | **Navigation** | Replaced placeholder hamburger menu in inquiry header with dedicated pill "Go Back" button (`.go-back-btn`) | `inquiry.html`, `inquiry.css` |
| **Oct 2026** | **UI Consistency** | Unified client profile chip (`.profile-chip` / `.profile-menu`) between homepage and inquiry page | `inquiry.html`, `session.js`, `session.css` |
| **Oct 2026** | **Session Menu** | Removed redundant "Browse Properties" link from client profile dropdown menu | `frontend/shared/js/session.js` |
| **Oct 2026** | **Event Handling** | Fixed `session.js` global document click interceptor bypassing consultation modal on homepage | `session.js`, `index.js` |
| **Oct 2026** | **Legal Hub** | Added Terms of Service (`terms.html`) compliant with RESA (RA 9646) and Privacy Policy (`privacy.html`) compliant with DPA (RA 10173) | `frontend/pages/legal/` |
| **Oct 2026** | **Registration Flow** | Same-tab legal link navigation with `?from=register`, mouse/keyboard back button support, and input draft persistence (`sessionStorage`) | `register.html`, `register.js`, `legal.js`, `legal.css` |
| **Oct 2026** | **Google Auth** | Added Google Identity Services (OAuth 2.0) sign-in & sign-up with FastAPI token verification, SQLite `google_id` migration, Supabase cloud sync, and navbar Google avatar rendering | `backend/auth.py`, `backend/app.py`, `backend/database.py`, `supabase.js`, `auth.js`, `session.js` |
| **Oct 2026** | **Inquiry History** | Added client inquiry history page (`history.html`), profile menu link, real-time search, status filtering, stats pills, modify details modal, cancel confirmation modal, and delete permanently | `history.html`, `history.css`, `history.js`, `supabase.js`, `api.js`, `session.js`, `backend/app.py` |
| **Oct 2026** | **Superadmin UI** | Fixed duplicate/unstyled profile dropdown artifact on superadmin console topbar (`session.js` route guard & script removal) | `session.js`, `pages/superadmin/dashboard.html`, `pages/admin/propertylist.html` |
| **Oct 2026** | **Inquiry UX** | Replaced blocking native browser `alert()` on submission with animated success modal (`#inquirySuccessModal`), schedule recap, loading spinner, and toast notice | `inquiry.html`, `inquiry.js`, `inquiry.css` |
| **Oct 2026** | **Database / CI** | Made Supabase migration `20261028000000_initial_schema.sql` idempotent (`IF NOT EXISTS`, drop trigger/policy guards) to fix GitHub Supabase Preview checks | `supabase/migrations/` |
| **Nov 2026** | **Dark Mode Removal** | Completely removed dark mode feature, styles (`theme.css`), and script (`theme.js`) across all 20 HTML pages per user request | `shared/css/theme.css`, `shared/js/theme.js`, HTML files |
| **Nov 2026** | **Repo & Backend Organization** | Removed unused `next-app/` prototype and refactored monolithic `backend/app.py` (1,730 lines) into `backend/middleware.py` and modular `backend/routers/` | `backend/app.py`, `backend/middleware.py`, `backend/routers/*`, `.gitignore`, `.vercelignore` |
| **Nov 2026** | **Rebranding & Standardization** | Removed all legacy CD Miranda references across HTML, JS, backend models, database defaults, and Supabase migrations, standardizing to UrbanScope | Multiple files, `backend/`, `frontend/`, `supabase/migrations/` |
| **Nov 2026** | **Inquiry Success UX** | Refined inquiry success modal (removed bottom-right "Back to Home", added upper-left back arrow, 48-hour response guarantee notice, removed gold gradients) | `frontend/pages/inquiry/inquiry.html`, `inquiry.css`, `inquiry.js` |
| **Nov 2026** | **Client Inquiry History & Approval** | Renamed "My Inquiry History" to "Inquiry History", added admin approval action in dashboard & client modals, added "Approved" green status badge & banner, and real-time cross-tab storage sync | `history.html`, `history.css`, `history.js`, `dashboard.js`, `clients.js` |
| **Nov 2026** | **Professional Title Dynamic Sync** | Dynamic synchronization of lead agent professional title from admin profile to homepage hero, navbar brand, tab title, about section, and footer in real-time across SQLite, Supabase Cloud, and client cache | `profile.html`, `profile.js`, `index.html`, `index.js`, `session.js`, `supabase.js`, `api.js` |
| **Nov 2026** | **Supabase Migrations as Git History** | Adopted git-like atomic migration history standard (`YYYYMMDDHHMMSS_<feature_name>.sql`), added migrations `20261102020000_expand_inquiry_status_workflow.sql` and `20261102030000_update_default_user_title.sql` | `supabase/migrations/`, `DATABASE.md`, `AGENTS.md` |
| **Nov 2026** | **Brand Harmonization** | Harmonized logo dimensions (48x42px), Miriam Lobren agent name typography (18px, 700 weight, 1.2px spacing), and title styling between history and submit inquiry topbars | `frontend/pages/inquiry/history.css`, `frontend/shared/js/session.js` |
| **Nov 2026** | **Cross-Device Password Sync** | Enabled two-way PBKDF2 password sync between SQLite and Supabase Cloud, fixed mobile loopback IP resolution, and set run.py to 0.0.0.0 | `backend/routers/auth.py`, `supabase.js`, `api.js`, `run.py` |
| **Nov 2026** | **Password Visibility Toggle** | Added interactive show/hide password toggle buttons to Current, New, and Confirm password inputs in admin profile settings | `profile.html`, `profile.css`, `profile.js` |
| **Nov 2026** | **Admin Password Invalidation** | Complete invalidation of old passwords upon update, proactive cloud sync on login, and removal of default credential bypasses | `backend/routers/auth.py`, `supabase.js`, `api.js`, `profile.js` |
| **Nov 2026** | **Registration Terms Modal** | Added mandatory scroll-to-accept Terms of Service & Privacy Policy popup modal on registration page before allowing account creation | `register.html`, `register.js`, `auth.css`, `auth.js` |
| **Nov 2026** | **Superadmin RBAC Cloud Sync** | Fixed `Error loading users: Failed to fetch` on Vercel Superadmin Console, added dual-tier Supabase Cloud + FastAPI Superadmin gateway methods, `'client'`/`'user'` role normalization, `users` DELETE RLS migration, and SQLite trigger preservation for admin creation | `pages/superadmin/dashboard.js`, `dashboard.html`, `supabase.js`, `api.js`, `backend/routers/superadmin.py`, `backend/routers/auth.py`, `supabase/migrations/20261103231500_allow_delete_users_rls.sql` |

---

## 🔍 Detailed Chronological Log of User Requests & Implementations

### 1. Admin Profile Picture Upload (< 5MB Limit)
- **User Prompt:** *"is it possible to add here a change profile picture and must less than 5mb"*
- **Rationale & Implementation:**
  - Administrators needed the ability to upload and update their profile picture from the `/pages/admin/profile.html` settings page.
  - Added a file input strictly enforcing a **5MB limit** (`file.size <= 5 * 1024 * 1024`), rejecting larger files with an inline warning.
  - Validates image MIME types (`image/png`, `image/jpeg`, `image/webp`).
  - Utilizes HTML5 canvas downsampling to resize and compress avatars into an optimized Data URL.
  - Automatically synchronizes all topbar avatar circles and dropdown menus via `syncAdminProfileDisplay()`.
  - Added a **"Reset Photo"** button allowing administrators to revert back to Miriam Lobren's default photo anytime.
  - Non-destructive SQLite schema support for `avatar_url` in the database.

---

### 2. Consultation Intent Flow & Dual-Mode Inquiry System
- **User Prompt:** *"when im logged in, and when i click this, it redirect to the property i dont want, it should be redirect first to task if it inquiry for property or just asking for specific something"*
- **Rationale & Implementation:**
  - Previously, clicking "Book a Free Consultation" on the homepage directly redirected clients to the inquiry form with a random pre-selected property.
  - Implemented an interactive consultation intent modal (`#consultationIntentModal`) presenting two clear choices:
    1. **General Consultation / Question** (`pages/inquiry/inquiry.html?type=general`): For site viewing, loan pre-approval, and general real estate questions without selecting a specific property.
    2. **Inquire About a Specific Property** (`pages/inquiry/inquiry.html?type=property`): For inquiring on verified accredited listings.
  - In `frontend/pages/inquiry/inquiry.html`:
    - Added segmented mode tabs (`[ General Consultation / Question ]` / `[ Specific Property Inquiry ]`) allowing clients to switch between modes anytime.
    - In **General Consultation mode**: The property summary card is replaced by a Consultation Topic selector and optional date/time schedule picker.
    - In **Property Inquiry mode**: Properties load dynamically via `apiGetProperties()` into `<select id="propertySelect">`, updating thumbnail, title, location, specs, and price in real-time.
    - Property detail and showcase pages (`property-detail.html`, `Liora.html`, `Airmen.html`) pass `?type=property&id=...` or `?title=...` to ensure property-specific inquiries pre-select the correct listing.

---

### 3. Consultation Intent Trigger Event Interception Fix
- **User Prompt:** *"when i click this, it should directly go, it should ask first which one to inquire"*
- **Bug Diagnosis:**
  - `frontend/shared/js/session.js` had a global `document.addEventListener('click', ...)` handler that caught any link containing `inquiry.html` and immediately executed `location.href = href;`, completely intercepting and bypassing the consultation modal.
- **Resolution:**
  - In `session.js`, added checks: `if (e.defaultPrevented) return;` and guarded against elements with `data-bypass-session-nav="true"`, `.cta-consult-btn`, or `#ctaConsultBtn`.
  - In `index.js`, attached the consultation modal click listener using capture phase (`true`) with `e.preventDefault()` and `e.stopPropagation()`.

---

### 4. Inquiry Topbar Navigation & "Go Back" Button
- **User Prompt:** *"remove this on the submit inquiry page, change to go back."*
- **Rationale & Implementation:**
  - The inquiry page had a non-functional placeholder hamburger menu icon in its topbar.
  - Replaced it with a dedicated pill **"Go Back"** button (`.go-back-btn`) containing an SVG left arrow and label.
  - Triggers `window.history.back()` with a fallback to `../../index.html` if direct entry occurred.

---

### 5. Unified Profile Chip Across Home and Inquiry Pages
- **User Prompt:** *"the ui of this should be same on the home page"*
- **Rationale & Implementation:**
  - The inquiry page previously had an outdated, static two-line client badge and placeholder notification bell.
  - Replaced it with the exact unified profile chip (`.profile-chip` / `.profile-menu`) used on the homepage.
  - Renders the dark green circular avatar with client initials, user first name, dropdown chevron toggle, and dropdown menu (Home, Submit an Inquiry, Sign Out).

---

### 6. Session Dropdown Menu Clean-Up
- **User Prompt:** *"remove the browse property here"*
- **Rationale & Implementation:**
  - The public properties catalog (`properties.html`) was deprecated earlier in favor of featured showcase listings.
  - Removed the redundant "Browse Properties" item from the user profile dropdown in `frontend/shared/js/session.js`.

---

### 7. Terms of Service & Privacy Policy Legal Pages
- **User Prompt:** *"add terms of services and privacy policy"*
- **Rationale & Implementation:**
  - Built a dedicated legal hub under `frontend/pages/legal/` (`terms.html`, `privacy.html`, and `legal.css`).
  - **Terms of Service (`terms.html`)**:
    - Tailored to Philippine real estate brokerage operations for Miriam Lobren / UrbanScope.
    - Fully compliant with **Republic Act No. 9646** (Real Estate Service Act - RESA), Professional Regulation Commission (PRC), and DHSUD.
    - 10 sections: Acceptance & Scope, Real Estate Representation, Property Listings & Pricing, Site Viewing & Consultations, Client Accounts & Security, Reservations & Financing, Intellectual Property, Limitation of Liability, Governing Philippine Law (Las Piñas City & Cavite jurisdiction), and Contact Details.
  - **Privacy Policy (`privacy.html`)**:
    - Fully compliant with the **Philippine Data Privacy Act of 2012** (Republic Act No. 10173) and National Privacy Commission (NPC) circulars.
    - 10 sections: Commitment to Privacy, Information We Collect, How We Collect Data, Purpose of Processing, Disclosure & Sharing, Data Storage & Security, Retention Period, Statutory Data Subject Rights, Cookies & Local Storage, and Contact Channels for the Data Protection Officer (DPO).
  - **Styling (`legal.css`)**:
    - Consistent with brand design tokens, featuring document switcher pill tabs (`[ Terms of Service ]` / `[ Privacy Policy ]`), sticky Table of Contents sidebar, styled callouts, responsive tables, and contact card.
  - **Site-wide Integration**:
    - Updated all placeholder `#` links and inline alerts in footers across `frontend/index.html`, `pages/auth/login.html`, `pages/properties/property-detail.html`, `pages/properties/Liora.html`, and `pages/properties/Airmen.html`.

---

### 8. Registration Legal Back Navigation & Form Draft Persistence
- **User Prompt:** *"when i click this and i click back on mouse or keyboard, there should be a go back to registration page when i click back"*
- **Problem Diagnosis:**
  - The registration checkbox links had `target="_blank"`, opening legal pages in a new browser tab with an empty history stack.
  - Consequently, hardware mouse back buttons (Button 4 / Back), keyboard shortcuts (`Alt + Left Arrow`, `Backspace`), and browser back buttons did not return to the registration form.
- **Resolution & Implementation:**
  1. **Same-Tab Navigation**: Removed `target="_blank"` on legal links in `frontend/pages/auth/register.html` and added `?from=register`.
  2. **Form Draft Preservation (`register.js`)**:
     - Added real-time draft caching in `sessionStorage` (`urbanscope_register_draft`).
     - Automatically saves `fullname`, `phone`, `email`, and `terms` checkbox state as the user types and whenever legal links are clicked.
     - Automatically restores all fields upon navigating back so user data is never lost.
     - Clears the draft upon successful account creation.
  3. **Contextual Back Button & Controller (`legal.js` & `legal.css`)**:
     - Added `frontend/pages/legal/legal.js` and styled `.legal-back-btn` inside the hero banner.
     - Dynamically titles the button **"Back to Registration"** when coming from `register.html`.
     - Supports keyboard back shortcuts (`Alt + Left Arrow` and `Backspace` outside form inputs).

### 9. Google Identity Services (OAuth 2.0) Authentication
- **User Prompt:** *"add google authentication"*
- **Rationale & Implementation:**
  - Replaced placeholder `alert()` handlers and the legacy `google_auth.php` redirect on `login.html` ("Continue with Google") and `register.html` ("Sign up with Google") with real Google Identity Services (OAuth 2.0) authentication.
  - **Backend Verification & Config (`backend/auth.py`, `backend/app.py`, `backend/models.py`):**
    - Added zero-dependency `.env` file support (`.env.example` template provided) for `GOOGLE_CLIENT_ID`, activated local git-ignored `.env`, and configured static Web Client ID fallback with `isLocalDevHost()` guard in `supabase.js` / `api.js` so Google Sign-In works across FastAPI (`:8000`), Live Server (`:5500`), and HTTPS Vercel deployments without probing `127.0.0.1:8000` on remote hosts.
    - Added `GET /api/auth/google/config` and `POST /api/auth/google`, validating tokens against Google's `oauth2.googleapis.com/tokeninfo` and `www.googleapis.com/oauth2/v3/userinfo` endpoints with strict `GOOGLE_CLIENT_ID` audience verification and `email_verified` enforcement.
  - **Database & Cloud Sync (`backend/database.py`, `supabase.js`, `api.js`):**
    - Added non-destructive `google_id` column migration and partial unique index `idx_users_google_id` to SQLite `users`.
    - Automatically creates new client accounts or links `google_id` to existing accounts while preserving passwords, RBAC roles (`user`, `admin`, `superadmin`), and custom admin avatars, and syncs verified users to Supabase Cloud (`users` table).
  - **UI & Session Polish (`auth.js`, `auth.css`, `session.js`, `session.css`):**
    - Automatically normalizes `http://127.0.0.1:<port>` to `http://localhost:<port>` on auth pages since Google Cloud Console rejects raw IP addresses in Authorized JavaScript origins.
    - Preloads Google OAuth config on page load so `requestAccessToken` runs synchronously on click without triggering browser popup blockers.
    - Displays clean inline status/setup banners instead of blocking `alert()` dialogs, and renders Google profile pictures inside `.profile-avatar` with fallback to user initials.

### 10. Client Inquiry History (Lifecycle Management: Modify, Cancel, Delete)
- **User Prompt:** *"add a inquiry history here where they can cancel/delete or modified"*
- **Rationale & Implementation:**
  - Clients needed full transparency and control over their inquiries and consultation requests directly from the user profile dropdown menu.
  - **Navigation Integration (`session.js`, `session.css`, `inquiry.html`):**
    - Added **"Inquiry History"** to the profile menu (`.profile-dropdown`) across the entire website between "Submit an Inquiry" and "Sign Out".
    - Added "Inquiry History" to the mobile navigation drawer (`.mobile-drawer-user`) for logged-in clients on small screens.
    - Added a direct pill button `Inquiry History` in the page header of `pages/inquiry/inquiry.html`.
  - **Inquiry History Hub (`frontend/pages/inquiry/history.html`, `history.css`, `history.js`):**
    - Protected route requiring authentication (`<html data-require-auth>`).
    - Responsive header with summary stats pills: Total Inquiries, Under Review, Scheduled, and Cancelled.
    - Segmented filter tabs (`All`, `Under Review`, `Scheduled`, `Contacted`, `Cancelled`) and real-time search input filtering by property, keyword, phone, or date.
    - **Modify Inquiry Modal (`#modifyModal`)**: Allows clients to edit their inquiry message, preferred viewing schedule, contact phone number, or consultation topic.
    - **Cancel Inquiry Modal (`#cancelModal`)**: Gives clients the ability to cancel an active request, marking status as `Cancelled` and notifying the team.
    - **Delete Inquiry Modal (`#deleteModal`)**: Prompts confirmation for permanent removal from the client's records.
    - Toast feedback notifications (`#toastNotice`) with non-intrusive alerts.
  - **Backend API & Authorization (`backend/app.py`, `backend/models.py`, `supabase.js`, `api.js`):**
    - Added `GET /api/inquiries/my`: Returns inquiries matching the authenticated client session or email parameter.
    - Added `PUT /api/inquiries/{id}` & `PATCH /api/inquiries/{id}`: Validates client ownership (`client_email`) or admin privilege before allowing updates.
    - Added `POST /api/inquiries/{id}/cancel`: Marks inquiry status as `Cancelled`.
    - Added `DELETE /api/inquiries/{id}`: Validates ownership before permanently deleting from SQLite.
    - Implemented `apiGetMyInquiries`, `apiUpdateMyInquiry`, `apiCancelMyInquiry`, and `apiDeleteMyInquiry` in both `supabase.js` and `api.js`.

---

### 11. Superadmin Topbar UI Isolation & Duplicate Menu Artifact Fix
- **User Prompt:** *"fix this ui in superadmin"* (accompanied by screenshot showing duplicate unstyled client profile chip `[ UCUrbanscope v ]` next to the official superadmin badge).
- **Diagnosis:**
  - `frontend/shared/js/session.js` had a broad fallback selector `document.querySelector('.nav-acts') || document.querySelector('.topbar-right')` designed for client navigation.
  - When loaded inside `frontend/pages/superadmin/dashboard.html` and `frontend/pages/admin/propertylist.html`, `session.js` matched `.sa-topbar-right.topbar-right` and injected the generic client profile dropdown (`#profileMenu`, "Home", "Submit an Inquiry", "Inquiry History", "Sign Out") next to the dedicated Superadmin profile badge (`#saProfileDropdownBtn`).
  - Because `session.css` is not loaded in the superadmin portal, the injected client dropdown appeared as an unstyled raw button and disrupted the topbar layout.
- **Resolution:**
  - Added an admin and superadmin route guard in `session.js` (`renderNavProfile` and `initMobileNav`) checking `path.includes('/pages/admin/') || path.includes('/pages/superadmin/')` to immediately abort client DOM injection.
  - Narrowed target element selection in `session.js` specifically to client navigation containers (`.navbar .nav-acts, .inquiry-topbar .nav-acts, .history-topbar .nav-acts, .nav-acts`).
  - Removed unnecessary `<script src="../../shared/js/session.js"></script>` tags from `pages/superadmin/dashboard.html` and `pages/admin/propertylist.html`.
  - Superadmin console now renders exclusively its dedicated `SA` avatar circle, `ROOT SUPERADMIN` role badge, and `#saDropdownMenu`.

---

### 12. Inquiry Submission UI Modal & Loading Feedback
- **User Prompt:** *"add ui when submiting a inquiry"* (accompanied by screenshot of native browser `alert(...)` displaying submission confirmation).
- **Diagnosis:**
  - `submitInquiry()` in `inquiry.js` previously executed a native synchronous `alert(...)` upon successful submission and immediately redirected to `../../index.html`.
  - On submission errors, it also triggered a native `alert('Submission error: ...')`.
  - Submit button lacked a loading feedback spinner, permitting duplicate clicks.
- **Resolution:**
  - Designed and built `#inquirySuccessModal` in `frontend/pages/inquiry/inquiry.html`:
    - Animated emerald checkmark badge (`.success-icon-badge`) with pulse ring animation (`@keyframes successPulse`).
    - Subject/topic recap, `Under Review` status pill, and schedule box (displaying date and time slot when specified).
    - Client contact person, email, and phone metadata recap card.
    - Action buttons: "View in Inquiry History" (linking to `history.html`), "Submit Another" (clears message/schedule and closes modal), and "Back to Home".
    - Clean dismiss triggers: Close button (X), backdrop click, and Escape key.
    - Centered precisely across zoomed viewports (`zoom: 1.25`) by replacing `100vw/100vh` with `position: fixed; inset: 0; width: 100%; height: 100%; margin: auto; z-index: 9999;`.
  - Submit button loading spinner (`.btn-spinner`) with "Sending Request..." state and opacity reduction to prevent duplicate submissions.
  - Replaced error alerts with an animated slide-up toast notification (`#toastNotice`).

---

### 13. Idempotent Supabase Schema Migration (Fix for Supabase Preview Check)
- **User Prompt:** *"why theres a error here"* (accompanied by GitHub Checks screenshot showing `ERROR: relation "users" already exists (SQLSTATE 42P07)` on `Supabase Preview`).
- **Diagnosis:**
  - After updating `project_id = "vfspjuqymfbagesjxjmc"` in `supabase/config.toml`, Supabase successfully recognized the remote project and attempted to run automated migrations on an ephemeral preview branch.
  - Because tables had already been created previously in the base Supabase instance (via SQL Editor), running `supabase/migrations/20261028000000_initial_schema.sql` failed at statement 8 with `relation "users" already exists`.
  - Non-idempotent `CREATE TABLE`, `CREATE TRIGGER`, and `CREATE POLICY` statements caused Postgres to fail immediately whenever an object already existed.
- **Resolution:**
  - Added `IF NOT EXISTS` to all 12 table creation statements (`users`, `property_types`, `properties`, `property_images`, `property_features`, `saved_properties`, `inquiries`, `inquiry_documents`, `inquiry_status_history`, `appointments`, `testimonials`, `notifications`).
  - Added `DROP TRIGGER IF EXISTS ... ON ...` guards before each `CREATE TRIGGER` statement.
  - Added `DROP POLICY IF EXISTS ... ON ...` guards before each `CREATE POLICY` statement.
  - Enables Supabase Preview to run the migration safely without crashing when tables or policies are already present.

---

### 14. Complete Removal of Dark Mode Feature
- **User Prompt:** *"never mind i change my mind, completely remove the dark mode feature"*
- **Rationale & Implementation:**
  - Removed the entire dark mode implementation per user instructions.
  - Deleted `frontend/shared/css/theme.css` and `frontend/shared/js/theme.js`.
  - Removed all `<link rel="stylesheet" href="...shared/css/theme.css">` and `<script src="...shared/js/theme.js"></script>` tags across all 20 HTML pages.
  - Verified zero remaining `themeToggleBtn`, `theme.css`, `theme.js`, or `data-theme` references across the entire repository.
  - Retained the general runtime stability fix in `frontend/pages/admin/add-property.js` (`inquiriesToggle`, `inquiriesGroup`, `propertyForm`, `propertyImages`, `imagePreview`, `selectedFiles`), eliminating uncaught `ReferenceError`s.

---

### 15. Repository Organization & Modular Backend Routers
- **User Prompt:** *"do you think this repository folder is good, can you organize it, do whatever you want"*
- **Rationale & Implementation:**
  - Removed the unfinished, unwired `next-app/` Next.js + Prisma directory and cleaned obsolete Next.js entries from `.gitignore` and `.vercelignore`.
  - Refactored `backend/app.py` (1,730 lines) into a slim FastAPI assembler (`backend/app.py`), RBAC navigation middleware (`backend/middleware.py`), and domain-focused routers under `backend/routers/` (`system.py`, `auth.py`, `properties.py`, `inquiries.py`, `superadmin.py`, `web.py`).
  - Verified 100% byte-for-byte OpenAPI specification parity and live HTTP route/redirect/RBAC parity with `run.py`.

---

### 16. Complete Rebranding & Legacy Brokerage Standardization
- **User Prompt:** Systematic codebase audit to remove all legacy brokerage ("CD Miranda") references.
- **Rationale & Implementation:**
  - Removed all legacy brokerage references across public HTML (`index.html`, `pages/auth/login.html`, `pages/auth/register.html`, `pages/legal/terms.html`, `pages/legal/privacy.html`), admin profile settings (`pages/admin/profile.html`, `pages/admin/profile.js`), client/API gateways (`index.js`, `shared/js/supabase.js`, `shared/js/api.js`), FastAPI backend (`run.py`, `backend/app.py`, `backend/models.py`, `backend/database.py`), SQL seeds (`backend/supabase_schema.sql`, `supabase/seed.sql`), and documentation (`AGENTS.md`, `DATABASE.md`, `CHANGELOG.md`), standardizing default brokerage/platform branding to **UrbanScope** / **Miriam Lobren Real Estate**.
  - Added idempotent migration `supabase/migrations/20261102010000_update_default_brokerage.sql` (preserving historical applied migrations 0001 and 0002 per §Safety Rules) and runtime normalization in `init_db()` and frontend profile loaders so stale `localStorage` or database rows automatically resolve to `'UrbanScope'`.

---

### 17. Inquiry Submission Modal & UX Refinements
- **User Prompt:** *"in submit inquiry, remove the "back to home" in the bottom right, just add the back arrow on the upper left. only the view in inquiry history and submit another on the bottom. also add a "youll receive a response via email within 48 hours (pls check spam/junk)"*
- **User Prompt:** *"remove the gold shade gradient here"*
- **Rationale & Implementation:**
  - In `frontend/pages/inquiry/inquiry.html` and `inquiry.css`:
    - Removed the redundant bottom-right "Back to Home" button from the modal footer.
    - Added a dedicated circular back arrow button (`#modalBackHomeBtn`) in the top-left corner of the modal header, linking directly back to `../../index.html`.
    - Added a clear SLA notice card: `"You'll receive a response via email within 48 hours (pls check spam/junk)."`
    - Modal actions in the footer now cleanly consist of only two buttons: `"View in Inquiry History"` (`pages/inquiry/history.html`) and `"Submit Another Inquiry"` (`#submitAnotherBtn`).
    - Stripped out all lingering gold gradients and shadows in favor of the consistent emerald/dark green design tokens (`var(--dark-green)` and `var(--accent-green)`).

---

### 18. Inquiry History Renaming & Admin Approval Workflow
- **User Prompt:** *"remove everything that has "my inquiry history" it should be only inquiry history"*
- **User Prompt:** Admin approval workflow for inquiries.
- **Rationale & Implementation:**
  - Renamed all occurrences of `"My Inquiry History"` across the application (navbar profile dropdown, topbar links, modal links, and mobile drawer) to `"Inquiry History"`.
  - Added an end-to-end admin approval workflow:
    - On the Admin Dashboard (`pages/admin/dashboard.html`), added an **"Approve Inquiry"** action button (`.btn-modal-approve`) inside the Recent Inquiries detail modal.
    - On the Admin Clients page (`pages/admin/clients.html`), updated the inquiry view modal and inline table select to support instant approval (`apiUpdateInquiryStatus`).
    - Backend updates synchronize across SQLite (`UPDATE inquiries SET status = 'Approved'`), Supabase Cloud, and client `localStorage`.
    - Client Inquiry History page (`pages/inquiry/history.html`): Added a distinct emerald status badge (`.status-approved`) and an approval banner (`.approved-banner`) acknowledging approval from agent Miriam Lobren.
    - Real-time client sync: Added event listeners for `storage`, `inquiryStatusChanged`, `inquiriesUpdated`, and `visibilitychange` in `history.js`, so when an admin approves an inquiry in another tab or window, the client's history list automatically updates in real-time.

---

### 19. Lead Agent Professional Title Dynamic Synchronization
- **User Prompt:** *"where can i change this licensed realestate broker agent"*
- **User Prompt:** *"when i change the professional title role on admin, it should also change on the home page"*
- **User Prompt:** *"it doesnt change the professional title role on the homepage"*
- **Rationale & Implementation:**
  - Diagnosed why updating the professional title in Admin Profile (`pages/admin/profile.html`) failed to immediately reflect on the public homepage:
    - Frontend cached stale placeholders (`'Licensed Real Estate Broker / Agent'`).
    - Background synchronization needed to prioritize active server titles and dynamic lead agent fetch.
  - Implemented dynamic lead agent profile loading:
    - Added `apiGetLeadAgentProfile()` in `frontend/shared/js/supabase.js` and `frontend/shared/js/api.js`.
    - In `frontend/index.js`, dynamically updates `#navAgentName`, `#navAgentTitle` (uppercase title), `#aboutAgentName`, `#aboutAgentRoleText` (lowercase role), `#aboutAgentPhoto` (alt text), document tab title, and footer role references.
    - Added multi-tab sync via `storage` and `urbanscope:profileUpdated` events.
    - Added atomic migration `supabase/migrations/20261102030000_update_default_user_title.sql` to normalize default title in Supabase to `'Real Estate Agent'`.

---

### 20. Supabase Migrations as Git History Standard
- **User Prompt:** *"treat supabase migrations like git history, each logical chnage or schema modification should its own seperate migration file"*
- **Rationale & Implementation:**
  - Formalized repository architectural rule in `AGENTS.md` and `DATABASE.md`: Supabase migrations must strictly mirror Git commit history.
  - Every logical schema modification, column addition, constraint update, or data normalization must be placed in its own separate, atomic migration file (`supabase/migrations/YYYYMMDDHHMMSS_<feature_name>.sql`).
  - Added timestamped atomic migrations:
    - `20261102020000_expand_inquiry_status_workflow.sql`: Expands inquiry status check constraint to include `'Approved'`.
    - `20261102030000_update_default_user_title.sql`: Normalizes default user title to `'Real Estate Agent'`.

---

### 21. Topbar Brand & Typography Harmonization
- **User Prompt:** Visual discrepancies between Submit Inquiry (`inquiry.html`) and Inquiry History (`history.html`) topbars.
- **Rationale & Implementation:**
  - Harmonized `.history-topbar` and `.app-brand` in `history.css` with `inquiry.css`:
    - Brand Logo: Fixed image dimensions to `48px × 42px` (`object-fit: contain`) on desktop and `36px × 32px` on mobile screens.
    - Agent Name (`<strong>Miriam Lobren</strong>`): Sized to `18px`, `font-weight: 700`, `letter-spacing: 1.2px`, and `var(--dark-green)`.
    - Professional Title (`<small>REAL ESTATE AGENT</small>`): Sized to `10px`, `font-weight: 700`, `letter-spacing: 1.8px`, and `var(--accent-green)`.
    - Matched topbar height (`80px`), box shadow, and `.go-back-btn` styling.
    - Added `applyAgentBranding()` in `frontend/shared/js/session.js` to dynamically update `.app-brand strong` and `.app-brand small` across all pages from live lead agent profile data.

---

### 22. Admin Notification Scope Isolation (Strict Exclusion of Admin Self-Approval Actions)
- **User Prompt:** *"in admin page, this doesnt supposed to notify when i approved inquiry. it hsould be only notify when new inquiry has been submitted"*
- **Rationale & Implementation:**
  - When an admin approved an inquiry, `buildNotificationItems()` previously generated an admin notification item with `type: 'approved'` and timestamp anchored to `now` (`updated_at`), causing the admin's own topbar bell badge to display `(1)` and showing entries like `"Inquiry INQ-2026-0036 approved • Just now"`.
  - Approval notifications belong exclusively to the **client**. Administrators must never be notified about actions they themselves just performed.
  - In `frontend/pages/admin/admin-shell.js`:
    - Removed `isApproved` and `isCompleted` branches from `buildNotificationItems()`.
    - Anchored non-cancelled inquiry notifications strictly to their original submission timestamp (`created_at`), never `updated_at`.
    - Strictly filtered out `approved` and `completed` events from `adminEvents` and local storage caches (`urbanscope_admin_event_notifs`).
    - Guarded `unreadCount` and toast dispatch so approvals never increment the badge or trigger chimes/toasts for the admin.
  - In `frontend/pages/admin/dashboard.js`, `clients.js`, `supabase.js`, and `api.js`:
    - Updated inquiry approval triggers to immediately mark the inquiry ID as read in `admin_notifs_read_ids`.
  - In `backend/routers/inquiries.py`:
    - Recorded `new_inquiry` notifications for the admin on client submission.
    - Marked admin notifications as read and seen when an inquiry transitions to `Approved`.

---

### 23. Admin Self Password Management & Server Restart Persistence
- **User Prompt:** *"is it possible to manually chnage the password of admin on its own"*
- **Rationale & Implementation:**
  - Administrators can change their own password directly from the Profile & Security Settings page (`/pages/admin/profile.html`) under the "Change Password" section.
  - Resolved `init_db()` in `backend/database.py` which was previously resetting existing users' `password_hash` back to seed credentials on every server startup or reload. Added `if not existing[1]:` check to guarantee password updates persist permanently across server restarts.
  - Enhanced `PUT /api/admin/password` in `backend/routers/auth.py` and `PasswordChangeRequest` in `backend/models.py` with fallback account resolution and session credentials.
  - Verified end-to-end update flow, PBKDF2 hashing, and immediate login synchronization.

---

### 24. Cross-Device & Mobile Password Synchronization
- **User Prompt:** *"the changing password doesnt work on other device or phone it only work on my laptop, fix this"*
- **Rationale & Implementation:**
  - Resolved `ReferenceError: userId is not defined` bug in `supabase.js` and `api.js` which caused crashes on mobile/cloud environments where local FastAPI was unreachable.
  - Replaced hardcoded `127.0.0.1:8000` with dynamic host resolution (`http://${location.hostname}:8000/api`) with HTTPS safety checks.
  - Seeded `admin.realestate@gmail.com` into Supabase Cloud `users` table and added dynamic upsert logic (`POST` fallback) if missing.
  - Implemented two-way password sync between SQLite and Supabase Cloud: updates from phone update Supabase Cloud and auto-sync into SQLite upon login, while updates from laptop push PBKDF2 salt-hashes directly to Supabase Cloud.
  - Bound `run.py` default host to `0.0.0.0` so other devices on the same Wi-Fi/LAN can reach the server.

---

### 25. Admin Password Visibility Toggle (Show / Hide Password)
- **User Prompt:** *"add here in the admin page settings where they can see the password they want to change"*
- **Rationale & Implementation:**
  - Administrators needed the ability to visually verify and review passwords when typing them into the "Change Password" form on `/pages/admin/profile.html`.
  - Wrapped `currentPassword`, `newPassword`, and `confirmPassword` inputs inside `.password-input-wrapper` with `padding-right: 42px`.
  - Added `.password-toggle-btn` buttons containing accessible SVG eye icons.
  - Clicking an eye toggle dynamically toggles the input between `type="password"` and `type="text"` while swapping between eye-open (`Show password`) and eye-slashed (`Hide password`) icons.
  - Added automatic reset on form submission to restore masked password states.

---

### 26. Complete Invalidation of Old Password on Admin Login
- **User Prompt:** *"i can still use the old password on admin after i change it, it should be not be able to use and only the password i set to new should be able to log in in the admin, the old one should not be able"*
- **Rationale & Implementation:**
  - Administrators who updated their password discovered they could still log in using the old default password (`realestate2026`) or previous password.
  - Eliminated legacy demo credential fallbacks in `apiSignIn` (`frontend/shared/js/supabase.js` and `api.js`) where `cleanEmail === 'admin.realestate@gmail.com' && password === 'realestate2026'` was overriding failed hash checks.
  - Fixed `apiSignIn` Step 1: When local FastAPI returns HTTP 401 Unauthorized, execution halts immediately with `{ success: false, error: 'Invalid email or password.' }` without falling through to offline demo fallbacks.
  - Fixed `apiSignIn` Step 2 (Supabase Cloud): Enforces that if `remoteUser.password_hash` exists, authentication is determined strictly by `verifyPBKDF2(password, storedHash)`. Default seed passwords are never checked when a user password hash is present.
  - Fixed `apiSignIn` Step 3 (Offline fallback): Checks `const effectiveAdminPass = locallyUpdated || activePass;`. If set, only that specific updated password is valid, rejecting the old password.
  - Enhanced `backend/routers/auth.py` with `sync_latest_password_from_supabase(clean_email)`: On login for administrative accounts, the backend proactively synchronizes the latest password hash from Supabase Cloud into local SQLite before validating credentials, ensuring passwords changed on mobile phones immediately invalidate the old password on laptops and local servers.
  - Enhanced `update_user_password`: Checks Supabase Cloud if the current password was updated remotely before rejecting with HTTP 400.
  - Verified with automated tests that entering the old password (`realestate2026`) returns HTTP 401 Unauthorized / `Incorrect email or password`, completely preventing sign-in, while only the newly set password authenticates successfully.

---

### 27. Registration Mandatory Scroll-to-Accept Terms of Service Modal
- **User Prompt:** *"in registration page, when they click the i agree to terms of service, it should pop up and they are required to scroll and click the i agree before continue to register"*
- **Rationale & Implementation:**
  - Built an interactive agreement modal (`#termsModalOverlay`) in `frontend/pages/auth/register.html` containing **Part I: Terms of Service** (RA 9646 / RESA) and **Part II: Privacy Policy** (RA 10173 / DPA).
  - Clicking the `"I agree to the Terms of Service and Privacy Policy"` checkbox (`#terms`), label (`#termsLabel`), or inline links (`#openTermsLink`, `#openPrivacyLink`) intercepts immediate checking/navigation and opens the popup modal.
  - Added scroll tracking (`evaluateTermsScroll()` in `register.js`) with a live reading progress bar (`#termsScrollBar`) and status banner (`#termsScrollHint`).
  - Kept the **I Agree** button (`#acceptTermsBtn`) locked (`disabled`) until the user scrolls to the bottom of the agreement (`scrollHeight - scrollTop - clientHeight <= 16`).
  - Clicking **I Agree** checks `#terms`, applies `.is-accepted` styling, closes the modal, and focuses **Create Account**; closing early or clicking **Cancel** leaves `#terms` unchecked, and attempting form submission without accepting automatically opens the modal.

---

### 23. Superadmin Console Users & RBAC Roles Cloud Fix (`Failed to fetch`)
- **User Prompt:** *"fix this error in user and rbac on superadmin page"*
- **Rationale & Implementation:**
  - Replaced hardcoded `http://127.0.0.1:8000/api` requests in `frontend/pages/superadmin/dashboard.js` with dual-tier gateway methods in `frontend/shared/js/supabase.js` and `frontend/shared/js/api.js` (`apiGetSuperadminOverview`, `apiGetSuperadminUsers`, `apiSuperadminCreateUser`, `apiSuperadminUpdateUser`, `apiSuperadminUpdateUserRole`, `apiSuperadminDeleteUser`, `apiRunSuperadminIntegrityCheck`) guarded by `isLocalBackendReachableHost()` so HTTPS/Vercel deployments connect directly to Supabase Cloud without loopback network errors.
  - Normalized `'client'` and `'user'` account roles across Superadmin table badges, role filters, edit modals, and SQLite sync.
  - Added atomic idempotent Supabase migration `supabase/migrations/20261103231500_allow_delete_users_rls.sql` granting `DELETE` RLS policy on `users`, with an automatic soft-delete `PATCH` fallback before migration push.
  - Updated `backend/routers/superadmin.py` to preserve Superadmin-assigned `'admin'` roles after `trg_user_role_insert` and synchronize Superadmin CRUD operations with Supabase Cloud.

---

| Component | Test Performed | Result |
| :--- | :--- | :--- |
| **HTTP Routing** | `curl -s -w "%{http_code}" http://127.0.0.1:8000/pages/inquiry/history.html` | `200 OK` |
| **HTTP Routing** | `curl -s -w "%{http_code}" http://127.0.0.1:8000/pages/inquiry/history.css` | `200 OK` |
| **HTTP Routing** | `curl -s -w "%{http_code}" http://127.0.0.1:8000/pages/inquiry/history.js` | `200 OK` |
| **Inquiry Creation** | `POST /api/inquiries` payload validation & insertion | `200 OK` (ID generated) |
| **My Inquiries API** | `GET /api/inquiries/my?email=...` email filter | `200 OK` (list returned) |
| **Inquiry Modification** | `PUT /api/inquiries/{id}` updates message & phone | `200 OK` (verified in DB) |
| **Inquiry Cancellation** | `POST /api/inquiries/{id}/cancel` status set to `Cancelled` | `200 OK` (status updated) |
| **Inquiry Approval API** | `PUT /api/inquiries/{id}` status updated to `Approved` | `200 OK` (status updated) |
| **Ownership Security** | Cross-client modification rejection without matching email/token | `403 Forbidden` |
| **Lead Agent Profile API**| `GET /api/agent/profile` public unauthenticated access | `200 OK` (returns title, name, phone, email) |
| **Profile Title Dynamic Sync**| Admin updates title -> verifies homepage `#navAgentTitle` and `#aboutAgentRoleText` update | Verified in real-time |
| **HTTP Routing** | `curl -s -w "%{http_code}" http://127.0.0.1:8000/pages/legal/terms.html` | `200 OK` |
| **HTTP Routing** | `curl -s -w "%{http_code}" http://127.0.0.1:8000/pages/legal/privacy.html` | `200 OK` |
| **Link Integrity** | Verified no remaining dead `#` links in footers and forms | Verified |
| **Link Targets** | Verified no `target="_blank"` on registration legal links | Verified |
| **Draft Caching** | Verified `sessionStorage` key `urbanscope_register_draft` saving & restoring | Verified |
| **RBAC Security** | Server-side `rbac_admin_guard_middleware` active on `/pages/admin/*` and `/pages/superadmin/*` | Verified |
| **Brand Harmonization** | Brand logo and typography pixel match between `inquiry.html` and `history.html` | Verified |
| **Old Password Rejection** | Tested `POST /api/auth/login` and `apiSignIn` with old password `realestate2026` | `401 Unauthorized` / Rejected |
| **New Password Acceptance** | Tested `POST /api/auth/login` and `apiSignIn` with newly updated password | `200 OK` / Authenticated |

