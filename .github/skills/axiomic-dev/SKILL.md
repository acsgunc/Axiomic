---
name: axiomic-dev
description: 'Develop and maintain the Axiomic browser-first stock analysis app (Rust→WASM core + React/TS web + Tauri desktop + Cloudflare Worker proxy). USE WHEN: adding/editing technical indicators or backtest logic in the Rust core; rebuilding the WASM bundle after core changes; wiring new analysis into the React frontend; adding charts, indicators, watchlist, or backtest UI; working with DuckDB-WASM/OPFS storage; configuring the data proxy; building the PWA or Tauri desktop app. Covers project structure, build commands, and critical conventions (all analysis logic stays in Rust, WASM must be rebuilt after core edits, Zustand stable-selector pitfall).'
argument-hint: 'Describe the Axiomic task (e.g. "add Stochastic indicator", "rebuild wasm", "add comparison view")'
---

# Axiomic Development

Axiomic is a performance-first, browser-first stock analysis tool. All heavy
computation runs in a **Rust core compiled to WebAssembly**; the React frontend
only orchestrates and renders. The same `core` crate is reused by the Tauri
desktop build. There is **no analysis logic in JavaScript**.

> **Deep dive:** for the full architecture, data-flow diagrams, the complete WASM
> API surface, type contracts, the persistence model, and extension recipes, read
> [references/architecture.md](./references/architecture.md). Load it when a task
> needs more than the quick reference below.

## When to Use

- Adding or modifying technical indicators (SMA, EMA, RSI, MACD, Bollinger, ATR)
- Extending the backtest engine or adding strategies
- Rebuilding the WASM bundle after editing the Rust core
- Wiring new analysis results into React components/charts
- Working with DuckDB-WASM / OPFS persistence
- Configuring the serverless data proxy
- Building the PWA or the Tauri desktop app

## Project Map

```
core/        Rust analysis crate → WASM (cdylib + rlib)
  src/indicators.rs   pure-Rust indicators
  src/backtest.rs     SMA-crossover engine + metrics
  src/csv.rs          dependency-free OHLCV parser
  src/types.rs        Candle / Series shapes
  src/lib.rs          wasm-bindgen surface (behind `wasm` feature)
web/         React + TS + Vite frontend (shared by browser + desktop)
  src/engine.ts       lazy-loading WASM wrapper (the ONLY bridge to Rust)
  src/store/useStore.ts  Zustand state + useActiveCandles() hook
  src/components/     CandleChart, Watchlist, IndicatorPanel, BacktestPanel, DataLoader
  src/lib/            storage (DuckDB/OPFS), dataProvider, sampleData, utils
  src/wasm/           GENERATED wasm-pack output — never edit, gitignored
desktop/     Tauri 2.0 shell (reuses web/dist + core natively)
proxy/       Cloudflare Worker (CORS + API-key hiding)
examples/    Sample OHLCV CSV
```

## Critical Conventions

1. **Analysis logic lives in Rust only.** Never implement indicators, backtests,
   or CSV parsing in TypeScript. Add them to `core/` and expose via `lib.rs`.
2. **Rebuild WASM after any `core/` change.** The frontend imports the generated
   `web/src/wasm/` package; edits to Rust have no effect until rebuilt. Run the
   [rebuild script](./scripts/rebuild-wasm.sh) or `pnpm --dir web wasm`. The
   generated `web/src/wasm/.gitignore` must be deleted after each build (the
   script handles this).
3. **All WASM calls go through `web/src/engine.ts`.** It lazy-loads/initializes
   the module once. Components must not import from `src/wasm/` directly.
4. **Zustand selectors must return stable references.** Never write a selector
   that returns a fresh array/object (e.g. `s => s.activeCandles()` returning
   `?? []`) — it causes an infinite render loop ("getSnapshot should be cached").
   Use the `useActiveCandles()` hook (stable `EMPTY_CANDLES` fallback) as the
   pattern for any derived collection.
5. **Code-split heavy modules.** WASM, charts, and DuckDB are lazy-loaded; keep
   them that way to protect initial load time.
6. **`core` is dual-target.** It builds as `cdylib` (WASM) and `rlib` (native).
   The `wasm` feature gates the `wasm-bindgen` surface — keep native builds
   (desktop) free of `wasm-bindgen` deps.

## Common Procedures

### Add a new indicator

1. Implement it in [core/src/indicators.rs](../../../core/src/indicators.rs)
   returning a `Series` aligned 1:1 with input candles (`None` for warm-up).
   Add a `#[cfg(test)]` unit test.
2. Export a `#[wasm_bindgen]` wrapper in
   [core/src/lib.rs](../../../core/src/lib.rs) under `mod wasm_api`, parsing
   candles via `parse_candles` and serializing with `to_js`.
3. `cargo test` in `core/`, then rebuild WASM (see below).
4. Add a method to the `engine` object in
   [web/src/engine.ts](../../../web/src/engine.ts).
5. Add an `IndicatorConfig` entry / handling in
   [web/src/store/useStore.ts](../../../web/src/store/useStore.ts) and render it
   in [web/src/components/CandleChart.tsx](../../../web/src/components/CandleChart.tsx)
   (overlay) or a sub-pane like RSI.

### Add/extend a backtest strategy

1. Add the strategy + metrics to
   [core/src/backtest.rs](../../../core/src/backtest.rs); reuse `sharpe`,
   `max_drawdown`, `win_rate` helpers.
2. Expose via `lib.rs`, rebuild WASM, add to `engine.ts`, then surface controls
   in [web/src/components/BacktestPanel.tsx](../../../web/src/components/BacktestPanel.tsx).

### Rebuild the WASM core

```bash
bash .github/skills/axiomic-dev/scripts/rebuild-wasm.sh
# or:
cd core && wasm-pack build --release --target web --out-dir ../web/src/wasm --features wasm && rm -f ../web/src/wasm/.gitignore
```

### Run / build

```bash
# Browser dev (COOP/COEP headers enabled):
cd web && pnpm install && pnpm wasm && pnpm dev

# PWA production build → web/dist:
cd web && pnpm build && pnpm preview

# Desktop (Tauri 2.0), reuses web frontend + core:
cd desktop && pnpm install && pnpm dev   # or pnpm build
# Or one-command launchers (build WASM + deps + run), see desktop/README.md:
#   Windows:      desktop\scripts\run-desktop.ps1 [-Mode build] [-SkipWasm]
#   macOS/Linux:  desktop/scripts/run-desktop.sh [build]   (SKIP_WASM=1 to skip)

# Data proxy (Cloudflare Worker):
cd proxy && pnpm install && npx wrangler secret put DATA_API_KEY && pnpm deploy
```

### Test the core

```bash
cd core && cargo test
```

## Verification Checklist

- `cargo test` passes in `core/`
- WASM rebuilt; `web/src/wasm/.gitignore` removed
- `pnpm --dir web build` succeeds (typecheck + Vite build)
- New analysis is reachable only through `engine.ts`
- No Zustand selector returns a fresh array/object inline

## Data Contract

`Candle = { time: number /* UNIX seconds */, open, high, low, close, volume }`.
`Series = { time: number[], values: (number|null)[] }` aligned 1:1 with candles.
The proxy returns `{ candles: Candle[] }` from `GET /quotes?symbol=XYZ`.

## Design Note

Indicators are tight Rust loops rather than `polars` (which bloats `wasm32`
heavily). DuckDB-WASM provides the in-browser SQL/DataFrame layer. The `core`
API is structured so a `polars`-backed native path could be added behind a
feature flag without changing the frontend.
