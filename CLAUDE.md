# CLAUDE.md

Instructions for Claude Code and Claude-based agents working in **UrbanScope**.

The tool-agnostic project rules, expected output format, hard invariants, and documentation map live in [`AGENTS.md`](AGENTS.md) and are imported below as the single source of truth. Load topical guides from [`docs/`](docs/README.md) on demand (do not bulk-import all docs up front).

@AGENTS.md

---

## Quick Commands (Linux / `bash`)

```bash
pip install -r backend/requirements.txt   # install Python deps
python3 run.py                            # run site + FastAPI API on :8000
rm -f backend/urbanscope.db               # reset local SQLite DB (re-seeds on start)
python3 -m py_compile run.py backend/*.py backend/routers/*.py
node --check proxy.js api/session.js api/properties.js api/inquiries.js
```

## Working Reminders

- **Small, focused diffs:** Do not reformat untouched files or reorder unrelated CSS.
- **Verify what you touch:** Run syntax/brace checks matching your edits and inspect affected endpoints/pages where available.
- **Never auto-commit:** Finish code changes with a suggested branch name, conventional commit message, and copy-pasteable `bash` command.
- **Docs hygiene:** Update the matching topical guide in [`docs/`](docs/README.md) and [`docs/CHANGELOG.md`](docs/CHANGELOG.md) — never append turn logs to `AGENTS.md`.
