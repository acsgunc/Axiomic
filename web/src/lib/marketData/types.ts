/**
 * Pluggable market-data abstraction for the live dashboard.
 *
 * A {@link MarketDataSource} encapsulates everything the dashboard needs from a
 * broker/exchange: how to fetch historical candles for charting and how to
 * stream live price updates. Adding a new broker (Alpaca, Binance, Zerodha,
 * Polygon, …) is a matter of implementing this interface and registering it —
 * no dashboard/UI changes required.
 *
 * Historical/analysis math still belongs in the Rust/WASM core; sources only
 * source and normalise raw OHLCV data.
 */

import type { Candle } from '../../types';

/** Canonical bar interval identifiers shared across all sources. */
export type IntervalId =
  | '1m'
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '4h'
  | '1d'
  | '1w';

/** Display + duration metadata for an interval. */
export interface IntervalMeta {
  id: IntervalId;
  label: string;
  /** Bar duration in seconds. */
  seconds: number;
}

/** Master list of intervals; individual sources expose a subset of these. */
export const INTERVALS: readonly IntervalMeta[] = [
  { id: '1m', label: '1m', seconds: 60 },
  { id: '5m', label: '5m', seconds: 300 },
  { id: '15m', label: '15m', seconds: 900 },
  { id: '30m', label: '30m', seconds: 1_800 },
  { id: '1h', label: '1h', seconds: 3_600 },
  { id: '4h', label: '4h', seconds: 14_400 },
  { id: '1d', label: '1D', seconds: 86_400 },
  { id: '1w', label: '1W', seconds: 604_800 },
];

/** Bar duration (seconds) for an interval. */
export const INTERVAL_SECONDS: Record<IntervalId, number> = INTERVALS.reduce(
  (acc, i) => {
    acc[i.id] = i.seconds;
    return acc;
  },
  {} as Record<IntervalId, number>,
);

/** A single streaming price update for a symbol. */
export interface PriceUpdate {
  /** The symbol this update is for. */
  symbol: string;
  /** Latest traded/last price. */
  price: number;
  /** Bar open time in UNIX seconds. */
  time: number;
  /**
   * The (possibly still-forming) bar this price belongs to, when the source can
   * provide full OHLCV. The chart uses it to update the latest candle in place.
   */
  candle?: Candle;
}

/** Tear-down handle returned by {@link MarketDataSource.subscribe}. */
export type Unsubscribe = () => void;

/** A curated, selectable symbol within a source. */
export interface SymbolOption {
  /** The source-native symbol/ticker (e.g. `BTC`, `AAPL`, `D05.SI`). */
  symbol: string;
  /** Human-friendly label shown in the picker. */
  label: string;
}

/**
 * A market-data source (broker/exchange). Implement and register to make a new
 * provider available to every dashboard pane.
 */
export interface MarketDataSource {
  /** Stable, unique identifier persisted in pane config (e.g. `hyperliquid`). */
  readonly id: string;
  /** Human-friendly name shown in the source dropdown. */
  readonly label: string;
  /** Asset-class hint used purely for grouping/labelling in the UI. */
  readonly assetClass: 'crypto' | 'stocks' | 'forex' | 'futures' | string;
  /** Whether the source pushes live updates (true) or is snapshot-only (false). */
  readonly streaming: boolean;
  /** Intervals this source can chart, in display order. */
  readonly intervals: readonly IntervalId[];
  /** Curated default symbols for the picker. */
  readonly symbols: readonly SymbolOption[];
  /** Whether a free-form symbol may be entered in addition to {@link symbols}. */
  readonly allowCustomSymbol: boolean;

  /**
   * Fetches historical OHLCV candles for charting, ascending by time. Should
   * throw a descriptive error (ideally a {@link MarketDataError}) on failure.
   */
  fetchCandles(symbol: string, interval: IntervalId): Promise<Candle[]>;

  /**
   * Subscribes to live price updates for `symbol`/`interval`. Returns an
   * idempotent unsubscribe function. For non-streaming sources this may poll.
   */
  subscribe(
    symbol: string,
    interval: IntervalId,
    onUpdate: (update: PriceUpdate) => void,
  ): Unsubscribe;
}

/** Error type raised by market-data sources for predictable handling. */
export class MarketDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarketDataError';
  }
}

/** Returns the source's first interval (a safe default for new panes). */
export function defaultInterval(source: MarketDataSource): IntervalId {
  return source.intervals[0] ?? '1h';
}

/** Whether `interval` is supported by `source`. */
export function supportsInterval(
  source: MarketDataSource,
  interval: IntervalId,
): boolean {
  return source.intervals.includes(interval);
}
