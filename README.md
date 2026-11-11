# UrbanScope — Miriam Lobren · CD Miranda Realty

[![Deployment](https://img.shields.io/badge/Vercel-Production%20Live-brightgreen?logo=vercel)](https://miriam-lobren-real-estate.vercel.app/)
[![Python](https://img.shields.io/badge/Python-3.9+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-Framework-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![License](https://img.shields.io/badge/License-Proprietary-blue.svg)](https://miriam-lobren-real-estate.vercel.app/)

> **Better Homes, Brighter Futures**
> A responsive real estate website for property discovery, client inquiries, and admin management.

Built for **Miriam Lobren, Real Estate Salesperson** (CD Miranda Realty, Las Piñas & Cavite, Philippines).

---

## ✨ Features

- **Property Showcase** — featured accredited listings (Casasuerte, Kathleen, Liora Homes, Airmen's Village Triplex) with category tabs, property photo galleries, in-page financing document previews, accurate zoomed-in location maps, and Total Contract Price (TCP) computations (Pag-IBIG & Bank Financing). Sold listings remain visible with a Sold Out label but no longer accept new inquiries.
- **Interactive Monthly Amortization & Home Affordability Calculator** — standard Philippine banking (7.0% indicative) and Pag-IBIG Fund (6.25% fixed) financial simulation engine. Embedded on all property detail and showcase pages with customizable downpayment percentages (10%–30%), installment equity terms (12–24 mos), loan repayment terms (5–30 yrs), 35% Gross Monthly Income (GMI) qualification rule, and 1-click **"Inquire with This Calculation"** lead converter. Includes an interactive salary-based **Home Affordability Matcher** on the homepage to find homes matching household income.
- **Client Accounts & Google Sign-In** — email-code verification for password registration, one-time-code password recovery, PH phone validation, and one-click **Google Authentication** (OAuth 2.0 via Google Identity Services); unified sign-in that routes users by role.
- **Consultations & Inquiries** — interactive consultation intent flow allowing clients to book general consultations (free site tripping, loan pre-approval, property advice) or inquire about specific accredited listings. **Guest inquiries are accepted with zero login required** (honeypot-protected against spam), and post-submission prompts allow guests to optionally create an account with pre-filled details to track their inquiries in the client history portal.
- **Direct Multi-Channel Contact** — floating quick-contact button (`.contact-fab`) providing instant 1-tap access to Facebook Messenger (`m.me/miriamalobren`), direct phone call (`tel:+639189645434`), and SMS with pre-composed property inquiry messages.
- **Search Engine Optimization & Social Sharing** — full Open Graph and Twitter Card link previews across all public pages, dynamic JSON-LD `RealEstateAgent` schema markup, canonical URLs, `robots.txt`, and automated `sitemap.xml`.
- **High-Performance Assets** — compressed progressive JPEG imagery, responsive preloading on key banners, and native `loading="lazy" decoding="async"` on all below-the-fold property thumbnails.
- **System-Wide Dark Mode** — seamless dark theme with multi-layer preference persistence (`localStorage`, 1-year cookie, and window session), smooth crossfade transitions, comfortable photo dimming, and high-contrast accessible controls.
- **Admin Dashboard** — KPI cards, inquiry charts, property CRUD, client inquiry tracking, and user overview.
- **Superadmin Console** — focused account and role governance, privileged-account overview, and database health checks. Property and inquiry workflows stay in the Agent Admin portal.
- **Administrative Access Control** — Vercel checks a signed, HttpOnly session before serving Admin and Superadmin pages. Hosted admin sign-in requires Google verification for an approved staff account; normal client sign-ins and editable browser storage cannot grant administrative access.
- **Legal & Privacy Hub** — comprehensive Terms of Service (aligned with RESA RA 9646) and Privacy Policy (compliant with Philippine Data Privacy Act RA 10173).
- **Responsive Design** — optimized for desktop, tablet, and mobile, with a shared mobile navigation shell across public, client, Admin, and Superadmin pages.

---

## 🛠️ Tech Stack

| Layer | Technology |
| :--- | :--- |
| Frontend | HTML5, vanilla CSS3, vanilla JavaScript (ES6) |
| Backend | Python 3, FastAPI, Uvicorn |
| Database | SQLite (auto-created and seeded on first run) |
| Auth | PBKDF2 password hashing, Google Identity Services (OAuth 2.0), JWT (PyJWT) |

---

## 🚀 Getting Started

**Requirements:** Python 3.9+

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
| `HOST` | `127.0.0.1` | Server host |
| `PORT` | `8000` | Server port |
| `URBANSCOPE_SECRET_KEY` | dev fallback | JWT signing secret. **Set this in production.** |
| `GOOGLE_CLIENT_ID` | *(empty)* | Google OAuth 2.0 Web Client ID (`*.apps.googleusercontent.com`) for Google Sign-In |
| `VERCEL_ADMIN_SESSION_SECRET` | *(required on Vercel)* | Private random signing secret for 12-hour Admin/Superadmin page sessions. Configure in Vercel Project Settings; at least 32 characters. Hosted admin sign-in uses Google for the existing staff accounts. |
| `VERCEL_ADMIN_EMAILS` | *(optional)* | Comma-separated additional Google email addresses permitted to use the Vercel Admin portal. |
| `RESEND_API_KEY` | *(required for email OTP)* | Private Resend key used by server endpoints to send registration and password-recovery codes. |
| `RESEND_FROM_EMAIL` | *(required for email OTP)* | Verified sender address configured in Resend. |
| `AUTH_OTP_SECRET` | *(required for email OTP)* | Private random secret of at least 32 characters used to hash OTPs. |
| `SUPABASE_SERVICE_ROLE_KEY` | *(required on Vercel for email OTP)* | Private server-side key used to store challenges and manage verified accounts. Never add it to frontend code. |

For hosted email verification and recovery, apply `supabase/migrations/20261105120000_email_otp_auth.sql` and set the four OTP variables in Vercel Project Settings before redeploying. Local FastAPI also needs the Resend credentials and OTP secret; add the service-role key when local account changes should sync to the hosted database.

To reset the data, delete `backend/urbanscope.db` and restart the server.

> [!NOTE]
> Seeded admin accounts are for local development only. Change them and set
> `URBANSCOPE_SECRET_KEY` before deploying publicly. For Vercel, also set
> `VERCEL_ADMIN_SESSION_SECRET` in the project's Environment Variables and redeploy.

---

## 📖 User & Administrator Manual

### 1. Client / Homebuyer Guide
- **Browsing Properties:** Visit the home page to view showcased listings, filter by property type (Houses, Townhouses, Lots, Commercial), or use search keywords. Click any property card to view high-resolution photos, pricing, lot/floor area, amenities, and location details.
- **Client Registration & Login:** Click **Sign In** in the top navigation bar. Password registration verifies email ownership with a one-time code before creating an account; **Forgot password** sends a separate recovery code. Users can also register via **Sign up with Google**. Manual account creation and Google OAuth require accepting the **Terms of Service and Privacy Policy** before proceeding.
- **Consultations & Dual-Mode Inquiries:** On the homepage, clicking **Book a Free Consultation** opens an interactive intent modal allowing clients to choose between *General Consultation / Question* (free site viewing, loan pre-approval, general advice) or *Inquire About a Specific Property* with dynamic listing selection, photo previews, and automated pricing details.
- **Inquiry History & Management:** Access **Inquiry History** via the client profile menu or topbar to track submitted requests, filter by status (*Under Review*, *Approved*, *Contacted*, *Cancelled*), view agent approval notices, modify inquiry messages or contact phones, cancel active requests, or permanently delete records.
- **Legal Compliance:** Review comprehensive, RESA-compliant Terms of Service and NPC-compliant Privacy Policy pages, fully integrated with seamless back navigation.

### 2. Administrator Guide (Miriam Lobren & Team)
- **Unified Sign-In:** Log in via `/pages/auth/login.html`. Authorized administrative accounts are automatically routed to the Admin Dashboard.
- **Shared Admin Navigation:** Dashboard, Properties, Clients, Inquiries, and Profile & Security use the same sidebar icons, section labels, active state, and UrbanScope green palette across admin screens.
- **Dashboard Overview & Inquiry Modal:** Monitor business health with key metrics: Total Properties, Total Inquiries, Pending Follow-ups, and recent activity streams. Click **View** on any inquiry to open an interactive modal with full message details, tour schedule, direct email reply, and instant **Approve Inquiry** action that immediately updates the client's inquiry history in real time.
- **Property Viewing Calendar:** Opens on today's browser-local date, marks the current day, supports month and date selection, and shows configured appointments plus client inquiry requests with preferred dates and times.
- **Managing Properties (CRUD):**
  - **View Listings:** Access `propertylist.html` to browse active catalog listings with status indicators.
  - **Add Property:** Click **Add New Property** (`add-property.html`) to input property name, category, price (₱), location, bedrooms, bathrooms, dimensions, amenities, and upload images.
  - **Edit Property:** Select **Edit** on any listing card (`edit-property.html`) to update pricing, specifications, or replace photos.
  - **Delete Property:** Remove unlisted or sold properties with immediate database and cache synchronization.
- **Client Inquiries & CRM:** Review client inquiries under `clients.html`, inspect contact information, track message details, approve client requests via the modal or inline select, and update inquiry follow-up statuses (e.g., *Under Review*, *Approved*, *Completed*).
- **Profile Picture Upload & Settings:** Visit `profile.html` to update contact details, change passwords, and upload custom profile photos (< 5MB limit) with automatic canvas optimization, live topbar avatar synchronization, and one-click photo reset. User account directory and role management are reserved for the Superadmin.

### 3. Superadministrator Guide
- **Console Navigation & Visuals:** The sidebar contains only Overview, Accounts & Roles, and System Health. Its navigation, icons, KPI tiles, and governance actions use the shared UrbanScope green treatment.
- **Master Overview:** Access `/pages/superadmin/dashboard.html` for account totals, privileged-role counts, and database storage status across local FastAPI/SQLite and cloud deployments.
- **Console Sections:** Use **Accounts & Roles** to manage user accounts and access levels, and **System Health** to run database integrity and role-trigger checks. Property listings and client inquiries are handled through the linked Admin Portal.
- **RBAC Role & Account Management:** Full user account governance (create client/admin accounts, edit full name, email, contact phone, account role `user`/`admin`/`superadmin`, promote/demote permissions, delete non-protected accounts, and reset passwords) synchronized across local SQLite and Supabase Cloud with protected root superadmin credentials.
- **System Health:** Run live diagnostics on database storage, foreign-key/schema integrity, role triggers, and API connectivity.

---

## 📂 Project Structure

```text
├── run.py              # Starts the server (site + API)
├── proxy.js            # Vercel Admin/Superadmin route guard
├── api/auth/           # Vercel signed admin-session function
├── lib/                # Shared server-side session helpers
├── backend/            # FastAPI app, RBAC middleware, modular routers/, database, models, auth
│   └── routers/        # Feature API & web routers (system, auth, properties, inquiries, superadmin, web)
├── frontend/
│   ├── index.html      # Home page
│   ├── pages/          # One folder per feature (auth, properties, inquiry, legal, admin, superadmin)
│   ├── shared/         # Shared CSS & JS (navbar, session, splash, API client)
│   └── assets/images/  # Photos, logos, icons
├── supabase/           # Supabase CLI migrations, seed data, and SQL scripts
├── DATABASE.md         # Database schema & seed data
├── CHANGELOG.md        # Session changelog & feature log
├── CONTRIBUTING.md     # Development & contributing guidelines
└── AGENTS.md           # Developer & agent guidelines
```

---

## 📄 Credits

- **Agent:** Miriam Lobren (Real Estate Agent)
- **Platform:** UrbanScope

&copy; 2026 UrbanScope. All rights reserved.
