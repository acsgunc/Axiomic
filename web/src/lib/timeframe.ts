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

/**
 * Maps a candle timestamp (seconds) to a bucket key for the chosen interval.
 * `1D`/`ALL` keep one candle per source bar; coarser intervals group bars by
 * calendar week/month/quarter/year so the full history is always visible.
 */
export function bucketKey(time: number, id: TimeframeId): number {
  const d = new Date(time * 1000);
  switch (id) {
    case '1W':
      return Math.floor(time / 604_800); // fixed 7-day buckets from epoch
    case '1M':
      return d.getUTCFullYear() * 12 + d.getUTCMonth();
    case '3M':
      return d.getUTCFullYear() * 4 + Math.floor(d.getUTCMonth() / 3);
    case '1Y':
      return d.getUTCFullYear();
    default:
      return time; // 1D / ALL: one bucket per source candle
  }
}

/**
 * Aggregates daily source candles into the selected bar interval. Open is the
 * first bar's open, close the last bar's close, high/low the extremes, and
 * volume the sum. Assumes candles are sorted ascending by time.
 */
export function resampleCandles(candles: Candle[], id: TimeframeId): Candle[] {
  if (id === '1D' || id === 'ALL' || candles.length === 0) return candles;
  const out: Candle[] = [];
  let cur: Candle | null = null;
  let curKey: number | null = null;
  for (const c of candles) {
    const key = bucketKey(c.time, id);
    if (cur === null || key !== curKey) {
      if (cur) out.push(cur);
      cur = { ...c };
      curKey = key;
    } else {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
      cur.volume += c.volume;
    }
  }
  if (cur) out.push(cur);
  return out;
}
