import { describe, it, expect } from 'vitest';
import { buildCandleRows } from '../candleTable';
import type { Candle } from '../../types';

function candle(time: number, open: number, close: number): Candle {
  return { time, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: time };
}

describe('buildCandleRows', () => {
  const candles: Candle[] = [
    candle(1, 100, 110), // first bar: change vs its own open
    candle(2, 110, 99), // down vs prev close 110
    candle(3, 99, 99), // flat vs prev close 99
  ];

  it('computes change vs the previous bar close (first bar uses its open)', () => {
    const rows = buildCandleRows(candles, false);
    expect(rows[0].changeAbs).toBe(10); // 110 - 100 (open)
    expect(rows[0].changePct).toBeCloseTo(10);
    expect(rows[1].changeAbs).toBe(-11); // 99 - 110
    expect(rows[1].changePct).toBeCloseTo(-10);
    expect(rows[2].changeAbs).toBe(0); // 99 - 99
    expect(rows[2].changePct).toBe(0);
  });

  it('returns most-recent first by default', () => {
    const rows = buildCandleRows(candles);
    expect(rows.map((r) => r.time)).toEqual([3, 2, 1]);
  });

  it('preserves chronological order when descending is false', () => {
    const rows = buildCandleRows(candles, false);
    expect(rows.map((r) => r.time)).toEqual([1, 2, 3]);
  });

  it('carries OHLCV through unchanged', () => {
    const [row] = buildCandleRows([candle(7, 50, 60)]);
    expect(row).toMatchObject({ time: 7, open: 50, high: 60, low: 50, close: 60, volume: 7 });
  });

  it('returns an empty array for no candles', () => {
    expect(buildCandleRows([])).toEqual([]);
  });
});
