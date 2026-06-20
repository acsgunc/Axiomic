//! Comprehensive integration tests for the Axiomic analysis core.
//!
//! These exercise the public API (`axiomic_core::*`) the same way the WASM and
//! desktop builds consume it: indicators, the backtest engine, and the CSV
//! parser, across normal, boundary, and error scenarios.
//!
//! Run with:  `cargo test -p axiomic-core`

use axiomic_core::backtest::run_sma_crossover;
use axiomic_core::csv::parse_csv;
use axiomic_core::indicators::{atr, bollinger, ema, macd, rsi, sma};
use axiomic_core::{BacktestConfig, Candle};

/// Builds candles from a slice of closing prices (OHLC derived from close).
fn candles_from_closes(closes: &[f64]) -> Vec<Candle> {
    closes
        .iter()
        .enumerate()
        .map(|(i, &c)| Candle {
            time: i as i64,
            open: c,
            high: c + 1.0,
            low: c - 1.0,
            close: c,
            volume: 1_000.0,
        })
        .collect()
}

// ---------------------------------------------------------------------------
// SMA
// ---------------------------------------------------------------------------

#[test]
fn sma_computes_trailing_average() {
    let c = candles_from_closes(&[1.0, 2.0, 3.0, 4.0, 5.0]);
    let s = sma(&c, 3);
    assert_eq!(s.values.len(), c.len());
    assert_eq!(s.values[0], None);
    assert_eq!(s.values[1], None);
    assert_eq!(s.values[2], Some(2.0));
    assert_eq!(s.values[3], Some(3.0));
    assert_eq!(s.values[4], Some(4.0));
}

#[test]
fn sma_period_one_equals_close() {
    let c = candles_from_closes(&[10.0, 11.0, 12.0]);
    let s = sma(&c, 1);
    assert_eq!(s.values, vec![Some(10.0), Some(11.0), Some(12.0)]);
}

#[test]
fn sma_period_zero_is_all_none() {
    let c = candles_from_closes(&[1.0, 2.0, 3.0]);
    let s = sma(&c, 0);
    assert!(s.values.iter().all(|v| v.is_none()));
}

#[test]
fn sma_period_longer_than_data_is_all_none() {
    let c = candles_from_closes(&[1.0, 2.0]);
    let s = sma(&c, 5);
    assert_eq!(s.values, vec![None, None]);
}

#[test]
fn sma_on_empty_input_is_empty() {
    let c: Vec<Candle> = vec![];
    let s = sma(&c, 3);
    assert!(s.values.is_empty());
    assert!(s.time.is_empty());
}

// ---------------------------------------------------------------------------
// EMA
// ---------------------------------------------------------------------------

#[test]
fn ema_seeds_with_sma_then_smooths() {
    let c = candles_from_closes(&[1.0, 2.0, 3.0, 4.0, 5.0]);
    let s = ema(&c, 3);
    // First two points lack lookback.
    assert_eq!(s.values[0], None);
    assert_eq!(s.values[1], None);
    // Seed is the SMA of the first three closes.
    assert_eq!(s.values[2], Some(2.0));
    // Subsequent points are defined and strictly increasing for a rising series.
    let v3 = s.values[3].unwrap();
    let v4 = s.values[4].unwrap();
    assert!(v3 > 2.0 && v4 > v3);
}

#[test]
fn ema_constant_series_is_constant() {
    let c = candles_from_closes(&[5.0; 10]);
    let s = ema(&c, 4);
    for v in s.values.iter().flatten() {
        assert!((v - 5.0).abs() < 1e-9);
    }
}

// ---------------------------------------------------------------------------
// RSI
// ---------------------------------------------------------------------------

#[test]
fn rsi_stays_within_bounds() {
    let c = candles_from_closes(&[1.0, 2.0, 1.5, 3.0, 2.5, 4.0, 3.5, 5.0, 4.0, 6.0]);
    let s = rsi(&c, 3);
    for v in s.values.iter().flatten() {
        assert!(*v >= 0.0 && *v <= 100.0, "rsi out of bounds: {v}");
    }
}

#[test]
fn rsi_all_gains_is_one_hundred() {
    let c = candles_from_closes(&[1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
    let s = rsi(&c, 3);
    let last = s.values.iter().flatten().last().copied().unwrap();
    assert!((last - 100.0).abs() < 1e-9);
}

#[test]
fn rsi_insufficient_data_is_all_none() {
    let c = candles_from_closes(&[1.0, 2.0, 3.0]);
    let s = rsi(&c, 5);
    assert!(s.values.iter().all(|v| v.is_none()));
}

// ---------------------------------------------------------------------------
// MACD
// ---------------------------------------------------------------------------

#[test]
fn macd_histogram_is_macd_minus_signal() {
    let closes: Vec<f64> = (0..60).map(|i| 100.0 + (i as f64) * 0.5).collect();
    let c = candles_from_closes(&closes);
    let m = macd(&c, 12, 26, 9);
    assert_eq!(m.macd.values.len(), c.len());
    assert_eq!(m.signal.values.len(), c.len());
    assert_eq!(m.histogram.values.len(), c.len());
    for i in 0..c.len() {
        if let (Some(macd_v), Some(sig), Some(hist)) =
            (m.macd.values[i], m.signal.values[i], m.histogram.values[i])
        {
            assert!((hist - (macd_v - sig)).abs() < 1e-9);
        }
    }
}

// ---------------------------------------------------------------------------
// Bollinger Bands
// ---------------------------------------------------------------------------

#[test]
fn bollinger_orders_bands_and_centers_on_sma() {
    let c = candles_from_closes(&[1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0]);
    let b = bollinger(&c, 4, 2.0);
    for i in 0..c.len() {
        if let (Some(u), Some(mid), Some(l)) =
            (b.upper.values[i], b.middle.values[i], b.lower.values[i])
        {
            assert!(u >= mid && mid >= l, "bands out of order at {i}");
        }
    }
    // Middle band equals the 4-period SMA.
    let s = sma(&c, 4);
    assert_eq!(b.middle.values, s.values);
}

#[test]
fn bollinger_period_below_two_is_all_none() {
    let c = candles_from_closes(&[1.0, 2.0, 3.0]);
    let b = bollinger(&c, 1, 2.0);
    assert!(b.upper.values.iter().all(|v| v.is_none()));
}

// ---------------------------------------------------------------------------
// ATR
// ---------------------------------------------------------------------------

#[test]
fn atr_is_non_negative() {
    let c = candles_from_closes(&[10.0, 11.0, 9.0, 12.0, 8.0, 13.0, 7.0, 14.0]);
    let s = atr(&c, 3);
    for v in s.values.iter().flatten() {
        assert!(*v >= 0.0, "atr negative: {v}");
    }
}

#[test]
fn atr_insufficient_data_is_all_none() {
    let c = candles_from_closes(&[1.0, 2.0]);
    let s = atr(&c, 5);
    assert!(s.values.iter().all(|v| v.is_none()));
}

// ---------------------------------------------------------------------------
// Backtest
// ---------------------------------------------------------------------------

/// A noisy uptrend long enough to trigger SMA crossovers.
fn trending_series(n: usize) -> Vec<Candle> {
    (0..n)
        .map(|i| {
            let c = 100.0 + (i as f64).sin() * 5.0 + i as f64 * 0.1;
            Candle {
                time: i as i64,
                open: c,
                high: c + 1.0,
                low: c - 1.0,
                close: c,
                volume: 1_000.0,
            }
        })
        .collect()
}

#[test]
fn backtest_metrics_are_well_formed() {
    let c = trending_series(300);
    let res = run_sma_crossover(&c, &BacktestConfig::default());
    assert_eq!(res.equity_curve.len(), c.len());
    assert_eq!(res.equity_time.len(), c.len());
    assert_eq!(res.num_trades, res.trades.len());
    assert!(res.max_drawdown_pct >= 0.0);
    assert!(res.win_rate_pct >= 0.0 && res.win_rate_pct <= 100.0);
}

#[test]
fn backtest_empty_input_does_not_panic() {
    let c: Vec<Candle> = vec![];
    let res = run_sma_crossover(&c, &BacktestConfig::default());
    assert_eq!(res.num_trades, 0);
    assert!(res.equity_curve.is_empty());
    assert_eq!(res.total_return_pct, 0.0);
}

#[test]
fn backtest_flat_market_makes_no_trades() {
    let c = candles_from_closes(&[100.0; 200]);
    let res = run_sma_crossover(&c, &BacktestConfig::default());
    assert_eq!(res.num_trades, 0);
}

#[test]
fn backtest_fee_reduces_or_equals_return() {
    let c = trending_series(300);
    let no_fee = run_sma_crossover(
        &c,
        &BacktestConfig {
            fee: 0.0,
            ..BacktestConfig::default()
        },
    );
    let with_fee = run_sma_crossover(
        &c,
        &BacktestConfig {
            fee: 0.01,
            ..BacktestConfig::default()
        },
    );
    if no_fee.num_trades > 0 {
        assert!(with_fee.total_return_pct <= no_fee.total_return_pct + 1e-9);
    }
}

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

#[test]
fn csv_parses_standard_header() {
    let csv = "Date,Open,High,Low,Close,Volume\n\
               2024-01-01,10,12,9,11,1000\n\
               2024-01-02,11,13,10,12,1500\n";
    let candles = parse_csv(csv).expect("should parse");
    assert_eq!(candles.len(), 2);
    assert_eq!(candles[0].open, 10.0);
    assert_eq!(candles[0].close, 11.0);
    assert_eq!(candles[1].volume, 1500.0);
}

#[test]
fn csv_is_column_order_independent_and_case_insensitive() {
    let csv = "CLOSE,date,VOLUME,open,LOW,high\n\
               11,2024-01-01,1000,10,9,12\n";
    let candles = parse_csv(csv).expect("should parse reordered header");
    assert_eq!(candles[0].open, 10.0);
    assert_eq!(candles[0].high, 12.0);
    assert_eq!(candles[0].low, 9.0);
    assert_eq!(candles[0].close, 11.0);
    assert_eq!(candles[0].volume, 1000.0);
}

#[test]
fn csv_sorts_rows_ascending_by_time() {
    let csv = "Date,Open,High,Low,Close\n\
               2024-01-03,3,3,3,3\n\
               2024-01-01,1,1,1,1\n\
               2024-01-02,2,2,2,2\n";
    let candles = parse_csv(csv).expect("should parse");
    assert!(candles[0].time < candles[1].time);
    assert!(candles[1].time < candles[2].time);
    assert_eq!(candles[0].close, 1.0);
    assert_eq!(candles[2].close, 3.0);
}

#[test]
fn csv_volume_is_optional() {
    let csv = "Date,Open,High,Low,Close\n2024-01-01,10,12,9,11\n";
    let candles = parse_csv(csv).expect("should parse without volume");
    assert_eq!(candles[0].volume, 0.0);
}

#[test]
fn csv_accepts_unix_seconds_and_milliseconds() {
    let secs = "time,open,high,low,close\n1704067200,1,1,1,1\n";
    let ms = "time,open,high,low,close\n1704067200000,1,1,1,1\n";
    let a = parse_csv(secs).expect("seconds");
    let b = parse_csv(ms).expect("milliseconds");
    assert_eq!(a[0].time, b[0].time);
    assert_eq!(a[0].time, 1704067200);
}

#[test]
fn csv_empty_input_errors() {
    assert!(parse_csv("").is_err());
}

#[test]
fn csv_missing_required_column_errors() {
    // No close column.
    let csv = "Date,Open,High,Low\n2024-01-01,10,12,9\n";
    let err = parse_csv(csv).unwrap_err();
    assert!(err.to_lowercase().contains("close"));
}

#[test]
fn csv_invalid_number_errors() {
    let csv = "Date,Open,High,Low,Close\n2024-01-01,abc,12,9,11\n";
    assert!(parse_csv(csv).is_err());
}

#[test]
fn csv_header_only_errors() {
    let csv = "Date,Open,High,Low,Close\n";
    assert!(parse_csv(csv).is_err());
}
