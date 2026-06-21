# Testing Guide

Axiomic ships tests at every layer: the Rust analysis core, the native
market-data crate, the Tauri desktop backend, and the React/TypeScript
frontend. This guide lists every scenario that is covered and the exact
commands to run each suite.

- [Test layout](#test-layout)
- [Prerequisites](#prerequisites)
- [How to run everything](#how-to-run-everything)
- [Backend — Rust](#backend--rust)
  - [Core analysis crate (`core/`)](#core-analysis-crate-core)
  - [Market-data crate (`data/`)](#market-data-crate-data)
  - [Desktop backend (`desktop/src-tauri/`)](#desktop-backend-desktopsrc-tauri)
- [Frontend — React / TypeScript](#frontend--react--typescript)
  - [Utilities & sample data](#utilities--sample-data)
  - [Data providers](#data-providers)
  - [Store (Zustand)](#store-zustand)
  - [Components](#components)
- [Coverage](#coverage)
- [Troubleshooting](#troubleshooting)

---

## Test layout

```
core/
  src/indicators.rs        # inline #[cfg(test)] unit tests
  src/backtest.rs          # inline #[cfg(test)] unit tests
  tests/engine_tests.rs    # integration tests for the public API
data/
  src/lib.rs               # inline #[cfg(test)] unit tests + a doctest
desktop/src-tauri/
  src/lib.rs               # inline #[cfg(test)] unit tests
web/
  vitest.config.ts         # Vitest config (jsdom env)
  src/test/setup.ts        # global test setup (jest-dom + cleanup)
  src/lib/__tests__/       # utils, sampleData, dataProvider tests
  src/store/__tests__/     # useStore tests
  src/components/__tests__/ # DataLoader component tests
```

There is **no root Cargo workspace** — `core`, `data`, and
`desktop/src-tauri` are independent crates, so Rust tests are run per crate.

---

## Prerequisites

| Suite        | Tooling                                                |
| ------------ | ------------------------------------------------------ |
| Rust crates  | Rust 1.96+ (`rustup`, `cargo`)                         |
| Frontend     | Node 18+, `pnpm` (run `pnpm install` in `web/` once)   |

> Stop any running `tauri dev` session before running the desktop Rust tests —
> a live build holds a lock on `desktop/src-tauri/target`.

---

## How to run everything

From the repository root:

```bash
# Rust
cargo test --manifest-path core/Cargo.toml
cargo test --manifest-path data/Cargo.toml
cargo test --manifest-path desktop/src-tauri/Cargo.toml --lib

# Frontend
pnpm --dir web install   # first time only
pnpm --dir web test
```

Expected totals (current): **core** 30+ tests, **data** 5 tests + 1 doctest,
**desktop** 4 tests, **frontend** 68 tests.

---

## Backend — Rust

### Core analysis crate (`core/`)

Run:

```bash
cd core
cargo test
```

Covers ([core/tests/engine_tests.rs](../core/tests/engine_tests.rs) plus inline
tests in [core/src/indicators.rs](../core/src/indicators.rs) and
[core/src/backtest.rs](../core/src/backtest.rs)):

**Indicators**
- `sma` — trailing average correctness; period 1 (identity); period 0 and
  period > length yield all-`None`; empty input.
- `ema` — seeds from the first SMA then smooths; constant series stays constant.
- `rsi` — values stay within 0–100; all-gains series saturates at 100;
  insufficient data returns `None`.
- `macd` — `histogram == macd - signal` at every index.
- `bollinger` — band ordering `upper >= middle >= lower`; middle band equals the
  SMA; period < 2 yields all-`None`.
- `atr` — non-negative output; insufficient data returns `None`.
- `heikin_ashi` — output aligns 1:1 with input; first bar seeds open/close from
  the raw bar; HA high/low bound HA open/close; volume is carried over; each
  subsequent HA open is the average of the prior HA open and close.

**Backtest** ([core/src/backtest.rs](../core/src/backtest.rs))
- Produces well-formed metrics (equity curve, Sharpe, drawdown, win rate).
- Empty input does not panic.
- A flat market generates no trades.
- A non-zero fee reduces total return.

**CSV parsing** ([core/src/csv.rs](../core/src/csv.rs))
- Standard `Date,Open,High,Low,Close,Volume` header.
- Column order independent and case-insensitive headers.
- Rows sorted ascending by time.
- Optional volume column.
- UNIX seconds **and** milliseconds both parse to the same instant.
- Errors: empty input, missing required column (message names `close`),
  invalid number, header-only input.

### Market-data crate (`data/`)

Run:

```bash
cd data
cargo test
```

Covers inline tests in [data/src/lib.rs](../data/src/lib.rs) (no network
required):
- `UnifiedQuote` serde round-trips.
- `Provider` serializes to named variants (`YFinance`, `LegacyApi`).
- A client builds successfully for **both** providers.
- The service reports and switches its active provider.
- The yfinance client applies a window/interval override.
- A doctest on the crate's example usage compiles and runs.

> The first `data` build pulls the `yfinance-rs` dependency tree and can take a
> few minutes; subsequent runs are fast.

### Desktop backend (`desktop/src-tauri/`)

Run (stop `tauri dev` first):

```bash
cd desktop/src-tauri
cargo test --lib
```

Covers inline tests in [desktop/src-tauri/src/lib.rs](../desktop/src-tauri/src/lib.rs):
- `parse_provider` maps known strings (`yahoo`/`legacy`/`legacyapi` →
  `LegacyApi`, everything else → `YFinance`).
- `parse_provider` is case-insensitive.
- Unknown provider strings default to `YFinance`.
- The reported engine version string is non-empty.

`--lib` restricts the build to the library target so the full Tauri app bundle
is not compiled.

---

## Frontend — React / TypeScript

Test runner: **Vitest** with **jsdom** and **@testing-library/react**. The
config lives in [web/vitest.config.ts](../web/vitest.config.ts) (kept separate
from `vite.config.ts` so the PWA/WASM build plugins don't load under test).

Run:

```bash
cd web
pnpm install      # first time only
pnpm test         # vitest run (single pass)
pnpm test:watch   # watch mode
```

The WASM engine and DuckDB/OPFS storage do not run under jsdom, so those
modules are mocked with `vi.mock` in the store and component tests.

### Utilities & sample data

[web/src/lib/\_\_tests\_\_/utils.test.ts](../web/src/lib/__tests__/utils.test.ts)
- `cn` — joins truthy classes, drops falsy values, merges conflicting Tailwind
  classes (last wins).
- `fmtPct` — `+` prefix for positives, native `-` for negatives, no prefix for
  zero, custom digit counts, `%` suffix.
- `fmtNum` — thousands separators and configurable fraction digits.
- `fmtDate` — UNIX seconds → ISO `yyyy-mm-dd`.

[web/src/lib/\_\_tests\_\_/sampleData.test.ts](../web/src/lib/__tests__/sampleData.test.ts)
- `generateSampleCandles` — requested length, deterministic per symbol,
  different per symbol, daily-spaced ascending timestamps, internally
  consistent OHLC (`high >= low`, `high >= open/close`, positive volume).
- `candlesToCsv` — header + one row per candle, ISO date column formatting.

### Chart timeframes

[web/src/lib/\_\_tests\_\_/timeframe.test.ts](../web/src/lib/__tests__/timeframe.test.ts)
- `TIMEFRAME_DAYS` — every timeframe id maps to a lookback (`null` only for
  `ALL`); spot-checks `1Y`=365 and `1D`=1.
- `visibleRangeFor` — `null` for `ALL` and empty input; the `1Y` window ends at
  the last bar and starts ~365 days back while keeping older data draggable;
  clamps the start to the first candle when the lookback exceeds the history;
  guarantees ≥ 2 visible bars for tiny windows; and produces progressively
  wider windows for longer timeframes.

### Chart helpers

[web/src/lib/\_\_tests\_\_/chart.test.ts](../web/src/lib/__tests__/chart.test.ts)
- `isOhlcType` — candles/bars/heikin-ashi are OHLC; line/area are close-based;
  every chart type has a human label.
- `nextDrawingId` — unique, prefixed, monotonically increasing ids.
- `downloadChartsScreenshot` — ignores null charts (no-op when none present),
  and stacks chart screenshots into one canvas before triggering a download.

### Data providers

[web/src/lib/\_\_tests\_\_/dataProvider.test.ts](../web/src/lib/__tests__/dataProvider.test.ts)
- `loadFromCsvFile` — success path; throws `DataError` on empty CSV; wraps
  engine errors in `DataError`.
- Runtime detection — `isDesktop`/`hasProxy`/`liveAvailable` defaults; `hasProxy`
  true when `VITE_PROXY_URL` is set; `isDesktop` true when the Tauri global is
  present (validated by re-importing the module with stubbed env/globals).
- `loadFromProxy` — `{ candles }` payload, bare-array payload, non-ok response,
  empty result, network failure, and the no-proxy guard.
- `loadFromNative` — invokes `fetch_history` with `{ ticker, provider }`,
  surfaces backend string errors as `DataError`, rejects empty results, throws
  when not under Tauri.
- `fetchLive` routing — native on desktop, proxy in the browser, throws when no
  live source is available.
- `loadSample` — deterministic per symbol.

### Store (Zustand)

[web/src/store/\_\_tests\_\_/useStore.test.ts](../web/src/store/__tests__/useStore.test.ts)
(mocks `../engine`, `../lib/storage`, `../lib/dataProvider`)
- `addSymbol` — uppercases + trims, dedupes, ignores empty input.
- `removeSymbol` — reassigns the active symbol to the first remaining entry.
- `toggleIndicator` — flips the enabled flag.
- `setIndicatorPeriod` — clamps to a minimum of 1.
- `setProvider` — updates the active provider.
- `setDataMode` — persists to `localStorage`; switching to live refreshes the
  active symbol via `fetchLive`.
- `setActiveSymbol` — local mode never fetches live; live mode fetches fresh
  data; live failure falls back to local data and records an error; an
  already-cached symbol is not refetched.
- `loadCsv` — derives the symbol from the filename and activates it.
- `loadNative` — stores fetched candles on success; records an error on failure.

### Components

[web/src/components/\_\_tests\_\_/DataLoader.test.tsx](../web/src/components/__tests__/DataLoader.test.tsx)
- Renders the Live/Local data-mode toggle and CSV controls.
- Clicking **Live** switches the store data mode.
- **Live** is disabled when live data is unavailable.
- Browser branch — shows the proxy setup hint when no proxy is configured;
  enables the fetch button when a proxy exists.
- Desktop branch — renders the source selector with both providers; changing the
  source updates the store provider.

---

## Coverage

Generate a coverage report for the frontend (v8 provider):

```bash
pnpm --dir web test:coverage
```

A text summary prints to the terminal and an HTML report is written to
`web/coverage/index.html`.

For Rust, use the standard tooling if desired:

```bash
cargo test --manifest-path core/Cargo.toml   # add `cargo llvm-cov` for coverage
```

---

## Troubleshooting

- **`Access is denied (os error 5)` during a desktop build** — a `tauri dev`
  session is still running and holding the `target/` lock. Stop it, then rerun
  `cargo test --lib`.
- **`file.text is not a function` in a frontend test** — jsdom's `File` lacks
  `.text()`; use a minimal stand-in `{ name, text: async () => '…' }` like the
  existing data-provider tests do.
- **A module-level constant won't change between tests** — values such as
  `isDesktop`, `hasProxy`, and `PROXY_URL` are evaluated at import time. Re-import
  the module with `vi.resetModules()` after stubbing env/globals, or expose the
  flag through a `vi.hoisted` holder (see the DataLoader test).
- **`act(...)` warnings** — benign; they come from async store updates settling
  after a click. The assertions still run against the committed state.
