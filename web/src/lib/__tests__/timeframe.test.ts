import { describe, it, expect } from 'vitest';
import { bucketKey, resampleCandles } from '../timeframe';
import type { Candle } from '../../types';

const DAY = 86_400;

/** Builds N consecutive daily candles starting at a fixed UTC date. */
function dailyCandles(n: number, start = Date.UTC(2024, 0, 1) / 1000): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    const base = 100 + i;
    out.push({
      time: start + i * DAY,
      open: base,
      high: base + 2,
      low: base - 2,
      close: base + 1,
      volume: 1000,
    });
  }
  return out;
}

describe('bucketKey', () => {
  it('returns the raw time for 1D and ALL (one bucket per candle)', () => {
    expect(bucketKey(1_700_000_000, '1D')).toBe(1_700_000_000);
    expect(bucketKey(1_700_000_000, 'ALL')).toBe(1_700_000_000);
  });

  it('groups consecutive days into fixed 7-day weekly buckets', () => {
    const t0 = Math.floor(Date.UTC(2024, 0, 1) / 1000 / 604_800) * 604_800;
    const sameWeek = bucketKey(t0, '1W') === bucketKey(t0 + 6 * DAY, '1W');
    const nextWeek = bucketKey(t0, '1W') !== bucketKey(t0 + 7 * DAY, '1W');
    expect(sameWeek).toBe(true);
    expect(nextWeek).toBe(true);
  });

  it('groups by calendar month / quarter / year', () => {
    const jan = Date.UTC(2024, 0, 15) / 1000;
    const feb = Date.UTC(2024, 1, 15) / 1000;
    const apr = Date.UTC(2024, 3, 15) / 1000;
    const nextYear = Date.UTC(2025, 0, 15) / 1000;
    expect(bucketKey(jan, '1M')).not.toBe(bucketKey(feb, '1M'));
    expect(bucketKey(jan, '3M')).toBe(bucketKey(feb, '3M')); // same quarter
    expect(bucketKey(jan, '3M')).not.toBe(bucketKey(apr, '3M'));
    expect(bucketKey(jan, '1Y')).not.toBe(bucketKey(nextYear, '1Y'));
  });
});

describe('resampleCandles', () => {
  it('returns the source array unchanged for 1D and ALL', () => {
    const c = dailyCandles(10);
    expect(resampleCandles(c, '1D')).toBe(c);
    expect(resampleCandles(c, 'ALL')).toBe(c);
  });

  it('handles empty input', () => {
    expect(resampleCandles([], '1W')).toEqual([]);
  });

  it('aggregates daily candles into fewer weekly bars', () => {
    const c = dailyCandles(21); // 3 weeks
    const weekly = resampleCandles(c, '1W');
    expect(weekly.length).toBeLessThan(c.length);
    expect(weekly.length).toBeGreaterThan(1);
  });

  it('uses first-open, last-close, extreme high/low, summed volume', () => {
    const c = dailyCandles(7); // single calendar month
    const monthly = resampleCandles(c, '1M');
    expect(monthly).toHaveLength(1);
    const bar = monthly[0];
    expect(bar.open).toBe(c[0].open);
    expect(bar.close).toBe(c[c.length - 1].close);
    expect(bar.high).toBe(Math.max(...c.map((x) => x.high)));
    expect(bar.low).toBe(Math.min(...c.map((x) => x.low)));
    expect(bar.volume).toBe(c.reduce((s, x) => s + x.volume, 0));
  });

  it('does not mutate the source candles', () => {
    const c = dailyCandles(7);
    const snapshot = JSON.stringify(c);
    resampleCandles(c, '1M');
    expect(JSON.stringify(c)).toBe(snapshot);
  });
});
