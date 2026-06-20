//! A small, vectorized backtesting engine for rule-based strategies.
//!
//! The MVP ships an SMA-crossover strategy: go long when the fast SMA crosses
//! above the slow SMA, exit when it crosses back below. The engine is written
//! to make adding further rule sets straightforward.

use serde::{Deserialize, Serialize};

use crate::indicators::sma;
use crate::types::Candle;

/// Parameters for a backtest run.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BacktestConfig {
    /// Fast SMA lookback.
    pub fast_period: usize,
    /// Slow SMA lookback.
    pub slow_period: usize,
    /// Starting capital.
    pub initial_capital: f64,
    /// Per-trade fee as a fraction of notional (e.g. 0.001 = 10 bps).
    #[serde(default)]
    pub fee: f64,
    /// Bars per year, used to annualize the Sharpe ratio (252 for daily).
    #[serde(default = "default_periods_per_year")]
    pub periods_per_year: f64,
}

fn default_periods_per_year() -> f64 {
    252.0
}

impl Default for BacktestConfig {
    fn default() -> Self {
        Self {
            fast_period: 20,
            slow_period: 50,
            initial_capital: 10_000.0,
            fee: 0.0,
            periods_per_year: 252.0,
        }
    }
}

/// A single completed trade.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Trade {
    pub entry_time: i64,
    pub exit_time: i64,
    pub entry_price: f64,
    pub exit_price: f64,
    pub return_pct: f64,
}

/// Result of a backtest, including the equity curve and summary metrics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BacktestResult {
    pub equity_time: Vec<i64>,
    pub equity_curve: Vec<f64>,
    pub trades: Vec<Trade>,
    pub total_return_pct: f64,
    pub sharpe_ratio: f64,
    pub max_drawdown_pct: f64,
    pub win_rate_pct: f64,
    pub num_trades: usize,
}

/// Runs an SMA-crossover backtest over the supplied candles.
pub fn run_sma_crossover(candles: &[Candle], cfg: &BacktestConfig) -> BacktestResult {
    let n = candles.len();
    let fast = sma(candles, cfg.fast_period);
    let slow = sma(candles, cfg.slow_period);

    let mut equity_time: Vec<i64> = Vec::with_capacity(n);
    let mut equity_curve: Vec<f64> = Vec::with_capacity(n);
    let mut trades: Vec<Trade> = Vec::new();

    let mut cash = cfg.initial_capital;
    let mut position = 0.0; // units held
    let mut entry_price = 0.0;
    let mut entry_time = 0i64;

    for i in 0..n {
        let price = candles[i].close;

        // Determine signal: requires both SMAs and a previous bar to detect a cross.
        let cross = if i > 0 {
            match (
                fast.values[i],
                slow.values[i],
                fast.values[i - 1],
                slow.values[i - 1],
            ) {
                (Some(f), Some(s), Some(pf), Some(ps)) => {
                    if pf <= ps && f > s {
                        Some(true) // bullish cross -> enter long
                    } else if pf >= ps && f < s {
                        Some(false) // bearish cross -> exit
                    } else {
                        None
                    }
                }
                _ => None,
            }
        } else {
            None
        };

        match cross {
            Some(true) if position == 0.0 => {
                // Enter long with all available cash.
                let notional = cash;
                let fee = notional * cfg.fee;
                position = (notional - fee) / price;
                cash = 0.0;
                entry_price = price;
                entry_time = candles[i].time;
            }
            Some(false) if position > 0.0 => {
                // Exit long.
                let notional = position * price;
                let fee = notional * cfg.fee;
                cash = notional - fee;
                let ret = (price - entry_price) / entry_price * 100.0;
                trades.push(Trade {
                    entry_time,
                    exit_time: candles[i].time,
                    entry_price,
                    exit_price: price,
                    return_pct: ret,
                });
                position = 0.0;
            }
            _ => {}
        }

        let equity = cash + position * price;
        equity_time.push(candles[i].time);
        equity_curve.push(equity);
    }

    // Force-close any open position at the last price for accurate metrics.
    if position > 0.0 && n > 0 {
        let price = candles[n - 1].close;
        let ret = (price - entry_price) / entry_price * 100.0;
        trades.push(Trade {
            entry_time,
            exit_time: candles[n - 1].time,
            entry_price,
            exit_price: price,
            return_pct: ret,
        });
    }

    let total_return_pct = if cfg.initial_capital > 0.0 && !equity_curve.is_empty() {
        (equity_curve[equity_curve.len() - 1] - cfg.initial_capital) / cfg.initial_capital * 100.0
    } else {
        0.0
    };

    BacktestResult {
        sharpe_ratio: sharpe(&equity_curve, cfg.periods_per_year),
        max_drawdown_pct: max_drawdown(&equity_curve),
        win_rate_pct: win_rate(&trades),
        num_trades: trades.len(),
        total_return_pct,
        equity_time,
        equity_curve,
        trades,
    }
}

/// Annualized Sharpe ratio of the equity curve's period returns (risk-free = 0).
fn sharpe(equity: &[f64], periods_per_year: f64) -> f64 {
    if equity.len() < 2 {
        return 0.0;
    }
    let rets: Vec<f64> = equity
        .windows(2)
        .filter_map(|w| if w[0] != 0.0 { Some((w[1] - w[0]) / w[0]) } else { None })
        .collect();
    if rets.is_empty() {
        return 0.0;
    }
    let mean = rets.iter().sum::<f64>() / rets.len() as f64;
    let var = rets.iter().map(|r| (r - mean).powi(2)).sum::<f64>() / rets.len() as f64;
    let sd = var.sqrt();
    if sd == 0.0 {
        return 0.0;
    }
    (mean / sd) * periods_per_year.sqrt()
}

/// Maximum peak-to-trough drawdown as a positive percentage.
fn max_drawdown(equity: &[f64]) -> f64 {
    let mut peak = f64::MIN;
    let mut max_dd = 0.0;
    for &e in equity {
        if e > peak {
            peak = e;
        }
        if peak > 0.0 {
            let dd = (peak - e) / peak * 100.0;
            if dd > max_dd {
                max_dd = dd;
            }
        }
    }
    max_dd
}

/// Percentage of trades with a positive return.
fn win_rate(trades: &[Trade]) -> f64 {
    if trades.is_empty() {
        return 0.0;
    }
    let wins = trades.iter().filter(|t| t.return_pct > 0.0).count();
    wins as f64 / trades.len() as f64 * 100.0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ramp(n: usize) -> Vec<Candle> {
        (0..n)
            .map(|i| {
                let c = 100.0 + (i as f64).sin() * 5.0 + i as f64 * 0.1;
                Candle {
                    time: i as i64,
                    open: c,
                    high: c + 1.0,
                    low: c - 1.0,
                    close: c,
                    volume: 1000.0,
                }
            })
            .collect()
    }

    #[test]
    fn runs_without_panic() {
        let candles = ramp(300);
        let cfg = BacktestConfig::default();
        let res = run_sma_crossover(&candles, &cfg);
        assert_eq!(res.equity_curve.len(), candles.len());
        assert!(res.max_drawdown_pct >= 0.0);
        assert!(res.win_rate_pct >= 0.0 && res.win_rate_pct <= 100.0);
    }
}
