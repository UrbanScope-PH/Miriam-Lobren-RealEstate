# UrbanScope Documentation Index

Welcome to the organized documentation hub for **UrbanScope — Miriam Lobren Real Estate (CD Miranda Realty)**.

Keep root [`AGENTS.md`](../AGENTS.md) lean so every AI coding agent loads 100% of it without truncation. Detailed technical specifications, design rules, database schema, deployment guides, and changelogs live here in `docs/`.

---

## Documentation Map

| Document | Purpose | When to Read | When to Update |
| :--- | :--- | :--- | :--- |
| [`AGENTS.md`](../AGENTS.md) *(root)* | Master AI agent rules, output contract, hard invariants & safety rules | **Every session** (auto-loaded by agents) | Only when core workflow rules, output expectations, or top-level invariants change (keep under ~12 KB) |
| [`README.md`](../README.md) *(root)* | Public product overview, feature highlights, quick start & folder tree | Onboarding or checking user-facing features | When user-facing features, setup steps, or top-level folders change |
| [`CLAUDE.md`](../CLAUDE.md) *(root)* | Thin Claude Code shim importing `@AGENTS.md` | Auto-loaded by Claude Code | Only if Claude-specific workflow commands change |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md) *(root)* | Branching, conventional commits & PR workflow | Before opening a branch or PR | When branching/PR policies change |
| [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) | Current frontend, gateway, FastAPI, Vercel API, auth & Single-Admin RBAC architecture | Before editing routes, APIs, auth, session, or shared JS | When routes, endpoints, auth/RBAC rules, or system boundaries change |
| [`docs/UI_GUIDELINES.md`](UI_GUIDELINES.md) | Solid-color design system, banned UI patterns, component standards, Dark Mode & mobile rules | Before **any** HTML/CSS/UI edit | When visual conventions, component specs, or mobile/desktop rules change |
| [`docs/DATABASE.md`](DATABASE.md) | SQLite & Supabase Postgres schema, RLS policies, seeds & atomic migration checklist | Before any DB query, model, trigger, or migration change | Whenever tables, columns, triggers, RLS policies, or migrations change |
| [`docs/DEPLOYMENT.md`](DEPLOYMENT.md) | Local dev setup, env vars, Vercel Hobby limits, CSP, Google OAuth & Resend email config | Before changing env vars, `vercel.json`, `proxy.js`, OAuth, or email | When deployment settings, secrets, or infrastructure change |
| [`docs/CHANGELOG.md`](CHANGELOG.md) | Chronological session & feature changelog | Looking up when or why a feature changed | After completing notable feature or bug-fix milestones |
| [`docs/archive/LEGACY_AGENT_NOTES.md`](archive/LEGACY_AGENT_NOTES.md) | Historical archive of legacy session notes (#1–#212) extracted from `AGENTS.md` | Only when researching historical context (**contains superseded info**) | **Read-only archive** — never append here |

---

## Documentation Maintenance Rules

1. **Never append session logs to root [`AGENTS.md`](../AGENTS.md).** Keep `AGENTS.md` concise (~8–12 KB) so AI tools never truncate it.
2. **Update the matching topical guide in `docs/`** whenever you change architecture, UI rules, schema, or deployment config.
3. **Log completed milestones in [`docs/CHANGELOG.md`](CHANGELOG.md)** instead of creating new notes files.
4. **Keep relative links working** — files inside `docs/` link to code paths using `../` (e.g., `../backend/database.py`).
