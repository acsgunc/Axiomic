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

/** Always keep at least this many bars visible so tiny windows aren't a single candle. */
const MIN_VISIBLE_BARS = 2;

/**
 * Trailing lookback window, in days, for each timeframe. `null` means the
 * entire available history (the `ALL` preset).
 */
export const TIMEFRAME_DAYS: Record<TimeframeId, number | null> = {
  '1D': 1,
  '1W': 7,
  '1M': 30,
  '3M': 90,
  '1Y': 365,
  ALL: null,
};

/** A visible time window in UNIX seconds, inclusive of both endpoints. */
export interface TimeRange {
  from: number;
  to: number;
}

/**
 * Computes the visible time window (UNIX seconds) for a timeframe over the full
 * candle history, TradingView-style: the timeframe is a zoom/lookback preset,
 * not an aggregation. Returns `null` for `ALL` or empty input, signalling the
 * caller to fit the entire history.
 *
 * All candles stay loaded regardless of the selected window, so the user can
 * always pan/zoom out to reveal the complete history beyond this range.
 * Assumes candles are sorted ascending by time.
 */
export function visibleRangeFor(
  candles: Candle[],
  id: TimeframeId,
): TimeRange | null {
  if (candles.length === 0) return null;
  const days = TIMEFRAME_DAYS[id];
  if (days == null) return null; // ALL → fit everything.

  const first = candles[0].time;
  const to = candles[candles.length - 1].time;
  let from = to - days * DAY;

  // Guarantee a few visible bars even for tiny windows on sparse (daily) data.
  const minIdx = Math.max(0, candles.length - MIN_VISIBLE_BARS);
  from = Math.min(from, candles[minIdx].time);
  if (from < first) from = first;

  return { from, to };
}

