# AGENTS.md

Master instructions for all AI coding agents (Antigravity, Claude Code, Codex, Cursor, Copilot) working in **UrbanScope — Miriam Lobren Real Estate (CD Miranda Realty)**.

> Keep this file concise (under ~12 KB) so every agent loads 100% of it without truncation.
> Deep reference guides live in [`docs/`](docs/README.md). **Never append chronological session logs here.**

---

## 1. Agent Workflow & Expected Output

Follow these rules on every task:

1. **Be concise, concrete, and evidence-based.**
   - Lead with a clean summary of what changed, using clickable `file://` links with basenames (e.g., `[profile.css](file:///.../profile.css#L623)`).
   - Report only verification checks you actually ran and their real results. Never claim tests or browser checks passed if you didn't run them.
   - Skip filler, unnecessary recaps, and unsolicited reformatting of untouched code.
2. **Never auto-commit or mutate git state.**
   - Do **not** run `git checkout`, `git add`, `git commit`, or `git push` unless the user explicitly asks you to execute them.
   - Whenever code or documentation files change, end your response with:
     - A suggested **branch name** (e.g., `fix/admin-spacing`, `feat/inquiry-filter`, `docs/organize-guides`)
     - A suggested **conventional commit message** (e.g., `fix(ui): ...`)
     - One copy-pasteable `bash` command staging **only the files you changed for that task** (never include unrelated media files such as `*.mp4`).
3. **Plan or ask before big or risky edits.**
   - Outline a short plan or ask targeted clarifying questions before multi-file refactors, database schema/migration edits, deleting files, or restructuring folders.
4. **Read before writing.**
   - Before editing a page, inspect its paired `.html`, `.css`, and `.js` files together (plus `frontend/shared/js/session.js` or `frontend/pages/admin/admin-shell.js` when navigation/auth/state is involved).
   - Before any mobile CSS or touch-interaction change, read [`.agents/skills/mobile-native/SKILL.md`](.agents/skills/mobile-native/SKILL.md).
5. **Verify on Linux (`bash`).**
   - Primary dev environment is Linux (`bash`), Python 3 (`python3 run.py`), and Node (`node --check`).
   - Run targeted checks matching what you edited (Python `py_compile`, `node --check`, CSS brace balance, link checks, or endpoint/UI checks).

---

## 2. Project at a Glance

- **Product:** Public property showcase, client accounts/inquiries, and single-admin portal for **Miriam Lobren** (Real Estate Salesperson, CD Miranda Realty — Las Piñas & Cavite, Philippines).
- **Walkthrough Video:** `UrbanScope-Walkthrough-4K60.mp4` uses the site's property photography and a fictional buyer in a separate local database; its closing card points to `miriamlobren.site`.
- **Stack:** Static **HTML5 + vanilla CSS3 + vanilla ES6 JS** (no framework/bundler) · Local **Python 3 + FastAPI + Uvicorn + SQLite** (`backend/`) · Hosted **Vercel Static + Routing Middleware (`proxy.js`) + 11 Node Serverless Functions (`api/`) + Supabase Postgres (RLS)** · **Resend** email OTP · **Google Identity Services (OAuth 2.0)**.
- **Quick Start:**
  ```bash
  pip install -r backend/requirements.txt
  python3 run.py   # serves site + API on http://127.0.0.1:8000 (use localhost:8000 for Google OAuth)
  ```

---

## 3. Documentation Map (Read the Right Guide Before Editing)

| Area | Read Before Editing |
| :--- | :--- |
| Full docs index & maintenance rules | [`docs/README.md`](docs/README.md) |
| Folder layout, routes, gateways (`supabase.js`/`api.js`), Single-Admin RBAC, auth & APIs | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Flat color system, banned UI patterns, component rules, Dark Mode & mobile-native contract | [`docs/UI_GUIDELINES.md`](docs/UI_GUIDELINES.md) |
| SQLite & Supabase Postgres tables, RLS policies, seeds & atomic migration checklist | [`docs/DATABASE.md`](docs/DATABASE.md) |
| Env vars, Vercel `<= 12` function limit, CSP/headers, Google OAuth, Resend & verification commands | [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) |
| Chronological feature & session history | [`docs/CHANGELOG.md`](docs/CHANGELOG.md) |
| Historical archive of legacy notes (#1–#212; contains superseded details — reference only) | [`docs/archive/LEGACY_AGENT_NOTES.md`](docs/archive/LEGACY_AGENT_NOTES.md) |

**Documentation update rule:** When your change alters architecture, UI rules, database schema, or deployment config, update the matching guide in `docs/` (and `README.md` if user-facing) and add a brief row to [`docs/CHANGELOG.md`](docs/CHANGELOG.md). Do **not** bloat `AGENTS.md` with per-turn changelog notes.

---

## 4. Hard Invariants (Always Enforce)

### UI & Visual Rules (details in [`docs/UI_GUIDELINES.md`](docs/UI_GUIDELINES.md))
- **No browser frameworks or bundlers** (no React, Tailwind, jQuery) unless explicitly requested.
- **Zero CSS gradients** — solid/flat color system only; reuse tokens from `frontend/shared/css/tokens.css` and shared layout rules from `frontend/shared/css/common.css`.
- **Zero CSS `zoom:` scaling** — native `1:1` scale; use `@media (min-width: 1600px)` for wide desktop layouts.
- **Light Mode + Dark Mode + Mobile parity** — every UI edit must look clean in both themes (`html.dark-mode`) and on mobile (`<= 768px`).
- **Banned UI patterns:**
  - No thick left-border accent stripes (`border-left: 3px–5px solid ...`) on cards, callouts, agenda cards, message boxes, toasts, or nav items (1px split-button dividers are fine).
  - No colored indicator dots inside admin status pills, filter dropdowns, status badges, or modal decision options (keep chart legend color keys, calendar event markers, and the client navbar password-setup reminder dot).
  - No warm/orange icon badges on settings cards — use unified green `.card-header-icon`.
  - No native `alert()`, `confirm()`, or `prompt()` popups; no emoji glyphs as UI icons (use inline SVGs); no sticky mobile property CTA bar.
- **Mobile safety:** Use `overflow-x: clip` (never `overflow-x: hidden`) on `html`/`body`, keep `16px` font-size on mobile inputs, gate hover styles inside `@media (hover: hover) and (pointer: fine)`, and use `100dvh` + `env(safe-area-inset-*)`.
- **Locale & Branding:** Prices in `₱`, PH phone numbers (`+63…` / `09…`), keep diacritics (`Las Piñas`, `Dasmariñas`), unified footer copyright `© 2026 UrbanScope • All Rights Reserved`.

### Architecture & Backend Rules (details in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) & [`docs/DATABASE.md`](docs/DATABASE.md))
- **Single-Admin RBAC:** Only `miriamalobren@gmail.com` is Realty Administrator. Standalone `/pages/superadmin/` does **not** exist — Accounts & Roles lives at `/pages/admin/users.html` (accessible only to `miriamalobren@gmail.com`) with Promote/Demote removed and blocked server-side.
- **Dual REST Gateway:** Pages load `frontend/shared/js/supabase.js` (order: `skeleton.js` in `<head>`, then `supabase.js` → `session.js` → page script). Keep `frontend/shared/js/api.js` in sync and preserve the `null`-on-failure fallback contract.
- **Vercel Hobby Limit (`<= 12` functions):** `api/` currently has **11** functions — reuse `?action=` routing instead of adding new function files past 12. Hosted authorization uses signed `HttpOnly` cookies + `service_role` DB verification — never trust `localStorage`.
- **Backend hygiene:** Open SQLite via `get_db_connection()`, use parameterized `?` SQL (never f-string user input), Pydantic v2 `model_dump()`, close every connection, and escape user HTML (`esc()` / `escapeHtml()`).
- **Supabase migrations as Git history:** Every logical schema change gets its own atomic, idempotent file (`supabase/migrations/YYYYMMDDHHMMSS_<feature_name>.sql`). Never combine unrelated changes or edit an already-applied migration.

---

## 5. Safety Rules

- Never commit `backend/urbanscope.db`, `.env`, secrets, or virtualenvs.
- Never run `backend/supabase_schema.sql` against a live database without explicit confirmation (it starts with `DROP TABLE … CASCADE`).
- Never run `supabase db push` or `supabase db reset --linked` without explicit user confirmation.
- Never change seed credentials, JWT/session secret handling, or `miriamalobren@gmail.com` admin isolation without explicit approval.
- Ask before deleting files, renaming `frontend/shared/js/supabase.js`, or restructuring application folders — many pages hard-code relative paths.
