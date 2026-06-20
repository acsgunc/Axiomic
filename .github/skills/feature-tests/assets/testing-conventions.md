# Testing Conventions & Snippets

Reusable patterns for writing tests in this repo. Match these so new tests fit
the existing suites. Full inventory and run commands live in
[docs/TESTING.md](../../../docs/TESTING.md).

## Rust — inline unit tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sma_matches_trailing_average() {
        let out = sma(&candles_from_closes(&[1.0, 2.0, 3.0]), 2);
        assert_eq!(out.values.last().unwrap(), &Some(2.5));
    }

    #[test]
    fn sma_period_too_large_is_all_none() {
        let out = sma(&candles_from_closes(&[1.0, 2.0]), 5);
        assert!(out.values.iter().all(Option::is_none));
    }
}
```

- Cover happy path, boundaries (empty input, period 0, period > length), and
  error variants (`Result::Err` messages should name the offending field).
- Integration tests for the public API go in `core/tests/*.rs` and import via
  the crate name, e.g. `use axiomic_core::indicators::sma;`.
- The `data` crate's serde tests need `serde_json` as a `[dev-dependencies]`.

## Frontend — Vitest + Testing Library

Config: [web/vitest.config.ts](../../../web/vitest.config.ts) (jsdom). Global
setup: [web/src/test/setup.ts](../../../web/src/test/setup.ts).

### Mock the WASM engine and storage (they don't run under jsdom)

```ts
vi.mock('../../engine', () => ({ engine: { parseCsv: vi.fn() }, preloadEngine: vi.fn() }));
vi.mock('../../lib/storage', () => ({
  isStorageReady: vi.fn().mockResolvedValue(false),
  listCachedSymbols: vi.fn().mockResolvedValue([]),
  loadCandles: vi.fn().mockResolvedValue([]),
  readOpfs: vi.fn().mockResolvedValue(null),
  saveCandles: vi.fn().mockResolvedValue(undefined),
}));
```

### Reset the Zustand store between tests

```ts
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useStore.setState({ /* …known initial slice… */ });
});
```

### Toggle import-time constants (isDesktop / hasProxy / PROXY_URL)

These are evaluated when the module loads, so re-import after stubbing:

```ts
async function freshModule() {
  vi.resetModules();
  return import('../dataProvider');
}
vi.stubEnv('VITE_PROXY_URL', 'http://proxy.test');   // hasProxy → true
vi.stubGlobal('__TAURI__', { core: { invoke: vi.fn() } }); // isDesktop → true
```

For components, expose the flags through a `vi.hoisted` holder so the hoisted
`vi.mock` factory can read them, and flip them per test:

```ts
const flags = vi.hoisted(() => ({ isDesktop: false, hasProxy: false, liveAvailable: true }));
vi.mock('../../lib/dataProvider', () => ({
  get isDesktop() { return flags.isDesktop; },
  get hasProxy() { return flags.hasProxy; },
  get liveAvailable() { return flags.liveAvailable; },
  /* …other mocked exports… */
}));
```

### Gotchas

- jsdom's `File` has no `.text()`; use `{ name, text: async () => '…' } as unknown as File`.
- `act(...)` warnings from async store updates are benign; assert on committed state.
- Keep tests offline — mock `fetch` and `__TAURI__.core.invoke` for live paths.

## After writing tests

1. Run the affected suite and make it green (stop `tauri dev` before desktop
   `cargo test`).
2. Update [docs/TESTING.md](../../../docs/TESTING.md) scenario lists + totals.
3. Update [docs/features/testing.md](../../../docs/features/testing.md) and the
   changelog in [docs/features/README.md](../../../docs/features/README.md).
