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
    const nextJan = Date.UTC(2025, 0, 15) / 1000;
    // Month buckets: Jan != Feb.
    expect(bucketKey(jan, '1M')).not.toBe(bucketKey(feb, '1M'));
    // Quarter buckets: Jan & Feb share Q1; Apr is Q2.
    expect(bucketKey(jan, '3M')).toBe(bucketKey(feb, '3M'));
    expect(bucketKey(jan, '3M')).not.toBe(bucketKey(apr, '3M'));
    // Year buckets: all of 2024 shares one; 2025 differs.
    expect(bucketKey(jan, '1Y')).toBe(bucketKey(apr, '1Y'));
    expect(bucketKey(jan, '1Y')).not.toBe(bucketKey(nextJan, '1Y'));
  });
});

describe('resampleCandles', () => {
  it('returns the source unchanged for 1D and ALL', () => {
    const candles = dailyCandles(10);
    expect(resampleCandles(candles, '1D')).toBe(candles);
    expect(resampleCandles(candles, 'ALL')).toBe(candles);
  });

  it('handles empty input', () => {
    expect(resampleCandles([], '1W')).toEqual([]);
  });

  it('collapses daily candles into fewer weekly bars', () => {
    const candles = dailyCandles(21); // 3 weeks of data
    const weekly = resampleCandles(candles, '1W');
    expect(weekly.length).toBeLessThan(candles.length);
    expect(weekly.length).toBeGreaterThanOrEqual(3);
  });

  it('aggregates with first-open / last-close / extreme high-low / summed volume', () => {
    const candles = dailyCandles(7); // 7 January days → one monthly bar
    const monthly = resampleCandles(candles, '1M');
    const bar = monthly[0];
    const inBar = candles.filter((c) => bucketKey(c.time, '1M') === bar.time);
    expect(bar.open).toBe(inBar[0].open);
    expect(bar.close).toBe(inBar[inBar.length - 1].close);
    expect(bar.high).toBe(Math.max(...inBar.map((c) => c.high)));
    expect(bar.low).toBe(Math.min(...inBar.map((c) => c.low)));
    expect(bar.volume).toBe(inBar.reduce((s, c) => s + c.volume, 0));
  });

  it('does not mutate the source candles', () => {
    const candles = dailyCandles(30);
    const snapshot = JSON.parse(JSON.stringify(candles));
    resampleCandles(candles, '1M');
    expect(candles).toEqual(snapshot);
  });
});
