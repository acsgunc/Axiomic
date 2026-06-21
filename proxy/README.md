# Axiomic Data Proxy

A tiny [Cloudflare Worker](https://workers.cloudflare.com/) that fronts
**Yahoo Finance's** public chart API. It exists because browsers cannot call the
upstream directly (CORS); the Worker adds the appropriate
`Access-Control-Allow-Origin` headers and normalizes the response.

The upstream is **free and needs no API key**, so the proxy works out of the box
— just run it.

> The proxy is **optional**. Axiomic works fully offline with CSV upload and
> built-in sample data, and the desktop app fetches Yahoo natively (no proxy).
> Use the proxy only for live data in the **browser**.

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
pnpm dev                               # http://localhost:8787 (no key needed)
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

The default upstream is Yahoo Finance's `v8/finance/chart` endpoint. To use a
different provider, edit `fetchUpstream()` in [`src/worker.ts`](src/worker.ts) so
it returns the normalized `Candle[]` shape above. A Vercel Edge Function variant
is straightforward — reuse the same normalization and return the same JSON.
