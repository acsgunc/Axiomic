/**
 * Shared TypeScript types mirroring the Rust core's serialized shapes.
 */

export interface Candle {
  time: number; // UNIX seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** A value series aligned 1:1 with candles; nulls are insufficient-lookback points. */
export interface Series {
  time: number[];
  values: (number | null)[];
}

export interface MacdResult {
  macd: Series;
  signal: Series;
  histogram: Series;
}

export interface BollingerResult {
  upper: Series;
  middle: Series;
  lower: Series;
}

export interface BacktestConfig {
  fast_period: number;
  slow_period: number;
  initial_capital: number;
  fee: number;
  periods_per_year: number;
}

export interface Trade {
  entry_time: number;
  exit_time: number;
  entry_price: number;
  exit_price: number;
  return_pct: number;
}

export interface BacktestResult {
  equity_time: number[];
  equity_curve: number[];
  trades: Trade[];
  total_return_pct: number;
  sharpe_ratio: number;
  max_drawdown_pct: number;
  win_rate_pct: number;
  num_trades: number;
}

export type IndicatorKind =
  | 'sma'
  | 'ema'
  | 'rsi'
  | 'macd'
  | 'bollinger'
  | 'atr';

export interface IndicatorConfig {
  id: string;
  kind: IndicatorKind;
  /** Primary lookback period. */
  period: number;
  /** Whether the overlay is currently visible. */
  enabled: boolean;
  /** Display color (hex). */
  color: string;
}
