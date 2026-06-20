# Build Prompt: Axiomic — Browser-First Stock Analysis Tool

## Project Overview
Build **Axiomic**, a personal stock analysis tool that is **super fast**, runs **100% in the browser** via WebAssembly, and can optionally be packaged as a **cross-platform desktop app** (Windows/macOS/Linux) and deployed to the **cloud** — all sharing a single codebase.

The name "Axiomic" evokes *axioms* — foundational truths — reflecting the app's goal of turning raw market data into clear, fundamental insights.

## Core Requirements
1. **Performance-first**: All heavy computation (technical indicators, backtesting, aggregations) runs in a Rust core compiled to WebAssembly, executing client-side at near-native speed.
2. **Browser-only by default**: The entire analysis and storage layer works in the browser with no backend required.
3. **Cross-platform desktop**: The same web frontend packages into native desktop apps via Tauri 2.0.
4. **Cloud-deployable**: The frontend deploys as a static PWA; the Rust core is reused unchanged.

## Technology Stack
- **Analysis engine**: Rust, compiled to WASM with `wasm-bindgen` / `wasm-pack`
  - `polars` for DataFrame operations on OHLCV time-series data
  - Technical indicators: RSI, MACD, SMA/EMA, Bollinger Bands, ATR (use the `ta` crate or implement)
  - Backtesting module with performance metrics (returns, Sharpe ratio, max drawdown, win rate)
- **In-browser database**: DuckDB-WASM for client-side SQL analytics over historical price data
- **Local persistence**: IndexedDB or OPFS (Origin Private File System) to cache datasets offline
- **Frontend**: React + TypeScript + Vite
  - Charting: TradingView Lightweight Charts (candlesticks, indicator overlays)
  - Styling: Tailwind CSS + shadcn/ui
  - State management: Zustand (lightweight) or React Query for async
- **Desktop shell**: Tauri 2.0 (reuses the same frontend)
- **Data fetching**: A lightweight serverless proxy (Cloudflare Worker or Vercel Edge Function) to bypass CORS and hide API keys; also support CSV upload for fully offline use.

## Architecture
- A shared Rust `core` crate containing all analysis logic, exposed to JS via WASM bindings.
- The React app calls into the WASM module for all computation — no analysis logic in JavaScript.
- DuckDB-WASM stores and queries historical data entirely client-side.
- Optional WASM threads (SharedArrayBuffer + COOP/COEP headers) for parallel backtests.
- The same `core` crate is consumed by the Tauri desktop build and (optionally) a server build, so logic is written once and reused everywhere.

```
┌──────────────────────────────────────────────┐
│              Axiomic Frontend (React + TS)      │
│   Lightweight Charts · Tailwind · shadcn/ui     │
└───────┬─────────────────────────────┬───────────┘
        │ WASM bindings               │ Tauri IPC
┌───────▼──────────────┐    ┌──────────▼───────────┐
│  Rust `core` (WASM)  │    │   Tauri Desktop Shell │
│  polars · indicators │    │   (reuses frontend)   │
│  backtest engine     │    └───────────────────────┘
└───────┬──────────────┘
        │
┌───────▼──────────────┐    ┌───────────────────────┐
│   DuckDB-WASM        │    │  Serverless Proxy      │
│   (client-side SQL)  │    │  (CORS + API key hide) │
└──────────────────────┘    └───────────────────────┘
```

## Features (MVP)
1. **Data loading**: Import stock data via (a) CSV upload and (b) a configurable data-provider proxy.
2. **Charting**: Interactive candlestick charts with selectable timeframes (1D, 1W, 1M, 1Y).
3. **Indicators**: Compute and overlay technical indicators (RSI, MACD, SMA, EMA, Bollinger Bands) — calculated in Rust/WASM.
4. **Storage**: Store/query historical data with DuckDB-WASM; persist locally so the app works offline.
5. **Backtesting**: A simple backtesting view — define a basic rule-based strategy and see performance metrics.
6. **Watchlist**: Manage a list of symbols with quick switching between them.

## Non-Functional Requirements
- Lazy-load and code-split the WASM bundle to keep initial load fast.
- Configure COOP/COEP headers to enable WASM threads where supported.
- Make it an installable **PWA** (offline-capable).
- Responsive, dark-mode-friendly UI.
- Clear error handling for failed data fetches and malformed CSV uploads.

## Project Structure
```
axiomic/
├── core/              # Rust analysis crate (compiles to WASM)
│   ├── src/
│   │   ├── indicators.rs
│   │   ├── backtest.rs
│   │   └── lib.rs
│   └── Cargo.toml
├── web/               # React + TS frontend (shared by browser + desktop)
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
├── desktop/           # Tauri 2.0 shell
│   └── src-tauri/
├── proxy/             # Serverless data-fetch proxy (optional)
└── README.md
```

## Deliverables
- A working monorepo with the structure above.
- The Rust `core` crate building to WASM and callable from React.
- A functional MVP demonstrating chart rendering + at least two indicators + CSV data load + a basic backtest.
- README documenting how to: run in the browser (dev + build), build the desktop app, and deploy the PWA to the cloud.

## Stretch Goals (optional)
- Real-time quotes via WebSocket streaming.
- Multiple chart layouts / comparison view for several symbols.
- Export analysis results and backtest reports (CSV/JSON).
- Strategy builder UI with visual rule composition.