/**
 * Axiomic data-fetch proxy — Cloudflare Worker.
 *
 * Purpose:
 *  - Bypass browser CORS restrictions when calling market-data APIs.
 *  - Keep the upstream API key server-side (never shipped to the browser).
 *
 * Contract (consumed by web/src/lib/dataProvider.ts):
 *   GET /quotes?symbol=AAPL  ->  { "candles": Candle[] }
 *   Candle = { time: number(unix sec), open, high, low, close, volume }
 *
 * Configure the upstream key as a Worker secret:
 *   npx wrangler secret put DATA_API_KEY
 *
 * This example targets Alpha Vantage's TIME_SERIES_DAILY endpoint; adapt the
 * `fetchUpstream` function to your provider of choice.
 */

export interface Env {
  DATA_API_KEY: string;
  // Optional comma-separated allowlist of origins for CORS.
  ALLOWED_ORIGINS?: string;
}

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    if (url.pathname !== '/quotes') {
      return json({ error: 'Not found' }, 404, cors);
    }

    const symbol = url.searchParams.get('symbol');
    if (!symbol || !/^[A-Za-z.\-]{1,12}$/.test(symbol)) {
      return json({ error: 'Invalid or missing symbol' }, 400, cors);
    }

    try {
      const candles = await fetchUpstream(symbol.toUpperCase(), env);
      return json({ candles }, 200, cors, /* cacheSeconds */ 3600);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upstream error';
      return json({ error: message }, 502, cors);
    }
  },
};

/** Fetches and normalizes daily candles from the upstream provider. */
async function fetchUpstream(symbol: string, env: Env): Promise<Candle[]> {
  if (!env.DATA_API_KEY) {
    throw new Error('Proxy not configured: missing DATA_API_KEY secret.');
  }
  const endpoint =
    `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY` +
    `&symbol=${encodeURIComponent(symbol)}&outputsize=full&apikey=${env.DATA_API_KEY}`;

  const res = await fetch(endpoint, { cf: { cacheTtl: 3600 } });
  if (!res.ok) throw new Error(`Upstream HTTP ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;

  const series = data['Time Series (Daily)'] as
    | Record<string, Record<string, string>>
    | undefined;
  if (!series) {
    const note = (data['Note'] || data['Information'] || data['Error Message']) as
      | string
      | undefined;
    throw new Error(note || 'No data returned from upstream.');
  }

  const candles: Candle[] = Object.entries(series).map(([date, ohlc]) => ({
    time: Math.floor(new Date(date + 'T00:00:00Z').getTime() / 1000),
    open: Number(ohlc['1. open']),
    high: Number(ohlc['2. high']),
    low: Number(ohlc['3. low']),
    close: Number(ohlc['4. close']),
    volume: Number(ohlc['5. volume']),
  }));

  candles.sort((a, b) => a.time - b.time);
  return candles;
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = (env.ALLOWED_ORIGINS ?? '*')
    .split(',')
    .map((s) => s.trim());
  const allowOrigin =
    allowed.includes('*') || allowed.includes(origin) ? origin || '*' : 'null';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function json(
  body: unknown,
  status: number,
  cors: Record<string, string>,
  cacheSeconds = 0,
): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...cors,
  };
  if (cacheSeconds > 0) {
    headers['Cache-Control'] = `public, max-age=${cacheSeconds}`;
  }
  return new Response(JSON.stringify(body), { status, headers });
}
