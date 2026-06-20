//! Technical indicators implemented in pure Rust for portability and speed.
//!
//! All functions return a [`Series`] aligned 1:1 with the input candles. Points
//! that cannot be computed due to insufficient lookback are returned as `None`.

use crate::types::{closes, times, Candle, Series};

/// Simple Moving Average over `period` closes.
pub fn sma(candles: &[Candle], period: usize) -> Series {
    let close = closes(candles);
    let mut out: Vec<Option<f64>> = vec![None; close.len()];
    if period == 0 || close.len() < period {
        return Series::new(times(candles), out);
    }
    let mut sum: f64 = close[..period].iter().sum();
    out[period - 1] = Some(sum / period as f64);
    for i in period..close.len() {
        sum += close[i] - close[i - period];
        out[i] = Some(sum / period as f64);
    }
    Series::new(times(candles), out)
}

/// Exponential Moving Average over `period` closes.
/// Seeded with the SMA of the first `period` values.
pub fn ema(candles: &[Candle], period: usize) -> Series {
    let close = closes(candles);
    ema_values(&close, period).into_series(times(candles))
}

/// Relative Strength Index (Wilder's smoothing).
pub fn rsi(candles: &[Candle], period: usize) -> Series {
    let close = closes(candles);
    let n = close.len();
    let mut out: Vec<Option<f64>> = vec![None; n];
    if period == 0 || n <= period {
        return Series::new(times(candles), out);
    }

    let mut gain = 0.0;
    let mut loss = 0.0;
    for i in 1..=period {
        let diff = close[i] - close[i - 1];
        if diff >= 0.0 {
            gain += diff;
        } else {
            loss -= diff;
        }
    }
    let mut avg_gain = gain / period as f64;
    let mut avg_loss = loss / period as f64;
    out[period] = Some(rsi_from(avg_gain, avg_loss));

    for i in (period + 1)..n {
        let diff = close[i] - close[i - 1];
        let (g, l) = if diff >= 0.0 { (diff, 0.0) } else { (0.0, -diff) };
        avg_gain = (avg_gain * (period as f64 - 1.0) + g) / period as f64;
        avg_loss = (avg_loss * (period as f64 - 1.0) + l) / period as f64;
        out[i] = Some(rsi_from(avg_gain, avg_loss));
    }
    Series::new(times(candles), out)
}

fn rsi_from(avg_gain: f64, avg_loss: f64) -> f64 {
    if avg_loss == 0.0 {
        return 100.0;
    }
    let rs = avg_gain / avg_loss;
    100.0 - (100.0 / (1.0 + rs))
}

/// MACD line, signal line, and histogram.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Macd {
    pub macd: Series,
    pub signal: Series,
    pub histogram: Series,
}

/// MACD with the classic (12, 26, 9) defaults exposed as parameters.
pub fn macd(candles: &[Candle], fast: usize, slow: usize, signal_period: usize) -> Macd {
    let close = closes(candles);
    let t = times(candles);
    let fast_ema = ema_values(&close, fast);
    let slow_ema = ema_values(&close, slow);

    let macd_line: Vec<Option<f64>> = fast_ema
        .0
        .iter()
        .zip(slow_ema.0.iter())
        .map(|(f, s)| match (f, s) {
            (Some(f), Some(s)) => Some(f - s),
            _ => None,
        })
        .collect();

    // Compute the signal EMA over the dense (non-None) portion of the MACD line.
    let dense: Vec<f64> = macd_line.iter().filter_map(|v| *v).collect();
    let first_idx = macd_line.iter().position(|v| v.is_some()).unwrap_or(0);
    let signal_dense = ema_values(&dense, signal_period);

    let mut signal_line: Vec<Option<f64>> = vec![None; close.len()];
    for (k, v) in signal_dense.0.iter().enumerate() {
        if first_idx + k < signal_line.len() {
            signal_line[first_idx + k] = *v;
        }
    }

    let histogram: Vec<Option<f64>> = macd_line
        .iter()
        .zip(signal_line.iter())
        .map(|(m, s)| match (m, s) {
            (Some(m), Some(s)) => Some(m - s),
            _ => None,
        })
        .collect();

    Macd {
        macd: Series::new(t.clone(), macd_line),
        signal: Series::new(t.clone(), signal_line),
        histogram: Series::new(t, histogram),
    }
}

/// Bollinger Bands: upper, middle (SMA), and lower bands.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Bollinger {
    pub upper: Series,
    pub middle: Series,
    pub lower: Series,
}

pub fn bollinger(candles: &[Candle], period: usize, std_devs: f64) -> Bollinger {
    let close = closes(candles);
    let t = times(candles);
    let n = close.len();
    let mut upper = vec![None; n];
    let mut middle = vec![None; n];
    let mut lower = vec![None; n];

    if period >= 2 && n >= period {
        for i in (period - 1)..n {
            let window = &close[i + 1 - period..=i];
            let mean = window.iter().sum::<f64>() / period as f64;
            let var = window.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / period as f64;
            let sd = var.sqrt();
            middle[i] = Some(mean);
            upper[i] = Some(mean + std_devs * sd);
            lower[i] = Some(mean - std_devs * sd);
        }
    }

    Bollinger {
        upper: Series::new(t.clone(), upper),
        middle: Series::new(t.clone(), middle),
        lower: Series::new(t, lower),
    }
}

/// Average True Range (Wilder's smoothing).
pub fn atr(candles: &[Candle], period: usize) -> Series {
    let n = candles.len();
    let t = times(candles);
    let mut out = vec![None; n];
    if period == 0 || n <= period {
        return Series::new(t, out);
    }

    let mut tr = vec![0.0; n];
    tr[0] = candles[0].high - candles[0].low;
    for i in 1..n {
        let c = &candles[i];
        let prev_close = candles[i - 1].close;
        tr[i] = (c.high - c.low)
            .max((c.high - prev_close).abs())
            .max((c.low - prev_close).abs());
    }

    let mut atr_val = tr[1..=period].iter().sum::<f64>() / period as f64;
    out[period] = Some(atr_val);
    for i in (period + 1)..n {
        atr_val = (atr_val * (period as f64 - 1.0) + tr[i]) / period as f64;
        out[i] = Some(atr_val);
    }
    Series::new(t, out)
}

/// Internal dense EMA holder that can be projected onto a time axis.
struct EmaValues(Vec<Option<f64>>);

impl EmaValues {
    fn into_series(self, time: Vec<i64>) -> Series {
        Series::new(time, self.0)
    }
}

/// Computes an EMA over a raw price vector, seeding with the SMA of the first
/// `period` values. Returns a vector aligned with the input.
fn ema_values(data: &[f64], period: usize) -> EmaValues {
    let n = data.len();
    let mut out = vec![None; n];
    if period == 0 || n < period {
        return EmaValues(out);
    }
    let k = 2.0 / (period as f64 + 1.0);
    let mut prev = data[..period].iter().sum::<f64>() / period as f64;
    out[period - 1] = Some(prev);
    for i in period..n {
        prev = data[i] * k + prev * (1.0 - k);
        out[i] = Some(prev);
    }
    EmaValues(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Candle;

    fn mk(closes: &[f64]) -> Vec<Candle> {
        closes
            .iter()
            .enumerate()
            .map(|(i, &c)| Candle {
                time: i as i64,
                open: c,
                high: c + 1.0,
                low: c - 1.0,
                close: c,
                volume: 100.0,
            })
            .collect()
    }

    #[test]
    fn sma_basic() {
        let c = mk(&[1.0, 2.0, 3.0, 4.0, 5.0]);
        let s = sma(&c, 3);
        assert_eq!(s.values[2], Some(2.0));
        assert_eq!(s.values[4], Some(4.0));
        assert_eq!(s.values[0], None);
    }

    #[test]
    fn rsi_bounds() {
        let c = mk(&[1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0]);
        let s = rsi(&c, 3);
        for v in s.values.iter().flatten() {
            assert!(*v >= 0.0 && *v <= 100.0);
        }
    }
}
