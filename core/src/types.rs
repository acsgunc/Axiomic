//! Shared data types for the Axiomic analysis engine.

use serde::{Deserialize, Serialize};

/// A single OHLCV bar. `time` is a UNIX timestamp in seconds.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Candle {
    pub time: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    #[serde(default)]
    pub volume: f64,
}

/// A time-indexed series of values produced by an indicator.
/// `values` is aligned 1:1 with the input candles; leading points that cannot
/// be computed (insufficient lookback) are `None`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Series {
    pub time: Vec<i64>,
    pub values: Vec<Option<f64>>,
}

impl Series {
    pub fn new(time: Vec<i64>, values: Vec<Option<f64>>) -> Self {
        Self { time, values }
    }
}

/// Extracts the closing prices from a slice of candles.
pub fn closes(candles: &[Candle]) -> Vec<f64> {
    candles.iter().map(|c| c.close).collect()
}

/// Extracts the timestamps from a slice of candles.
pub fn times(candles: &[Candle]) -> Vec<i64> {
    candles.iter().map(|c| c.time).collect()
}
