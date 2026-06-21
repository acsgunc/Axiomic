import type { Candle } from '../types';

export const TIMEFRAMES = [
  { id: '1D' },
  { id: '1W' },
  { id: '1M' },
  { id: '3M' },
  { id: '1Y' },
  { id: 'ALL' },
] as const;

export type TimeframeId = (typeof TIMEFRAMES)[number]['id'];

const DAY = 86_400;
const WEEK = 7 * DAY;

/**
 * Returns the bucket key (UNIX seconds) a candle's timestamp falls into for the
 * given timeframe — i.e. the candle *interval*:
 *
 * - `1D` / `ALL` — one bucket per source candle (no aggregation; daily data).
 * - `1W` — fixed 7-day buckets aligned to the UNIX epoch.
 * - `1M` / `3M` / `1Y` — calendar month / quarter / year (UTC).
 */
export function bucketKey(time: number, id: TimeframeId): number {
  switch (id) {
    case '1D':
    case 'ALL':
      return time;
    case '1W':
      return Math.floor(time / WEEK) * WEEK;
    case '1M': {
      const d = new Date(time * 1000);
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
    }
    case '3M': {
      const d = new Date(time * 1000);
      const q = Math.floor(d.getUTCMonth() / 3) * 3;
      return Date.UTC(d.getUTCFullYear(), q, 1) / 1000;
    }
    case '1Y': {
      const d = new Date(time * 1000);
      return Date.UTC(d.getUTCFullYear(), 0, 1) / 1000;
    }
  }
}

/**
 * Aggregates daily candles into the selected timeframe's interval, so each
 * output candle represents one `1D` / `1W` / `1M` / `3M` / `1Y` bar
 * (TradingView-style interval selection).
 *
 * Each aggregated bar uses first-open, last-close, max-high, min-low and summed
 * volume. `1D` and `ALL` return the source unchanged. The source array is not
 * mutated. Assumes candles are sorted ascending by time.
 */
export function resampleCandles(candles: Candle[], id: TimeframeId): Candle[] {
  if (id === '1D' || id === 'ALL' || candles.length === 0) return candles;

  const buckets = new Map<number, Candle>();
  const order: number[] = [];
  for (const c of candles) {
    const key = bucketKey(c.time, id);
    const bar = buckets.get(key);
    if (!bar) {
      buckets.set(key, {
        time: key,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      });
      order.push(key);
    } else {
      bar.high = Math.max(bar.high, c.high);
      bar.low = Math.min(bar.low, c.low);
      bar.close = c.close;
      bar.volume += c.volume;
    }
  }
  return order.map((k) => buckets.get(k)!);
}

