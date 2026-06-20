# Loading Live Data in the App

> How to enable and use the "Fetch Live Data" button in the web app's Data panel.

## Summary

The web app loads OHLCV candles three ways: **CSV upload** (offline, parsed in
Rust/WASM), **sample data**, and **live fetch**. How live fetch works depends on
where the app runs:

- **Desktop (Tauri):** fetches **natively** via the `axiomic-data` crate, with a
  **Source** dropdown to switch between `yfinance-rs` and `yahoo_finance_api`
  (both free, no API key). No proxy needed.
- **Browser:** fetches via a serverless proxy (Cloudflare Worker), since the
  Yahoo crates can't run in WASM.

The live fetch button lives in the **Data** panel (bottom-left).

## Status

- **Added** — 2026-06-21 — Desktop app gained a **Source** provider selector
  (yfinance-rs / yahoo_finance_api) and a native **Fetch Live Data** path via a
  new `fetch_history` Tauri command — no proxy or API key required.
- **Fixed** — 2026-06-21 — The live-fetch control was a silently-disabled
  "Fetch via Proxy" button with only a tooltip, so it looked like the app had no
  live-data option. It's now labelled **"Fetch Live Data"** and, when no proxy is
  configured (browser), shows an inline hint explaining how to turn it on.

## How to use

### Desktop app (native — no setup, recommended)

1. Run the desktop app:
   ```bash
   pnpm --dir desktop dev      # or: pnpm --dir desktop build
   ```
2. Pick a symbol in the **Watchlist**.
3. In the **Data** panel choose a **Source**:
   - **yfinance-rs (Yahoo)** — the modern client.
   - **yahoo_finance_api (legacy)** — the long-standing client.
4. Click **Fetch Live Data**. Candles are fetched in Rust and rendered.

Both providers use free Yahoo Finance endpoints; no key or proxy is involved.

### Browser — local development (proxy)

1. Get a free upstream key (the sample uses Alpha Vantage:
   https://www.alphavantage.co/support/#api-key).
2. Add it to the proxy's local secrets file (gitignored):
   ```bash
   cd proxy
   cp .dev.vars.example .dev.vars   # then paste your key into .dev.vars
   ```
3. Start the proxy and the web app (separate terminals):
   ```bash
   pnpm --dir proxy dev   # http://localhost:8787
   pnpm --dir web dev
   ```
   `web/.env` already points `VITE_PROXY_URL` at `http://localhost:8787`.
4. In the app, pick a symbol in the **Watchlist**, then click **Fetch Live Data**
   in the **Data** panel.

### Production (deployed Worker)

1. Deploy the proxy and set its upstream API key (see [proxy/README.md](../../proxy/README.md)):
   ```bash
   cd proxy
   npx wrangler secret put DATA_API_KEY   # e.g. an Alpha Vantage key
   npx wrangler deploy
   ```
2. Point the web app at the deployed worker in `web/.env`:
   ```bash
   # web/.env
   VITE_PROXY_URL=https://axiomic-proxy.your-account.workers.dev
   ```
3. Restart the dev server (Vite only reads env at startup):
   ```bash
   pnpm --dir web dev
   ```

Without a proxy configured **in the browser**, the button stays disabled and the
panel shows a hint; use **Upload CSV** instead (columns: Date, Open, High, Low,
Close, Volume). The desktop app does not need any of this.

## Notes / caveats

- Both paths return **end-of-day daily bars**, not real-time ticks.
- **Desktop:** the provider selector maps to `Provider::YFinance` /
  `Provider::LegacyApi` in the `fetch_history` Tauri command, which calls the
  `axiomic-data` crate ([market-data](./market-data.md)). Yahoo's free endpoints
  can rate-limit or change without notice.
- **Browser:** the example upstream is Alpha Vantage's `TIME_SERIES_DAILY`; adapt
  `fetchUpstream` in [proxy/src/worker.ts](../../proxy/src/worker.ts) for another
  provider.
- The frontend detects the desktop shell via the global Tauri API
  (`withGlobalTauri: true`); in the browser that global is absent, so it falls
  back to the proxy path automatically.

## Source

- [desktop/src-tauri/src/lib.rs](../../desktop/src-tauri/src/lib.rs) — `fetch_history` command
- [web/src/components/DataLoader.tsx](../../web/src/components/DataLoader.tsx) — Source selector + buttons
- [web/src/lib/dataProvider.ts](../../web/src/lib/dataProvider.ts) — `isDesktop`, `loadFromNative`
- [web/src/store/useStore.ts](../../web/src/store/useStore.ts) — `provider`, `loadNative`
- [proxy/src/worker.ts](../../proxy/src/worker.ts) — browser proxy path
