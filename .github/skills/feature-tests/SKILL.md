---
name: feature-tests
description: 'Keep automated tests and the testing guide in sync with every code change. USE WHEN: a prompt adds a new feature, capability, command, endpoint, component, function, or crate; a prompt fixes a bug or changes existing behavior; the user asks to add/update tests, write test cases, or document how to run tests. For every feature added or bug fixed in a session, add or update tests in the correct layer (Rust core/data/desktop or React/TS frontend), run the affected suite to prove it passes, and refresh docs/TESTING.md plus the testing feature page. Pairs with the running task so tests never drift from the implementation.'
argument-hint: 'e.g. "add tests for what we just built" or "update tests for this fix"'
---

# Feature Tests

Ensures every shipped feature or bugfix lands with matching automated tests and
an up-to-date testing guide — without being asked each time. This is the test
counterpart to the `feature-docs` skill and should run alongside it at the end
of any prompt that changes behavior.

## When to Use

Run this whenever a prompt results in code changes that affect behavior:

- A **new feature** (capability, command, API/endpoint, UI component, function,
  crate, config flag, script).
- A **bug fix** or a change to existing behavior — add a regression test that
  fails before the fix and passes after.
- The user explicitly asks to **add/update tests**, write **test cases**, or
  **document how to run tests**.

Skip only when a change is purely cosmetic (formatting, comments, docs-only)
with no testable behavior — still note that in the testing guide if a command
or workflow changed.

## Where Tests Live

| Area | Location | Run with |
| --- | --- | --- |
| Core analysis | inline `#[cfg(test)]` in `core/src/*.rs`; integration in [core/tests/](../../core/tests/) | `cargo test --manifest-path core/Cargo.toml` |
| Market data | inline `#[cfg(test)]` in [data/src/lib.rs](../../data/src/lib.rs) | `cargo test --manifest-path data/Cargo.toml` |
| Desktop backend | inline `#[cfg(test)]` in [desktop/src-tauri/src/lib.rs](../../desktop/src-tauri/src/lib.rs) | `cargo test --manifest-path desktop/src-tauri/Cargo.toml --lib` |
| Frontend | `web/src/**/__tests__/*.{test,spec}.{ts,tsx}` | `pnpm --dir web test` |

Docs: [docs/TESTING.md](../../docs/TESTING.md) (the run guide) and
[docs/features/testing.md](../../docs/features/testing.md) (the feature page).

## Procedure

1. **Identify the changed surface.** For each feature/fix in this session,
   determine which layer it lives in (core / data / desktop / frontend) and what
   behavior is now testable.

2. **Add or update tests in the matching layer.**
   - **Rust:** prefer inline `#[cfg(test)] mod tests` next to the code for unit
     logic; use `core/tests/*.rs` for public-API integration tests. Cover happy
     path, boundaries (empty / zero / too-large period), and error cases.
   - **Frontend (Vitest + Testing Library):** place tests in a sibling
     `__tests__/` folder. Mock the WASM engine and DuckDB/OPFS storage with
     `vi.mock` — they do not run under jsdom. For module-level constants
     (`isDesktop`, `hasProxy`, `PROXY_URL`), re-import via `vi.resetModules()`
     after stubbing env/globals, or use a `vi.hoisted` flag holder.
   - For a **bugfix**, write the regression test first and confirm it fails
     against the old behavior when practical.
   - Reuse existing patterns — see [assets/testing-conventions.md](./assets/testing-conventions.md).

3. **Run the affected suite(s) and make them green.** Use the commands in the
   table above; stop any running `tauri dev` before the desktop Rust tests
   (it locks `target/`). Fix failures before finishing — do not leave red tests.

4. **Refresh the testing docs.**
   - Add the new scenarios to the relevant section of
     [docs/TESTING.md](../../docs/TESTING.md) and update the expected test totals.
   - Update [docs/features/testing.md](../../docs/features/testing.md) and prepend
     a dated changelog entry to [docs/features/README.md](../../docs/features/README.md),
     newest first, e.g.
     `- 2026-06-21 — **Added** tests for <feature> ([testing](./testing.md))`.

5. **Confirm** to the user which tests were added/updated, the suite result
   (e.g. "60 passed"), and the doc pages touched.

## Conventions

- Mirror existing test style and helpers in the target crate/folder; don't
  invent a parallel structure.
- Keep tests deterministic and offline — no real network, no real filesystem
  beyond temp/mocks. Mock external data providers and storage.
- One regression test per fixed bug, named for the behavior it guards.
- Document the *current* test inventory — rewrite stale sections of
  `docs/TESTING.md` instead of stacking contradictory notes.
- Use real, verified commands — reuse exactly what passed this session.

## Pairing with feature-docs

`feature-docs` documents *what changed*; `feature-tests` proves it and documents
*how it's verified*. When a prompt triggers one, it almost always triggers the
other — run both before ending the turn so code, docs, and tests stay in lockstep.

## Assets

- [Testing conventions & snippets](./assets/testing-conventions.md)
