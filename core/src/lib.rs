//! Axiomic analysis engine.
//!
//! This crate contains all heavy computation for Axiomic — technical indicators
//! and a backtesting engine — written once in Rust and reused across the WASM
//! (browser), desktop (Tauri), and optional server builds.
//!
//! When compiled with the `wasm` feature, a `wasm-bindgen` surface is exposed
//! so the React frontend can call directly into this engine. Native consumers
//! (desktop/server) use the plain Rust API in [`indicators`] and [`backtest`].

pub mod backtest;
pub mod indicators;
pub mod types;

pub use backtest::{BacktestConfig, BacktestResult, Trade};
pub use indicators::{Bollinger, Macd};
pub use types::{Candle, Series};

#[cfg(feature = "wasm")]
mod wasm_api {
    use super::*;
    use wasm_bindgen::prelude::*;

    /// Initializes panic hooks for better error messages in the browser console.
    /// Safe to call multiple times.
    #[wasm_bindgen(start)]
    pub fn start() {
        console_error_panic_hook::set_once();
    }

    fn parse_candles(candles: JsValue) -> Result<Vec<Candle>, JsValue> {
        serde_wasm_bindgen::from_value(candles)
            .map_err(|e| JsValue::from_str(&format!("invalid candles: {e}")))
    }

    fn to_js<T: serde::Serialize>(value: &T) -> Result<JsValue, JsValue> {
        serde_wasm_bindgen::to_value(value)
            .map_err(|e| JsValue::from_str(&format!("serialization failed: {e}")))
    }

    /// Parses a CSV string of OHLCV data into the canonical candle JSON shape.
    ///
    /// Expected header (case-insensitive, order-flexible): a date/time column
    /// (`date`, `time`, or `timestamp`) plus `open`, `high`, `low`, `close`,
    /// and optional `volume`. Dates may be ISO `YYYY-MM-DD`, `YYYY-MM-DD HH:MM:SS`,
    /// or a UNIX timestamp in seconds.
    #[wasm_bindgen]
    pub fn parse_csv(csv: &str) -> Result<JsValue, JsValue> {
        let candles = crate::csv::parse_csv(csv).map_err(|e| JsValue::from_str(&e))?;
        to_js(&candles)
    }

    #[wasm_bindgen]
    pub fn sma(candles: JsValue, period: usize) -> Result<JsValue, JsValue> {
        let c = parse_candles(candles)?;
        to_js(&indicators::sma(&c, period))
    }

    #[wasm_bindgen]
    pub fn ema(candles: JsValue, period: usize) -> Result<JsValue, JsValue> {
        let c = parse_candles(candles)?;
        to_js(&indicators::ema(&c, period))
    }

    #[wasm_bindgen]
    pub fn rsi(candles: JsValue, period: usize) -> Result<JsValue, JsValue> {
        let c = parse_candles(candles)?;
        to_js(&indicators::rsi(&c, period))
    }

    #[wasm_bindgen]
    pub fn macd(
        candles: JsValue,
        fast: usize,
        slow: usize,
        signal: usize,
    ) -> Result<JsValue, JsValue> {
        let c = parse_candles(candles)?;
        to_js(&indicators::macd(&c, fast, slow, signal))
    }

    #[wasm_bindgen]
    pub fn bollinger(candles: JsValue, period: usize, std_devs: f64) -> Result<JsValue, JsValue> {
        let c = parse_candles(candles)?;
        to_js(&indicators::bollinger(&c, period, std_devs))
    }

    #[wasm_bindgen]
    pub fn atr(candles: JsValue, period: usize) -> Result<JsValue, JsValue> {
        let c = parse_candles(candles)?;
        to_js(&indicators::atr(&c, period))
    }

    /// Runs an SMA-crossover backtest. `config` is the JSON form of
    /// [`BacktestConfig`].
    #[wasm_bindgen]
    pub fn backtest_sma_crossover(candles: JsValue, config: JsValue) -> Result<JsValue, JsValue> {
        let c = parse_candles(candles)?;
        let cfg: BacktestConfig = serde_wasm_bindgen::from_value(config)
            .map_err(|e| JsValue::from_str(&format!("invalid config: {e}")))?;
        to_js(&backtest::run_sma_crossover(&c, &cfg))
    }

    /// Returns the engine version string.
    #[wasm_bindgen]
    pub fn version() -> String {
        env!("CARGO_PKG_VERSION").to_string()
    }
}

pub mod csv;
