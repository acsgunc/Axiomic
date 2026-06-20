/**
 * Data providers for loading OHLCV candles.
 *
 * Two paths are supported:
 *  1. CSV upload — fully offline; parsed by the Rust/WASM core.
 *  2. A configurable serverless proxy that fronts a market-data API,
 *     bypassing CORS and keeping the upstream API key server-side.
 *
 * The proxy base URL is configured via the `VITE_PROXY_URL` env var (see
 * .env.example). If unset, only CSV upload and sample data are available.
 */

import { engine } from '../engine';
import type { Candle } from '../types';
import { generateSampleCandles } from './sampleData';

const PROXY_URL = import.meta.env.VITE_PROXY_URL as string | undefined;

export class DataError extends Error {}

/** Parses an uploaded CSV file into candles via the WASM core. */
export async function loadFromCsvFile(file: File): Promise<Candle[]> {
  const text = await file.text();
  try {
    const candles = await engine.parseCsv(text);
    if (!candles.length) throw new DataError('CSV contained no data rows.');
    return candles;
  } catch (err) {
    throw new DataError(
      err instanceof Error ? err.message : 'Failed to parse CSV file.',
    );
  }
}

/**
 * Fetches daily candles for a symbol via the configured proxy.
 *
 * The proxy is expected to return JSON in the shape `{ candles: Candle[] }`
 * or a bare `Candle[]`. See proxy/README for the contract.
 */
export async function loadFromProxy(symbol: string): Promise<Candle[]> {
  if (!PROXY_URL) {
    throw new DataError(
      'No data proxy configured. Set VITE_PROXY_URL or upload a CSV.',
    );
  }
  const url = `${PROXY_URL.replace(/\/$/, '')}/quotes?symbol=${encodeURIComponent(symbol)}`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new DataError('Network error contacting the data proxy.');
  }
  if (!res.ok) {
    throw new DataError(`Proxy returned ${res.status} ${res.statusText}.`);
  }
  const json = (await res.json()) as { candles?: Candle[] } | Candle[];
  const candles = Array.isArray(json) ? json : json.candles;
  if (!candles || !candles.length) {
    throw new DataError(`No data returned for ${symbol}.`);
  }
  return candles;
}

/** Returns deterministic synthetic data for offline demos. */
export function loadSample(symbol: string): Candle[] {
  return generateSampleCandles(symbol);
}

/** Whether a remote proxy is configured. */
export const hasProxy = Boolean(PROXY_URL);
