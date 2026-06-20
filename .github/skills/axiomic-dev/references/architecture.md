# Axiomic — Architecture & Reference

Detailed companion to [SKILL.md](../SKILL.md). Read this when you need the full
picture: how data flows, the exact WASM API surface, type contracts, the build
pipeline, persistence model, and extension recipes.

---

## 1. What Axiomic is

A performance-first, **browser-first** stock analysis tool. Every heavy
computation — technical indicators, backtesting, CSV parsing — runs in a **Rust
core compiled to WebAssembly**, executing client-side at near-native speed. The
React/TypeScript frontend only orchestrates data flow and renders results.

The same `core` crate is reused by the **Tauri 2.0** desktop build natively, and
the frontend deploys unchanged as an installable **PWA**. One analysis codebase,
three delivery targets (browser, desktop, cloud).

**Non-negotiable principle:** there is *no* analysis logic in JavaScript. If a
calculation produces numbers a user relies on, it belongs in `core/`.

---

## 2. High-level architecture

```
┌──────────────────────────────────────────────────┐
│            Axiomic Frontend (React + TS)           │
│     Lightweight Charts · Tailwind · Zustand        │
└───────┬─────────────────────────────┬──────────────┘
        │ WASM bindings               │ Tauri IPC
┌───────▼──────────────┐    ┌──────────▼───────────┐
│  Rust `core` (WASM)  │    │   Tauri Desktop Shell │
│  indicators ·        │    │   (reuses frontend +  │
│  backtest · csv      │    │    core natively)     │
└───────┬──────────────┘    └───────────────────────┘
        │
┌───────▼──────────────┐    ┌───────────────────────┐
│   DuckDB-WASM + OPFS │    │  Serverless Proxy      │
│   (client-side SQL)  │    │  (CORS + API key hide) │
└──────────────────────┘    └───────────────────────┘
```

### Module boundaries

| Layer | Responsibility | Key files |
|-------|----------------|-----------|
| Rust core | indicators, backtest, CSV parse, type shapes | `core/src/*` |
| WASM bridge | the *only* JS↔Rust entry point | `web/src/engine.ts` |
| State | watchlist, active symbol, candle cache, indicator config, async status | `web/src/store/useStore.ts` |
| UI | chart, watchlist, indicators, backtest, data loader | `web/src/components/*` |
| Persistence | DuckDB SQL store + OPFS durable cache | `web/src/lib/storage.ts` |
| Data ingress | CSV upload, proxy fetch, sample generator | `web/src/lib/dataProvider.ts`, `web/src/lib/sampleData.ts` |
| Desktop | Tauri shell + native IPC commands | `desktop/src-tauri/*` |
| Proxy | CORS-free quotes, server-side API key | `proxy/src/worker.ts` |

---

## 3. Data flow (end to end)

1. **Ingress** — candles enter via one of three providers in
   `web/src/lib/dataProvider.ts`:
   - `loadFromCsvFile(file)` → text → `engine.parseCsv` (Rust) → `Candle[]`
   - `loadFromProxy(symbol)` → `GET {VITE_PROXY_URL}/quotes?symbol=…` → `Candle[]`
   - `loadSample(symbol)` → deterministic random-walk generator (offline demo)
2. **Store** — `useStore` caches candles per symbol in `candlesBySymbol`, sets
   `activeSymbol`, and (if available) persists to DuckDB + OPFS.
3. **Selection** — components read the active series via the `useActiveCandles()`
   hook (stable reference — see §8 pitfall).
4. **Compute** — `CandleChart` and `BacktestPanel` call `engine.*`, which lazy-
   loads the WASM module and returns `Series` / `BacktestResult`.
5. **Render** — results map to Lightweight Charts series (overlays, RSI pane,
   equity curve).

```
CSV / proxy / sample ─▶ dataProvider ─▶ useStore.candlesBySymbol
                                            │
                              useActiveCandles() (stable)
                                            │
                    ┌───────────────────────┴───────────────────┐
              engine.sma/ema/rsi/...                    engine.backtestSmaCrossover
                    │                                           │
              CandleChart overlays + RSI pane          BacktestPanel metrics + equity
```

---

## 4. The Rust core

Located in `core/`. Builds as both `cdylib` (WASM) and `rlib` (native) so the
desktop/server can link it directly. The `wasm` Cargo feature gates the
`wasm-bindgen` surface; native builds must stay free of `wasm-bindgen` deps.

### 4.1 Indicators (`core/src/indicators.rs`)

All return a `Series` aligned 1:1 with input candles; warm-up points are `None`.

| Function | Signature | Notes |
|----------|-----------|-------|
| `sma` | `(candles, period) -> Series` | rolling mean of closes |
| `ema` | `(candles, period) -> Series` | seeded with SMA of first `period` |
| `rsi` | `(candles, period) -> Series` | Wilder smoothing, bounded 0–100 |
| `macd` | `(candles, fast, slow, signal) -> Macd` | `{ macd, signal, histogram }` |
| `bollinger` | `(candles, period, std_devs) -> Bollinger` | `{ upper, middle, lower }` |
| `atr` | `(candles, period) -> Series` | Wilder-smoothed true range |

### 4.2 Backtest (`core/src/backtest.rs`)

`run_sma_crossover(candles, &BacktestConfig) -> BacktestResult`.

- Strategy: long when fast SMA crosses **above** slow SMA; exit on cross below.
- Position sizing: all-in on entry, fee applied on entry and exit.
- Open positions are force-closed at the last bar for accurate metrics.
- Metrics helpers (reusable for new strategies): `sharpe` (annualized via
  `periods_per_year`), `max_drawdown` (peak-to-trough %), `win_rate`.

### 4.3 CSV (`core/src/csv.rs`)

Dependency-free parser. Header is case-insensitive and order-flexible; requires a
date/time column (`date`/`time`/`timestamp`/`datetime`) plus `open/high/low/close`,
optional `volume`. Accepts ISO dates, `YYYY-MM-DD HH:MM:SS`, or UNIX seconds/ms.
Rows are sorted ascending by time. Uses a self-contained `days_from_civil` date
routine (no chrono).

### 4.4 Types (`core/src/types.rs`)

```rust
struct Candle { time: i64 /* unix s */, open, high, low, close, volume: f64 }
struct Series { time: Vec<i64>, values: Vec<Option<f64>> }
```

---

## 5. WASM API surface (`core/src/lib.rs`)

Exposed under `mod wasm_api` (compiled only with `--features wasm`). Each fn
parses candles via `serde-wasm-bindgen`, calls the pure-Rust function, and
serializes back to `JsValue`.

| Export | Purpose |
|--------|---------|
| `start()` | `#[wasm_bindgen(start)]` — installs panic hook |
| `parse_csv(csv) -> JsValue` | CSV string → `Candle[]` |
| `sma / ema / rsi(candles, period)` | single-series indicators |
| `macd(candles, fast, slow, signal)` | `Macd` |
| `bollinger(candles, period, std_devs)` | `Bollinger` |
| `atr(candles, period)` | ATR series |
| `backtest_sma_crossover(candles, config)` | `BacktestResult` |
| `version() -> String` | engine version |

The generated package lands in `web/src/wasm/` (git-ignored, regenerated).

---

## 6. Frontend reference

### 6.1 `engine.ts` — the bridge

The **only** module that imports from `web/src/wasm/`. It lazy-loads and
initializes the module exactly once (`getModule()` memoizes a promise),
`preloadEngine()` warms it on app mount, and the `engine` object exposes typed
async wrappers (`engine.sma`, `engine.backtestSmaCrossover`, …). Components must
never import `src/wasm/` directly.

### 6.2 Store (`store/useStore.ts`)

Zustand store. State: `watchlist`, `activeSymbol`, `candlesBySymbol`,
`indicators` (`IndicatorConfig[]`), `loading`, `error`, `storageReady`. Actions:
`init`, `setActiveSymbol`, `addSymbol`, `removeSymbol`, `loadCsv`, `loadProxy`,
`loadSampleData`, `toggleIndicator`, `setIndicatorPeriod`, `clearError`.

`init()` probes DuckDB, merges OPFS-cached symbols into the watchlist, then loads
the active symbol (DuckDB → OPFS → sample fallback). Derived collections are read
through the exported `useActiveCandles()` hook, which returns a **stable**
`EMPTY_CANDLES` fallback (see §8).

### 6.3 Components (`components/`)

| Component | Role |
|-----------|------|
| `CandleChart.tsx` | candlestick + WASM overlays (SMA/EMA/Bollinger) + optional RSI sub-pane |
| `Watchlist.tsx` | add/remove symbols, last price + % change, quick switch |
| `IndicatorPanel.tsx` | toggle indicators, edit periods |
| `BacktestPanel.tsx` | config inputs, run backtest, metric cards, equity curve |
| `DataLoader.tsx` | CSV upload, proxy fetch, CSV export |
| `ui.tsx` | `Button`, `Panel` primitives |

### 6.4 TypeScript contracts (`types.ts`)

Mirror the Rust serialized shapes: `Candle`, `Series` (`values: (number|null)[]`),
`MacdResult`, `BollingerResult`, `BacktestConfig`, `Trade`, `BacktestResult`,
`IndicatorConfig`, `IndicatorKind`.

---

## 7. Persistence model (`lib/storage.ts`)

Two-tier, both client-side and lazy-loaded:

1. **DuckDB-WASM** — analytical SQL store. A single `candles` table
   (`symbol, time, open, high, low, close, volume`). `saveCandles` replaces a
   symbol's rows via a registered JSON virtual file; `loadCandles` reads ordered
   ascending; `querySql` runs arbitrary read-only SQL.
2. **OPFS mirror** — durable offline cache. Each symbol is written as
   `axiomic/<symbol>.json` in the Origin Private File System so data survives
   reloads even before DuckDB initializes (`readOpfs`, `listCachedSymbols`).

`isStorageReady()` degrades gracefully to in-memory only when DuckDB/OPFS are
unavailable. SQL identifiers are escaped (`escapeSql`); only the app's own data
flows through these paths.

---

## 8. Critical conventions & pitfalls

1. **Analysis logic stays in Rust.** Add to `core/`, expose in `lib.rs`, never
   reimplement in TS.
2. **Rebuild WASM after any `core/` change** — the frontend uses the generated
   package, so Rust edits are inert until rebuilt. Use
   `scripts/rebuild-wasm.sh` (deletes the stray generated `.gitignore`).
3. **All WASM calls go through `engine.ts`.**
4. **Zustand stable-selector rule.** Never write a selector that returns a fresh
   array/object inline (e.g. `s => s.foo() ?? []`). React's `useSyncExternalStore`
   compares snapshot identity, so a new reference every render →
   "getSnapshot should be cached" → infinite update loop. Use a module-level
   constant fallback and a dedicated hook, as `useActiveCandles()` does.
5. **Keep heavy modules code-split** (WASM, charts, DuckDB) to protect initial load.
6. **`core` is dual-target** — keep `wasm-bindgen` behind the `wasm` feature.

---

## 9. Build, run, deploy

```bash
# Browser dev (COOP/COEP headers on; unlocks SharedArrayBuffer):
cd web && pnpm install && pnpm wasm && pnpm dev

# Production PWA → web/dist (service worker, code-split WASM/charts/duckdb):
cd web && pnpm build && pnpm preview

# Desktop (Tauri 2.0) — reuses web/dist + core natively:
cd desktop && pnpm install && pnpm dev      # or pnpm build

# Data proxy (Cloudflare Worker):
cd proxy && pnpm install && npx wrangler secret put DATA_API_KEY && pnpm deploy

# Native core tests:
cd core && cargo test
```

**Cloud headers:** for WASM threads the host must send
`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` on the HTML document (e.g. a
`web/public/_headers` file on Cloudflare Pages). The app runs single-threaded
without them.

---

## 10. Extension recipes

### Add an indicator
1. Implement in `indicators.rs` returning a `Series` (+ unit test).
2. Add a `#[wasm_bindgen]` wrapper in `lib.rs` (`parse_candles` → `to_js`).
3. `cargo test`, then rebuild WASM.
4. Add a method to `engine.ts`.
5. Add an `IndicatorConfig` + handling in `useStore.ts`; render in
   `CandleChart.tsx` (overlay) or a new sub-pane.

### Add a backtest strategy
1. Add strategy + reuse `sharpe`/`max_drawdown`/`win_rate` in `backtest.rs`.
2. Expose in `lib.rs`, rebuild WASM, add to `engine.ts`.
3. Surface controls in `BacktestPanel.tsx`.

### Add a data provider
1. Add a loader in `dataProvider.ts` returning `Candle[]`.
2. Wire a store action mirroring `loadProxy`/`loadCsv` (cache + persist).
3. Add a control in `DataLoader.tsx`.

---

## 11. Data contracts (quick reference)

```ts
Candle  = { time: number /* UNIX seconds */, open, high, low, close, volume: number }
Series  = { time: number[], values: (number | null)[] }   // aligned 1:1 with candles
Proxy   : GET /quotes?symbol=XYZ  ->  { candles: Candle[] }
```

---

## 12. Design note: why not `polars` in WASM?

`polars` is excellent natively but compiling it to `wasm32-unknown-unknown` is
heavy and bloats the bundle. For OHLCV workloads the indicators are tight,
allocation-light Rust loops (WASM payload ~125 KB). DuckDB-WASM provides the
in-browser SQL/DataFrame layer instead. The `core` API is structured so a
`polars`-backed native path could be added behind a feature flag later without
changing the frontend.

---

## 13. Verification checklist

- `cargo test` passes in `core/`
- WASM rebuilt; `web/src/wasm/.gitignore` removed
- `pnpm --dir web build` succeeds (typecheck + Vite build)
- New analysis is reachable only through `engine.ts`
- No Zustand selector returns a fresh array/object inline
