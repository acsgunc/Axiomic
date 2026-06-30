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
  src/lib/__tests__/       # utils, sampleData, dataProvider, gridLayout, priceTargets, positionRepair tests
  src/lib/marketData/__tests__/ # hyperliquid + registry tests
  src/store/__tests__/     # useStore + useDashboardStore tests
  src/components/__tests__/ # DataLoader + PriceTargetWorkspace + PositionRepairPanel component tests
  src/components/dashboard/__tests__/ # TickerBar component tests
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
**desktop** 4 tests, **frontend** 202 tests.

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
- `generateSampleCandles` — requested length, **~10-year default span**,
  deterministic per symbol, different per symbol, daily-spaced ascending
  timestamps, internally consistent OHLC (`high >= low`, `high >= open/close`,
  positive volume).
- `candlesToCsv` — header + one row per candle, ISO date column formatting.

### Chart timeframes

[web/src/lib/\_\_tests\_\_/timeframe.test.ts](../web/src/lib/__tests__/timeframe.test.ts)
- `bucketKey` — `1D`/`ALL` keep one bucket per candle; `1W` groups fixed 7-day
  windows; `1M`/`3M`/`1Y` group by calendar month/quarter/year.
- `resampleCandles` — returns the source unchanged for `1D`/`ALL`, handles empty
  input, collapses dailies into fewer weekly bars, aggregates with first-open /
  last-close / extreme high-low / summed volume, and does not mutate the source.

### Price targets

[web/src/lib/\_\_tests\_\_/priceTargets.test.ts](../web/src/lib/__tests__/priceTargets.test.ts)
- `targetPrice` — applies `base × (1 + %/100)` (0%, +5%, -25%, +500%, -100%).
- `buildPriceTargets` — default ladder spans -100%…+500% in 5% steps (121
  inclusive rows), honours custom min/max/step, keeps percent labels free of
  float drift, and returns an empty ladder for invalid price/range.
- `targetChartGeometry` — null for degenerate inputs; maps first/last tiers to
  the plot corners with X increasing and price inverted; places the 0% baseline
  at the base-price height (and omits it when 0% is off-range); emits a polyline
  aligned with the points and X ticks on the requested percentage step.

[web/src/components/\_\_tests\_\_/PriceTargetWorkspace.test.tsx](../web/src/components/__tests__/PriceTargetWorkspace.test.tsx)
- Renders the default ladder (-100% … +500%); recomputes targets when a manual
  base price is set; resolves a base price from a ticker via the sample-data
  fallback (with the engine, storage, and data provider mocked).

### Position repair (average down / up)

[web/src/lib/\_\_tests\_\_/positionRepair.test.ts](../web/src/lib/__tests__/positionRepair.test.ts)
- `averageDirection` / `repairIsPossible` — detect `down` (market below entry),
  `up` (market above entry), and the impossible cases (equal or non-positive).
- `unitsToTargetAverage` — DCA formula matches the worked examples averaging both
  down and up, the returned units actually produce the target average when
  applied, and it returns `null` for targets outside `(market, entry)` or invalid
  positions.
- `niceStep` / `buildRepairTargets` — round descending targets when averaging
  down and ascending targets when averaging up (both strictly inside
  `(market, entry)`), explicit-targets override (filtering out-of-range values),
  an even-spacing fallback for narrow gaps, and an empty list when un-averageable.
- `buildRepairLadder` — per-target units/cost/new value in both directions, with
  new position value always equal to original cost + cost to buy; empty for
  un-averageable positions.

[web/src/components/\_\_tests\_\_/PositionRepairPanel.test.tsx](../web/src/components/__tests__/PositionRepairPanel.test.tsx)
- Renders the default repair ladder for the worked example (units/cost/value),
  recomputes when inputs change, averages **up** with an ascending ladder when
  the market price is above entry, shows guidance when the market equals entry,
  uses user-supplied averages in **Custom** mode, and flags custom targets
  outside the reachable range.

### Chart helpers

[web/src/lib/\_\_tests\_\_/chart.test.ts](../web/src/lib/__tests__/chart.test.ts)
- `isOhlcType` — candles/bars/heikin-ashi are OHLC; line/area are close-based;
  every chart type has a human label.
- `defaultVisibleRange` — returns `null` (fit all) for empty data or histories
  shorter than the window, and otherwise the most-recent `DEFAULT_VISIBLE_BARS`
  window (TradingView-style default view); honours a custom window size.
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
  empty result, network failure, the no-proxy guard, and that the selected
  `provider` is forwarded as a query param (defaulting to `yfinance`).
- `loadFromNative` — invokes `fetch_history` with `{ ticker, provider }`,
  surfaces backend string errors as `DataError`, rejects empty results, throws
  when not under Tauri.
- `fetchLive` routing — native on desktop, proxy (with the `provider` param) in
  the browser, throws when no live source is available.
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

[web/src/components/dashboard/\_\_tests\_\_/TickerBar.test.tsx](../web/src/components/dashboard/__tests__/TickerBar.test.tsx)
- Renders the symbol, source badge and adaptively-formatted price.
- **Flashes green** on an up-tick then fades back to the neutral background.
- Shows a loading state with no price.

[web/src/components/dashboard/\_\_tests\_\_/LiveChart.test.tsx](../web/src/components/dashboard/__tests__/LiveChart.test.tsx)
- Right-clicking a live pane's chart opens the context menu with **Reset Chart
  View** (lightweight-charts is mocked under jsdom).
- **Reset Chart View** calls `fitContent` when few bars exist and sets a recent
  visible window when there are many bars.
- The context menu lists a **Measure** item; selecting it (or **Shift +
  right-click**, which skips the menu) arms the measure overlay (`data-active`).
- The context menu lists a **Replay…** item; selecting it shows the start-bar
  picker, and picking a bar reveals the floating replay transport.

[web/src/components/\_\_tests\_\_/ChartMeasureOverlay.test.tsx](../web/src/components/__tests__/ChartMeasureOverlay.test.tsx)
- `measurementInfo` math: positive/negative price delta, percentage, bar count
  and elapsed time; singularises a one-bar span and omits time when out of range.
- The overlay is inert (`pointer-events: none`) when inactive and captures input
  when active; `Escape` and right-click both dismiss it via `onComplete`.
- The overlay renders at `z-index > 2` so it sits above lightweight-charts'
  canvases and actually receives pointer input (regression guard).

[web/src/lib/\_\_tests\_\_/replay.test.ts](../web/src/lib/__tests__/replay.test.ts)
- `replayIntervalMs` converts bars/sec to a clamped ms delay (≥ 20ms; non-positive
  speeds fall back to 1×).
- `clampReplayIndex` keeps the revealed count in `[1, total]` (0 when empty);
  `replayIndexFromLogical` reveals bar `L+1` for a click at logical `L` and clamps.

[web/src/lib/\_\_tests\_\_/useChartReplay.test.ts](../web/src/lib/__tests__/useChartReplay.test.ts)
- `start()` arms selecting mode at ~60% of history; `pick()` sets the revealed
  count and stops selecting; `stepForward/Back` move one bar and clamp.
- `play()` advances one bar per tick (fake timers) and auto-stops at the end;
  `exit()` resets; changing the total bar count resets replay.

[web/src/components/\_\_tests\_\_/ChartReplayBar.test.tsx](../web/src/components/__tests__/ChartReplayBar.test.tsx)
- Renders nothing when inactive; shows the transport + `index/total` when active.
- Transport buttons call `togglePlay`/`stepForward`/`stepBack`/`exit`; the speed
  select calls `setSpeed`; forward/play are disabled at the end.
- `ReplaySelectOverlay` maps a click to a logical bar via the time scale and
  renders at `z-index > 2` (regression guard).

[web/src/lib/\_\_tests\_\_/candleTable.test.ts](../web/src/lib/__tests__/candleTable.test.ts)
- `buildCandleRows` computes each bar's change vs the previous close (the first
  bar falls back to its own open) and the matching percentage.
- Rows are most-recent-first by default and chronological when `descending` is
  false; OHLCV is carried through unchanged; empty input yields an empty array.

[web/src/components/\_\_tests\_\_/CandleTable.test.tsx](../web/src/components/__tests__/CandleTable.test.tsx)
- Renders a header and one row per candle, newest first, with a signed change
  and percentage per bar; shows a “No data.” empty state for no candles.

[web/src/components/\_\_tests\_\_/ChartToolbar.test.tsx](../web/src/components/__tests__/ChartToolbar.test.tsx)
- The **Chart / Table / Split** segmented control calls `onViewMode` with the
  chosen mode; the **Full** button calls `onToggleFullscreen` and flips its
  label to **Exit** when `fullscreen` is set.

[web/src/components/\_\_tests\_\_/ChartContextMenu.test.tsx](../web/src/components/__tests__/ChartContextMenu.test.tsx)
- Renders its menu items and positions itself at the given x/y coordinates.
- Clicking an item calls `onSelect` then `onClose`; **Reset Chart View** is the
  built-in item wired to the chart's reset-view action.
- Closes on `Escape` and on an outside (document-body) click.
- A `disabled` item does not fire `onSelect`.

### Live dashboard — grid + market data

[web/src/lib/\_\_tests\_\_/gridLayout.test.ts](../web/src/lib/__tests__/gridLayout.test.ts)
- `gridShape` maps 1/2/4/6/8 to the canonical layout (1×1, 2×1, 2×2, 3×2, 4×2)
  and covers every count with enough cells.
- `responsiveColumns` stacks to 1 column on phones, caps at 2 on tablets, and
  uses the ideal columns on desktops.
- `isChartCount` accepts allowed counts and rejects everything else.

[web/src/lib/marketData/\_\_tests\_\_/hyperliquid.test.ts](../web/src/lib/marketData/__tests__/hyperliquid.test.ts)
- `parseHlCandle` normalises Hyperliquid's string OHLCV + ms timestamps.
- The `HyperliquidStream` multiplexer (with a fake WebSocket) opens one socket
  and sends a `candle` subscribe on connect, routes parsed candles to the
  matching listener only, and ref-counts subscriptions so the last unsubscribe
  closes the socket.
- Source metadata (id/assetClass/intervals) is asserted.

[web/src/lib/marketData/\_\_tests\_\_/registry.test.ts](../web/src/lib/marketData/__tests__/registry.test.ts)
- Exposes the built-in `hyperliquid` + `yfinance` sources.
- Defaults to live crypto; resolves unknown ids to the default source.
- `registerSource` makes a custom broker selectable (pluggability).

[web/src/store/\_\_tests\_\_/useDashboardStore.test.ts](../web/src/store/__tests__/useDashboardStore.test.ts)
- Defaults to 4 charts and a full 8-pane line-up spanning crypto + US/SG/India.
- Persists chart count + pane edits to `localStorage`; ignores invalid counts.
- Uppercases custom symbols; resets symbol/interval when switching a pane's
  source.
- Restores a saved layout and falls back to defaults on corrupt storage;
  sanitises unknown source/interval values.

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
