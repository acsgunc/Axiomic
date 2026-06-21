# Loading Live Data in the App

> How to enable and use the "Fetch Live Data" button in the web app's Data panel.

## Summary

The web app loads OHLCV candles three ways: **CSV upload** (offline, parsed in
Rust/WASM), **sample data**, and **live fetch**. How live fetch works depends on
where the app runs:

- **Desktop (Tauri):** fetches **natively** via the `axiomic-data` crate, with a
  **Source** dropdown to switch between `yfinance-rs` and `yahoo_finance_api`
  (both free, no API key). No proxy needed.
- **Browser:** fetches via a serverless proxy (Cloudflare Worker) that fronts
  **Yahoo Finance** (free, **no API key**), since the Yahoo crates can't run in
  WASM and browsers block the upstream directly (CORS).

The live fetch button lives in the **Data** panel (bottom-left).

## Data mode (Live vs Local)

The **Data** panel has a **Data mode** toggle that controls what happens when you
select a symbol:

- **Live** — automatically fetches fresh data on symbol select (native on
  desktop, proxy in browser). If a fetch fails, it falls back to local data and
  shows a notice.
- **Local** — uses cached/sample data only; no network calls.

The choice is **persisted** (localStorage), so "always live" stays on across
restarts. Live is only selectable when a live source is available (desktop app,
or a configured proxy in the browser); otherwise the app stays in Local mode.

## Status

- **Fixed** — 2026-06-21 — Browser live fetch failed with "Network error
  contacting the data proxy". The proxy now fronts **Yahoo Finance** (free, **no
  API key**) instead of Alpha Vantage, so it works with just `pnpm --dir proxy
  dev` — no secret to configure. The proxy dev port is pinned to `8787` to match
  `web/.env`.
- **Fixed** — 2026-06-21 — Desktop app loaded stale/blank content because Vite
  silently moved to port 5174 when 5173 was busy while Tauri's `devUrl` stayed on
  5173. Vite now uses `strictPort` on 5173 and `run-desktop.ps1` reports a busy
  port early.
- **Added** — 2026-06-21 — **Data mode** toggle (Live / Local) in the Data panel:
  choose whether selecting a symbol auto-fetches live data or uses local/cached
  data. Persisted across sessions.
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

### Browser — local development (proxy, no API key)

1. Start the proxy and the web app (separate terminals):
   ```bash
   pnpm --dir proxy dev   # http://localhost:8787 (Yahoo Finance, no key)
   pnpm --dir web dev     # http://localhost:5173
   ```
   `web/.env` already points `VITE_PROXY_URL` at `http://localhost:8787`.
2. In the app, switch **Data mode** to **Live** and pick a symbol in the
   **Watchlist** (or click **Fetch Live Data**). Candles stream in from Yahoo via
   the proxy.

### Production (deployed Worker)

1. Deploy the proxy (no secret required — it uses Yahoo Finance):
   ```bash
   cd proxy
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
- **Browser:** the upstream is Yahoo Finance's public chart API
  (`query1.finance.yahoo.com/v8/finance/chart/{symbol}`) — free and key-less. The
  proxy normalizes it to `{ candles: Candle[] }`; adapt `fetchUpstream` in
  [proxy/src/worker.ts](../../proxy/src/worker.ts) for another provider. Yahoo can
  rate-limit or change without notice.
- The frontend detects the desktop shell via the global Tauri API
  (`withGlobalTauri: true`); in the browser that global is absent, so it falls
  back to the proxy path automatically.

## Source

- [desktop/src-tauri/src/lib.rs](../../desktop/src-tauri/src/lib.rs) — `fetch_history` command
- [web/src/components/DataLoader.tsx](../../web/src/components/DataLoader.tsx) — Source selector + buttons
- [web/src/lib/dataProvider.ts](../../web/src/lib/dataProvider.ts) — `isDesktop`, `loadFromNative`
- [web/src/store/useStore.ts](../../web/src/store/useStore.ts) — `provider`, `loadNative`
- [proxy/src/worker.ts](../../proxy/src/worker.ts) — browser proxy path
