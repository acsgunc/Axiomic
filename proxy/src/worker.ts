/**
 * Axiomic data-fetch proxy — Cloudflare Worker.
 *
 * Purpose:
 *  - Bypass browser CORS restrictions when calling market-data APIs.
 *
 * Contract (consumed by web/src/lib/dataProvider.ts):
 *   GET /quotes?symbol=AAPL[&provider=yfinance|yahoo]  ->  { "candles": Candle[] }
 *   Candle = { time: number(unix sec), open, high, low, close, volume }
 *
 * Upstream: Yahoo Finance's public chart API — free and requires NO API key,
 * matching the data source the desktop app uses natively. The optional
 * `provider` param selects which Yahoo edge host to query (mirrors the desktop
 * provider switch). Just run the proxy (`pnpm dev` -> wrangler dev on :8787) and
 * the web app's live fetch works.
 */

export interface Env {
  // Optional comma-separated allowlist of origins for CORS.
  ALLOWED_ORIGINS?: string;
  // Optional override for how much history to request (e.g. "10y", "max").
  HISTORY_RANGE?: string;
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

    const provider = parseProvider(url.searchParams.get('provider'));

    try {
      const candles = await fetchUpstream(symbol.toUpperCase(), provider, env);
      return json({ candles }, 200, cors, /* cacheSeconds */ 3600);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upstream error';
      return json({ error: message }, 502, cors);
    }
  },
};

/**
 * Selectable upstream hosts. Both serve Yahoo Finance's free, key-less chart
 * API; exposing two mirrors the desktop app's provider switch and lets callers
 * fail over between Yahoo's edge hosts.
 */
type Provider = 'yfinance' | 'yahoo';

const PROVIDER_HOSTS: Record<Provider, string> = {
  yfinance: 'query1.finance.yahoo.com',
  yahoo: 'query2.finance.yahoo.com',
};

/** Maps a request `provider` value to a known [`Provider`] (defaults to yfinance). */
function parseProvider(value: string | null): Provider {
  return value === 'yahoo' || value === 'legacy' ? 'yahoo' : 'yfinance';
}

/** Fetches and normalizes daily candles from Yahoo Finance (no API key). */
async function fetchUpstream(
  symbol: string,
  provider: Provider,
  env: Env,
): Promise<Candle[]> {
  const host = PROVIDER_HOSTS[provider];
  const range = env.HISTORY_RANGE || '10y';
  const endpoint =
    `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?range=${encodeURIComponent(range)}&interval=1d&includePrePost=false`;

  const res = await fetch(endpoint, {
    cf: { cacheTtl: 3600 },
    headers: {
      // Yahoo rejects requests without a browser-like User-Agent.
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Upstream HTTP ${res.status}`);
  const data = (await res.json()) as YahooChartResponse;

  const err = data.chart?.error;
  if (err) throw new Error(err.description || err.code || 'Upstream error.');

  const result = data.chart?.result?.[0];
  const timestamps = result?.timestamp;
  const quote = result?.indicators?.quote?.[0];
  if (!timestamps || !quote) {
    throw new Error('No data returned from upstream.');
  }

  const candles: Candle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const close = quote.close?.[i];
    const volume = quote.volume?.[i];
    // Yahoo returns null entries for holidays / missing bars — skip them.
    if (
      open == null ||
      high == null ||
      low == null ||
      close == null ||
      volume == null
    ) {
      continue;
    }
    candles.push({ time: timestamps[i], open, high, low, close, volume });
  }

  if (!candles.length) throw new Error('No data returned from upstream.');
  candles.sort((a, b) => a.time - b.time);
  return candles;
}

/** Subset of the Yahoo Finance chart API response shape we consume. */
interface YahooChartResponse {
  chart?: {
    error?: { code?: string; description?: string } | null;
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }>;
      };
    }>;
  };
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
