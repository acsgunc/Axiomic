---
name: feature-docs
description: 'Keep human-readable feature/bugfix documentation in sync with code changes. USE WHEN: a prompt adds a new feature, capability, command, endpoint, component, or crate; a prompt fixes a bug or changes existing behavior; the user asks to document a feature, write a how-to/usage doc, update the changelog, or "document what we just did". For every feature added or bug fixed in a session, create or update a Markdown doc under docs/features/ that explains what changed and how to use it, and refresh the docs index. Pairs with the running task so docs never drift from the implementation.'
argument-hint: 'e.g. "document the feature we just built" or "update docs for this bugfix"'
---

# Feature Docs

Maintains living documentation so every shipped feature or bugfix has a short,
practical "what it is + how to use it" page in the workspace.

## When to Use

Run this whenever a prompt results in code changes that a user or teammate would
need to know about:

- A **new feature** (capability, command, API/endpoint, UI component, crate,
  config flag, script).
- A **bug fix** or a change to existing behavior.
- The user explicitly asks to **document**, write a **how-to / usage** guide,
  or **update the changelog**.

If a change is purely internal (refactor, formatting, test-only) with no
user-visible effect, note it in the index changelog but skip a full page.

## Where Docs Live

```
docs/
└── features/
    ├── README.md            # index + dated changelog (newest first)
    └── <feature-slug>.md    # one page per feature/area
```

- `<feature-slug>` is lowercase-hyphenated and stable (e.g. `market-data`,
  `backtest-panel`). Reuse the same slug for follow-up changes to that area
  instead of creating near-duplicate pages.

## Procedure

1. **Decide create vs. update.** Search `docs/features/` for an existing page
   covering the same feature/area. Update it if found; otherwise create a new
   `docs/features/<feature-slug>.md`.

2. **Write/refresh the feature page** using
   [the page template](./assets/feature-template.md). Keep it concise and
   action-oriented. Required sections:
   - **Summary** — one or two sentences on what it does.
   - **Status** — `Added`, `Changed`, or `Fixed` + the date (use the current
     date from context).
   - **How to use** — the smallest copy-pasteable example: exact commands,
     function/API calls, config, or UI steps. Prefer runnable snippets.
   - **Notes / caveats** — gotchas, prerequisites, follow-ups (optional).
   - Link to the key source files (workspace-relative paths).

3. **Update the index** at `docs/features/README.md` (create it from
   [the index template](./assets/index-template.md) if missing): ensure the
   feature is listed and prepend a dated changelog entry, newest first, e.g.
   `- 2026-06-21 — **Added** market data fetching ([market-data](./market-data.md))`.

4. **Confirm** to the user which page(s) were created/updated and show the
   "How to use" snippet so they can run it immediately.

## Conventions

- One page per feature **area**; append to it for incremental changes rather
  than spawning new files.
- Document the *current* behavior — rewrite stale sections, don't pile on
  contradictory notes.
- Match existing repo doc style (see `docs/USAGE.md`).
- Use real, verified commands/snippets — if a command was run this session,
  reuse exactly what worked.
- Do not duplicate full API reference; link to source files instead.

## Templates

- [Feature page template](./assets/feature-template.md)
- [Index template](./assets/index-template.md)

## Pairs with feature-tests

Documenting a change and testing it go together. Whenever this skill applies
(any feature added or bug fixed), also run the **`feature-tests`** skill before
ending the turn so the change ships with matching tests and an updated
[docs/TESTING.md](../../docs/TESTING.md).
