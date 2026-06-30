# Test Suite

## Summary

Comprehensive automated tests across all layers — the Rust analysis core, the
`axiomic-data` market-data crate, the Tauri desktop backend, and the React/TS
frontend (Vitest + Testing Library) — plus a full how-to-run guide.

## Status

`Added` — 2026-06-21 · `Updated` — 2026-07-01 (Position Repair average-down
ladder + panel tests)

## How to use

```bash
# Backend (Rust) — run per crate
cargo test --manifest-path core/Cargo.toml
cargo test --manifest-path data/Cargo.toml
cargo test --manifest-path desktop/src-tauri/Cargo.toml --lib   # stop `tauri dev` first

# Frontend (React/TS)
pnpm --dir web install   # first time only
pnpm --dir web test
pnpm --dir web test:coverage   # optional coverage report → web/coverage/
```

Current totals: core 30+ tests, data 5 + 1 doctest, desktop 4, frontend 197.

See the full scenario inventory and troubleshooting in
[docs/TESTING.md](../TESTING.md).

## Notes / caveats

- No root Cargo workspace — Rust suites run per crate.
- Frontend mocks the WASM engine and DuckDB/OPFS storage (they don't run under
  jsdom). Module-level constants (`isDesktop`, `hasProxy`, `PROXY_URL`) are
  re-evaluated via `vi.resetModules()` / `vi.hoisted` to test both branches.
- Stop any running `tauri dev` before the desktop Rust tests to avoid a
  `target/` file lock.

## Key source files

- [core/tests/engine_tests.rs](../../core/tests/engine_tests.rs)
- [data/src/lib.rs](../../data/src/lib.rs)
- [desktop/src-tauri/src/lib.rs](../../desktop/src-tauri/src/lib.rs)
- [web/vitest.config.ts](../../web/vitest.config.ts)
- [web/src/test/setup.ts](../../web/src/test/setup.ts)
- [web/src/lib/__tests__/](../../web/src/lib/__tests__/)
- [web/src/store/__tests__/useStore.test.ts](../../web/src/store/__tests__/useStore.test.ts)
- [web/src/components/__tests__/DataLoader.test.tsx](../../web/src/components/__tests__/DataLoader.test.tsx)
