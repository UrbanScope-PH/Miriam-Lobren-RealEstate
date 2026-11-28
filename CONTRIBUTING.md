# Contributing to UrbanScope

Thank you for contributing to **UrbanScope — Miriam Lobren Real Estate (CD Miranda Realty)**!

---

## Development Workflow

1. **Branching Strategy:**
   - Branch off `main` for new features, fixes, or documentation work.
   - Use conventional branch prefixes:
     - `feat/<feature-name>`
     - `fix/<bug-description>`
     - `style/<ui-polish>`
     - `docs/<documentation-update>`
     - `chore/<maintenance-task>`

2. **Commit Conventions:**
   - Use Conventional Commits:
     ```text
     feat(scope): concise description
     fix(scope): concise description
     style(scope): concise description
     docs(scope): concise description
     chore(scope): concise description
     ```

3. **Pull Requests:**
   - Open a pull request against `main` with a clear summary of changes and verification steps.
   - Verify affected pages (Light Mode, Dark Mode, and mobile), API endpoints, and markdown links before merging.

4. **Architecture, UI & Database Standards:**
   - Start with [`AGENTS.md`](AGENTS.md) for core invariants and workflow rules.
   - See [`docs/README.md`](docs/README.md) for modular guides covering [`ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`UI_GUIDELINES.md`](docs/UI_GUIDELINES.md), [`DATABASE.md`](docs/DATABASE.md), and [`DEPLOYMENT.md`](docs/DEPLOYMENT.md).
