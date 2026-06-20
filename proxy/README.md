# Axiomic Data Proxy

A tiny [Cloudflare Worker](https://workers.cloudflare.com/) that fronts a
market-data API. It exists for two reasons:

1. **CORS** — browsers cannot call most data APIs directly. The Worker adds the
   appropriate `Access-Control-Allow-Origin` headers.
2. **Key hiding** — your upstream API key stays server-side as a Worker secret
   and is never shipped to the browser.

> The proxy is **optional**. Axiomic works fully offline with CSV upload and
> built-in sample data. Configure the proxy only if you want live data.

## Contract

```
GET /quotes?symbol=AAPL  →  { "candles": Candle[] }

Candle = {
  time: number,   // UNIX seconds
  open, high, low, close, volume: number
}
```

## Develop

```bash
cd proxy
pnpm install
npx wrangler secret put DATA_API_KEY   # paste your upstream key
pnpm dev                               # http://localhost:8787
```

Test it:

```bash
curl "http://localhost:8787/quotes?symbol=AAPL" | head
```

## Deploy

```bash
pnpm deploy
```

Then point the frontend at it by setting `VITE_PROXY_URL` in `web/.env`:

```
VITE_PROXY_URL=https://axiomic-proxy.your-account.workers.dev
```

## Adapting the provider

The sample targets Alpha Vantage's `TIME_SERIES_DAILY`. To use a different
provider, edit `fetchUpstream()` in [`src/worker.ts`](src/worker.ts) so it
returns the normalized `Candle[]` shape above. A Vercel Edge Function variant
is straightforward — reuse the same normalization and return the same JSON.
