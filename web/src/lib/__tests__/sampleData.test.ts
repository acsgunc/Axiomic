import { describe, it, expect } from 'vitest';
import { generateSampleCandles, candlesToCsv } from '../sampleData';

describe('generateSampleCandles', () => {
  it('returns the requested number of candles', () => {
    expect(generateSampleCandles('AAPL', 100).length).toBe(100);
  });

  it('is deterministic for a given symbol', () => {
    const a = generateSampleCandles('AAPL', 50);
    const b = generateSampleCandles('AAPL', 50);
    expect(a).toEqual(b);
  });

  it('produces different series for different symbols', () => {
    const a = generateSampleCandles('AAPL', 50);
    const b = generateSampleCandles('MSFT', 50);
    expect(a).not.toEqual(b);
  });

  it('emits ascending, daily-spaced timestamps', () => {
    const c = generateSampleCandles('NVDA', 10);
    for (let i = 1; i < c.length; i++) {
      expect(c[i].time - c[i - 1].time).toBe(86_400);
    }
  });

  it('keeps OHLC internally consistent (high >= low, high >= o/c)', () => {
    for (const k of generateSampleCandles('TSLA', 100)) {
      expect(k.high).toBeGreaterThanOrEqual(k.low);
      expect(k.high).toBeGreaterThanOrEqual(k.open);
      expect(k.high).toBeGreaterThanOrEqual(k.close);
      expect(k.low).toBeLessThanOrEqual(k.open);
      expect(k.low).toBeLessThanOrEqual(k.close);
      expect(k.volume).toBeGreaterThan(0);
    }
  });
});

describe('candlesToCsv', () => {
  it('writes a header and one row per candle', () => {
    const csv = candlesToCsv(generateSampleCandles('AAPL', 3));
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Date,Open,High,Low,Close,Volume');
    expect(lines).toHaveLength(4); // header + 3 rows
  });

  it('formats the date column as ISO yyyy-mm-dd', () => {
    const csv = candlesToCsv([
      { time: 1704067200, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
    ]);
    expect(csv.split('\n')[1]).toBe('2024-01-01,1,2,0.5,1.5,10');
  });
});
