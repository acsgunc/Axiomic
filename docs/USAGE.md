# Using Axiomic & How Data Flows

This guide explains **how to use the app** and, in detail, **where the data comes
from** — whether it's live, and how it moves from a data source into the charts,
indicators, and backtests.

- [Quick start](#quick-start)
- [The interface](#the-interface)
- [Where the data comes from](#where-the-data-comes-from)
  - [1. Built-in sample data (default)](#1-built-in-sample-data-default--not-live)
  - [2. CSV upload (offline)](#2-csv-upload-offline--your-own-data)
  - [3. Live proxy (optional)](#3-live-proxy-optional--end-of-day-market-data)
- [Is it live?](#is-it-live)
- [How data flows through the app](#how-data-flows-through-the-app)
- [Where your data is stored](#where-your-data-is-stored)
- [Expected data format](#expected-data-format)
- [FAQ](#faq)

---

## Quick start

```bash
cd web
pnpm install
pnpm wasm     # build the Rust core → WebAssembly
pnpm dev      # http://localhost:5173
```

Open the app. A symbol from the watchlist (e.g. `AAPL`) loads **instantly** using
built-in sample data, so you can explore charts, indicators, and backtests with
**zero configuration and no internet connection**.

> All analysis (indicators, backtests, CSV parsing) runs **client-side** in a Rust
> core compiled to WebAssembly. Nothing is computed on a server.

---

## The interface

| Area | What it does |
| --- | --- |
| **Watchlist** | Pick the active symbol. Selecting one loads its candles (from cache, or generates sample data if none exists). Add/remove tickers. |
| **Chart** | Candlestick chart with WASM-computed indicator overlays and an RSI sub-pane. |
| **Indicators** | Toggle SMA, EMA, RSI, MACD, Bollinger Bands and tune their periods. Each change recomputes in Rust/WASM. |
| **Backtest** | Run an SMA-crossover strategy; see the equity curve plus return, Sharpe, max drawdown, and win rate. |
| **Data** | Bring your own data: **upload a CSV**, **export** the current series to CSV, or **fetch live** data by symbol (if a proxy is configured). |

---

## Where the data comes from

Axiomic has **three** independent data sources. The app works fully offline with
the first two; the third is opt-in.

### 1. Built-in sample data (default) — *not live*

When you select a symbol that has no cached data, the app **generates a
deterministic synthetic price series** in the browser (a seeded random walk with
drift and volatility). See [`web/src/lib/sampleData.ts`](../web/src/lib/sampleData.ts).

- **Live?** No. This is fabricated demo data, not real market prices.
- The seed is derived from the ticker symbol, so `AAPL` always produces the same
  series across reloads — handy for demos and reproducible testing.
- Requires no network and no configuration.

### 2. CSV upload (offline) — *your own data*

In the **Data** panel, upload an OHLCV CSV (try
[`examples/AAPL-sample.csv`](../examples/AAPL-sample.csv)). The file is read in the
browser and parsed by the **Rust/WASM** core — it never leaves your machine.

- **Live?** Only as live as the file you provide. If you export end-of-day data
  from your broker or a data vendor and upload it, that's the data you analyze.
- This is the recommended path for real, private analysis with no backend.

### 3. Live proxy (optional) — *end-of-day market data*

If you deploy the included **Cloudflare Worker proxy** and set the
`VITE_PROXY_URL` environment variable, the **Data** panel can fetch candles for a
symbol by name. The proxy exists to (a) bypass browser CORS restrictions and
(b) keep the upstream market-data **API key server-side** (never shipped to the
browser).

- The example proxy ([`proxy/src/worker.ts`](../proxy/src/worker.ts)) calls Alpha
  Vantage's `TIME_SERIES_DAILY` endpoint and returns `{ candles: [...] }`.
- **Live?** It returns **daily (end-of-day) candles**, not real-time streaming
  ticks. The latest bar is the most recent completed trading day. Results are
  cached (≈1 hour) at the edge.
- You can point the proxy at any provider by editing its `fetchUpstream` function.

Setup outline (see [`proxy/README.md`](../proxy/README.md) for full steps):

```bash
cd proxy
pnpm install
npx wrangler secret put DATA_API_KEY   # your upstream API key
npx wrangler deploy                    # gives you a Worker URL
```

Then in `web/.env` (copy from [`web/.env.example`](../web/.env.example)):

```
VITE_PROXY_URL=https://your-worker.workers.dev
```

Restart `pnpm dev`. The **Fetch live** action in the Data panel now works.

---

## Is it live?

**By default, no.** Out of the box Axiomic shows **deterministic sample data** so
it runs instantly with no setup or network.

To analyze **real** data you have two choices:

| You want… | Use | Live? |
| --- | --- | --- |
| Your own historical data, fully private/offline | **CSV upload** | As current as your file |
| Fetch-by-symbol from a market API | **Proxy** (`VITE_PROXY_URL`) | **End-of-day** daily bars (not real-time ticks) |

There is **no real-time streaming/tick feed** built in. The architecture (a
serverless proxy returning normalized candles) is designed for daily/historical
bars. Adding intraday or streaming data would mean adapting the proxy and the
provider it calls.

---

## How data flows through the app

```
 ┌─────────────────────────────────────────────────────────────┐
 │ Source                                                        │
 │   • Sample generator (in-browser, synthetic)                  │
 │   • CSV file (uploaded, parsed by Rust/WASM)                  │
 │   • Proxy /quotes?symbol=… (end-of-day candles from an API)   │
 └───────────────────────────┬─────────────────────────────────┘
                             ▼
                 Candle[] { time, open, high, low, close, volume }
                             ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ Zustand store (web/src/store/useStore.ts)                    │
 │   orchestrates loading; one source of truth per symbol        │
 └───────────────┬───────────────────────────┬─────────────────┘
                 ▼                            ▼
   DuckDB-WASM + OPFS cache         Rust/WASM engine (engine.ts)
   (persists across reloads)        indicators · backtest · parse
                                            ▼
                              Charts · Indicator overlays · Backtest UI
```

1. A source produces a `Candle[]` array (same shape regardless of origin).
2. The Zustand store ([`web/src/store/useStore.ts`](../web/src/store/useStore.ts))
   stores it per symbol and mirrors it to the client-side cache.
3. The chart and indicator components ask the **Rust/WASM engine**
   ([`web/src/engine.ts`](../web/src/engine.ts)) to compute SMA/EMA/RSI/etc. and
   run backtests — all in the browser.
4. On the next visit, the store re-hydrates cached symbols from DuckDB/OPFS so the
   data is there without re-fetching.

When you select a symbol, the store tries sources **in this order**
(see `setActiveSymbol`): in-memory → DuckDB cache → OPFS cache → generate sample
data (and cache it). Explicit actions (`loadCsv`, `loadProxy`) always override the
cache for that symbol.

---

## Where your data is stored

Everything stays **on your machine / in your browser** — there is no application
server holding your data.

- **DuckDB-WASM** — an in-browser analytical database holding the OHLCV `candles`
  table, enabling SQL queries client-side.
  See [`web/src/lib/storage.ts`](../web/src/lib/storage.ts).
- **OPFS (Origin Private File System)** — durable per-origin file storage. Each
  symbol's candles are mirrored as JSON so data survives reloads and DuckDB is
  re-hydrated on startup.
- Both are **lazy-loaded** on first use to keep the initial page load fast.

To clear cached data, clear the site's storage in your browser (or the app's
profile data in the desktop build).

---

## Expected data format

A **Candle** is:

```ts
{ time: number /* unix seconds */, open: number, high: number,
  low: number, close: number, volume: number }
```

**CSV** (header is case-insensitive; dates as `YYYY-MM-DD`):

```csv
Date,Open,High,Low,Close,Volume
2023-01-03,130.28,130.90,124.17,125.07,112117500
2023-01-04,126.89,128.66,125.08,126.36,89113600
```

Parsing is done by the dependency-free Rust parser in
[`core/src/csv.rs`](../core/src/csv.rs). Use **Export CSV** in the Data panel to
get the current series back out in this exact format.

The **proxy** must return either `{ "candles": Candle[] }` or a bare `Candle[]`,
with `time` in **unix seconds**.

---

## FAQ

**Does Axiomic need an internet connection?**
No — not for sample data, CSV upload, indicators, or backtests. Only the optional
*Fetch live* proxy path needs the network.

**Is there a real-time/streaming price feed?**
No. The live path returns **end-of-day daily candles**. Real-time/intraday would
require adapting the proxy and its upstream provider.

**Where is my uploaded CSV sent?**
Nowhere. It's read and parsed entirely in the browser by the WASM core.

**Can I use a provider other than Alpha Vantage?**
Yes. Edit `fetchUpstream` in [`proxy/src/worker.ts`](../proxy/src/worker.ts) to call
your provider and normalize its response into `Candle[]`.

**Why is the first symbol's data fake?**
So the app is instantly usable with no setup. Upload a CSV or configure the proxy
to analyze real data.
