import type { Candle } from '../types';

/**
 * Deterministic synthetic OHLCV generator used for demos and offline use.
 * Produces a plausible random-walk price series with drift and volatility.
 */
export function generateSampleCandles(
  symbol: string,
  days = 500,
  startPrice = 100,
): Candle[] {
  // Seed the PRNG from the symbol so each ticker is stable across reloads.
  let seed = 0;
  for (let i = 0; i < symbol.length; i++) seed = (seed * 31 + symbol.charCodeAt(i)) >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  const candles: Candle[] = [];
  let price = startPrice;
  const now = Math.floor(Date.now() / 1000);
  const daySecs = 86_400;
  const startTime = now - days * daySecs;

  for (let i = 0; i < days; i++) {
    const drift = 0.0003;
    const vol = 0.018;
    const shock = (rand() - 0.5) * 2;
    const ret = drift + vol * shock;
    const open = price;
    const close = Math.max(1, open * (1 + ret));
    const high = Math.max(open, close) * (1 + rand() * 0.01);
    const low = Math.min(open, close) * (1 - rand() * 0.01);
    const volume = Math.floor(500_000 + rand() * 2_000_000);
    candles.push({
      time: startTime + i * daySecs,
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume,
    });
    price = close;
  }
  return candles;
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Serializes candles back to CSV (used for export). */
export function candlesToCsv(candles: Candle[]): string {
  const header = 'Date,Open,High,Low,Close,Volume';
  const rows = candles.map((c) => {
    const date = new Date(c.time * 1000).toISOString().slice(0, 10);
    return `${date},${c.open},${c.high},${c.low},${c.close},${c.volume}`;
  });
  return [header, ...rows].join('\n');
}
