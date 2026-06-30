# Axiomic

**Browser-first stock analysis** — super fast, runs **100% in the browser** via
WebAssembly, and optionally packages as a **cross-platform desktop app** or
deploys to the **cloud as a PWA**, all from a single codebase.

The name evokes *axioms* — foundational truths — reflecting the goal of turning
raw market data into clear, fundamental insights.

> All heavy computation (technical indicators, backtesting, CSV parsing) runs in
> a **Rust core compiled to WebAssembly**, executing client-side at near-native
> speed. There is **no analysis logic in JavaScript**.

---

## Highlights

- ⚡ **Rust + WASM analysis engine** — SMA, EMA, RSI, MACD, Bollinger Bands, ATR,
  and an SMA-crossover backtester with returns, Sharpe, max drawdown, win rate.
- 🌐 **Browser-only by default** — no backend required. DuckDB-WASM + OPFS provide
  client-side SQL analytics and durable offline caching.
- 🖥️ **Cross-platform desktop** via **Tauri 2.0**, reusing the same frontend and
  the same `core` crate natively.
- ☁️ **Cloud-deployable** as a static, installable **PWA**.
- 📈 Interactive candlestick charts (TradingView Lightweight Charts) with WASM-
  computed indicator overlays and an RSI sub-pane.
- 🧩 Optional serverless **proxy** (Cloudflare Worker) for CORS-free live data
  with server-side API keys — or just upload a CSV for fully offline use.

## Architecture

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

The single `core` crate is consumed by the **WASM** build (browser/PWA) and the
**native** build (Tauri desktop), so analysis logic is written once and reused
everywhere.

## Project structure

```
axiomic/
├── core/                  # Rust analysis crate → compiles to WASM
│   └── src/
│       ├── indicators.rs  # SMA, EMA, RSI, MACD, Bollinger, ATR
│       ├── backtest.rs    # SMA-crossover engine + metrics
│       ├── csv.rs         # dependency-free OHLCV CSV parser
│       ├── types.rs       # Candle / Series shapes
│       └── lib.rs         # wasm-bindgen surface
├── web/                   # React + TS + Vite frontend (shared by browser + desktop)
│   └── src/
│       ├── engine.ts      # lazy-loading WASM wrapper
│       ├── components/    # chart, watchlist, indicators, backtest, data loader
│       ├── lib/           # storage (DuckDB/OPFS), data providers, utils
│       └── store/         # Zustand app state
├── desktop/               # Tauri 2.0 shell
│   └── src-tauri/
├── proxy/                 # Serverless data-fetch proxy (Cloudflare Worker)
├── examples/              # Sample OHLCV CSV
└── README.md
```

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| [Rust](https://rustup.rs/) | 1.75+ | with `wasm32-unknown-unknown` target |
| [`wasm-pack`](https://rustwasm.github.io/wasm-pack/) | latest | `cargo install wasm-pack` |
| [Node.js](https://nodejs.org/) | 18+ | |
| [pnpm](https://pnpm.io/) | 9+ | `npm i -g pnpm` |
| [Tauri prereqs](https://v2.tauri.app/start/prerequisites/) | — | only for the desktop build |

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
```

---

## Run in the browser

### 1. Build the Rust core to WASM

```bash
cd web
pnpm install
pnpm wasm        # builds ../core → web/src/wasm via wasm-pack
```

### 2. Dev server

```bash
pnpm dev         # http://localhost:5173 (COOP/COEP headers enabled)
```

Open the app, then:

- Pick a symbol in the **Watchlist** (built-in deterministic sample data loads
  instantly), or
- **Upload CSV** in the *Data* panel — try [`examples/AAPL-sample.csv`](examples/AAPL-sample.csv).
- Toggle **Indicators** and tune their periods (recomputed in Rust/WASM).
- Run a **Backtest** (SMA crossover) and inspect the equity curve + metrics.

> **New to the app?** See [docs/USAGE.md](docs/USAGE.md) for a full walkthrough of
> the interface and a detailed explanation of **where the data comes from** —
> sample data vs. CSV upload vs. the optional live proxy (and whether it's "live").

### 3. Production build

```bash
pnpm build       # → web/dist (static PWA, service worker, code-split WASM)
pnpm preview     # serve the build locally with COOP/COEP headers
```

The WASM core, charts, and DuckDB bundles are **code-split and lazy-loaded** to
keep the initial load fast.

---

## Build the desktop app (Tauri 2.0)

The desktop shell reuses the exact same frontend (`web/dist`) and the shared
`core` crate natively.

**One-command launchers** (check prerequisites, build the WASM core, install
deps, then run/build) — see [desktop/README.md](desktop/README.md) for full
details:

```powershell
# Windows (PowerShell):
desktop\scripts\run-desktop.ps1            # dev window
desktop\scripts\run-desktop.ps1 -Mode build   # .msi / .exe installers
```

```bash
# macOS / Linux:
desktop/scripts/run-desktop.sh             # dev window
desktop/scripts/run-desktop.sh build       # .dmg / .deb / .AppImage
```

**Or manually:**

```bash
cd desktop
pnpm install

# Dev (auto-runs the web dev server):
pnpm dev

# Release bundles for the current OS (Windows .msi/.exe, macOS .dmg, Linux .deb/.AppImage):
pnpm build
```

> First run compiles the Rust backend and downloads the system WebView — give it
> a few minutes. See [desktop/README.md](desktop/README.md) and the
> [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for platform-
> specific dependencies (WebView2 on Windows, `webkit2gtk` on Linux).

The backend also exposes the shared engine over IPC (`run_backtest`,
`engine_version`) as a demonstration of reusing `core` natively.

---

## Deploy the PWA to the cloud

> **Full guide:** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — free-tier comparison
> (Cloudflare Pages recommended), step-by-step for Cloudflare / Vercel / Netlify,
> GitHub Actions CI, custom domains, and troubleshooting. The repo ships drop-in
> config for all three hosts.

The build output in `web/dist` is fully static and can be hosted anywhere.

> **Important:** for WASM threads (`SharedArrayBuffer`) the host **must** send
> cross-origin isolation headers on the HTML document:
>
> ```
> Cross-Origin-Opener-Policy: same-origin
> Cross-Origin-Embedder-Policy: require-corp
> ```
>
> The app runs without these (single-threaded); they only unlock parallelism.

### Cloudflare Pages

```bash
cd web && pnpm build
npx wrangler pages deploy dist --project-name axiomic
```

Add the COOP/COEP headers via a `web/public/_headers` file:

```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```

### Vercel / Netlify

Deploy `web` as a static site (build command `pnpm build`, output `dist`) and
add the same two headers in `vercel.json` / `netlify.toml`.

---

## Live data (optional proxy)

By default the app uses CSV upload + sample data and needs no network. To fetch
live quotes without CORS issues and without exposing your API key, deploy the
[Cloudflare Worker proxy](proxy/README.md):

```bash
cd proxy
pnpm install
npx wrangler secret put DATA_API_KEY
pnpm deploy
```

Then set `VITE_PROXY_URL` in `web/.env` (see [`web/.env.example`](web/.env.example))
and use **Fetch via Proxy** in the *Data* panel.

---

## Features (MVP)

| Feature | Status | Where |
| --- | --- | --- |
| CSV import (parsed in Rust/WASM) | ✅ | *Data → Upload CSV* |
| Configurable data-provider proxy | ✅ | *Data → Fetch via Proxy* + `proxy/` |
| Candlestick charts, timeframes (1D–ALL) | ✅ | center panel |
| Indicators: SMA, EMA, RSI, MACD, Bollinger | ✅ | *Indicators* panel |
| DuckDB-WASM storage + offline (OPFS) | ✅ | `web/src/lib/storage.ts` |
| Backtesting (SMA crossover) + metrics | ✅ | *Backtest* panel |
| Watchlist with quick switching | ✅ | left panel |
| Installable PWA, dark mode, responsive | ✅ | — |
| CSV export | ✅ | *Data → Export CSV* |

## Testing the core

```bash
cd core
cargo test            # native unit tests for indicators, csv, backtest
```

## Design notes

- **Why not `polars` in WASM?** `polars` is excellent natively but compiling it
  to `wasm32-unknown-unknown` is heavy and bloats the bundle significantly. For
  the MVP's OHLCV workloads, the indicators are implemented as tight, allocation-
  light Rust loops, keeping the WASM payload ~125 KB. DuckDB-WASM provides the
  SQL/DataFrame-style analytics layer in the browser instead. The `core` API is
  structured so a `polars`-backed native path could be added behind a feature
  flag later without changing the frontend.
- **One core, many targets.** `core` builds as both `cdylib` (WASM) and `rlib`
  (native), with the `wasm` feature gating the `wasm-bindgen` surface.

## Stretch goals (not yet implemented)

- Real-time quotes via WebSocket streaming.
- Multi-symbol comparison / multiple chart layouts.
- JSON backtest report export.
- Visual strategy builder.

## License

MIT
