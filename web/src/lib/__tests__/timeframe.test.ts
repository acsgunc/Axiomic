import { describe, it, expect } from 'vitest';
import { TIMEFRAME_DAYS, TIMEFRAMES, visibleRangeFor } from '../timeframe';
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

describe('TIMEFRAME_DAYS', () => {
  it('maps every timeframe id to a lookback (null only for ALL)', () => {
    for (const { id } of TIMEFRAMES) {
      expect(id in TIMEFRAME_DAYS).toBe(true);
    }
    expect(TIMEFRAME_DAYS.ALL).toBeNull();
    expect(TIMEFRAME_DAYS['1Y']).toBe(365);
    expect(TIMEFRAME_DAYS['1D']).toBe(1);
  });
});

describe('visibleRangeFor', () => {
  it('returns null for ALL (caller fits the full history)', () => {
    expect(visibleRangeFor(dailyCandles(500), 'ALL')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(visibleRangeFor([], '1Y')).toBeNull();
  });

  it('1Y window ends at the last bar and starts ~365 days back', () => {
    const candles = dailyCandles(500); // ~1.37 years of daily data
    const range = visibleRangeFor(candles, '1Y')!;
    const last = candles[candles.length - 1].time;
    expect(range.to).toBe(last);
    expect(range.from).toBe(last - 365 * DAY);
    // The window starts after the first candle, so older data stays draggable.
    expect(range.from).toBeGreaterThan(candles[0].time);
  });

  it('clamps the window start to the first candle when lookback exceeds history', () => {
    const candles = dailyCandles(30); // only 30 days available
    const range = visibleRangeFor(candles, '1Y')!;
    expect(range.from).toBe(candles[0].time);
    expect(range.to).toBe(candles[candles.length - 1].time);
  });

  it('guarantees at least two visible bars for tiny windows', () => {
    const candles = dailyCandles(500);
    const range = visibleRangeFor(candles, '1D')!;
    // A literal 1-day window would show a single bar; ensure >= 2 are in view.
    const inWindow = candles.filter((c) => c.time >= range.from && c.time <= range.to);
    expect(inWindow.length).toBeGreaterThanOrEqual(2);
  });

  it('produces progressively wider windows for longer timeframes', () => {
    const candles = dailyCandles(1000);
    const spans = (['1W', '1M', '3M', '1Y'] as const).map((id) => {
      const r = visibleRangeFor(candles, id)!;
      return r.to - r.from;
    });
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i]).toBeGreaterThan(spans[i - 1]);
    }
  });
});
