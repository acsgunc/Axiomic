# Loading Live Data in the App

> How to enable and use the "Fetch Live Data" button in the web app's Data panel.

## Summary

The web app loads OHLCV candles three ways: **CSV upload** (offline, parsed in
Rust/WASM), **sample data**, and **live fetch** via a serverless proxy. The live
fetch button lives in the **Data** panel (bottom-left) and is only enabled when a
proxy URL is configured.

## Status

- **Fixed** — 2026-06-21 — The live-fetch control was a silently-disabled
  "Fetch via Proxy" button with only a tooltip, so it looked like the app had no
  live-data option. It's now labelled **"Fetch Live Data"** and, when no proxy is
  configured, shows an inline hint explaining how to turn it on.

## How to use

Live fetch needs the data proxy (Cloudflare Worker) deployed and the app pointed
at it:

1. Deploy the proxy and set its upstream API key (see [proxy/README.md](../../proxy/README.md)):
   ```bash
   cd proxy
   npx wrangler secret put DATA_API_KEY   # e.g. an Alpha Vantage key
   npx wrangler deploy
   ```
2. Point the web app at the deployed worker — create `web/.env` from the example:
   ```bash
   # web/.env
   VITE_PROXY_URL=https://axiomic-proxy.your-account.workers.dev
   ```
3. Restart the dev server (Vite only reads env at startup):
   ```bash
   pnpm --dir web dev
   ```
4. In the app, pick a symbol in the **Watchlist**, then click **Fetch Live Data**
   in the **Data** panel.

Without a proxy configured, the button stays disabled and the panel shows a hint;
use **Upload CSV** instead (columns: Date, Open, High, Low, Close, Volume).

## Notes / caveats

- The proxy returns **end-of-day daily bars**, not real-time ticks.
- The example upstream is Alpha Vantage's `TIME_SERIES_DAILY`; adapt
  `fetchUpstream` in [proxy/src/worker.ts](../../proxy/src/worker.ts) for another
  provider.
- The standalone `axiomic-data` Rust crate ([market-data](./market-data.md)) is a
  native CLI/demo and is **not** wired into the browser app (it depends on
  tokio/reqwest, which don't target WASM). The browser's live path is the proxy.

## Source

- [web/src/components/DataLoader.tsx](../../web/src/components/DataLoader.tsx)
- [web/src/lib/dataProvider.ts](../../web/src/lib/dataProvider.ts)
- [proxy/src/worker.ts](../../proxy/src/worker.ts)
- [web/.env.example](../../web/.env.example)
