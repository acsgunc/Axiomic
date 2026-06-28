/**
 * Pure helpers backing the TradingView-style data/table view.
 *
 * The table shows each bar's OHLCV plus its change versus the *previous* bar's
 * close (TradingView's data-window convention). All math lives here, free of
 * React/DOM, so it can be unit-tested directly.
 */

import type { Candle } from '../types';

/** A single table row: a candle enriched with its change vs the prior close. */
export interface CandleRow {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** Absolute change vs the previous bar's close (0 for the first bar). */
  changeAbs: number;
  /** Percentage change vs the previous bar's close (0 for the first bar). */
  changePct: number;
}

/**
 * Builds table rows from candles, computing each bar's change against the
 * previous bar's close. Rows are returned most-recent-first by default, matching
 * TradingView's data window; pass `descending = false` for chronological order.
 */
export function buildCandleRows(
  candles: Candle[],
  descending = true,
): CandleRow[] {
  const rows: CandleRow[] = candles.map((c, i) => {
    const prevClose = i > 0 ? candles[i - 1].close : c.open;
    const changeAbs = c.close - prevClose;
    const changePct = prevClose ? (changeAbs / prevClose) * 100 : 0;
    return {
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      changeAbs,
      changePct,
    };
  });
  return descending ? rows.reverse() : rows;
}
