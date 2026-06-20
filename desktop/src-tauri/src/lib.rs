//! Axiomic desktop entry point (Tauri 2.0).
//!
//! The desktop app reuses the exact same web frontend (built to `web/dist`) and
//! the shared `axiomic-core` crate natively. A sample command demonstrates
//! invoking the shared analysis engine from the Rust backend over Tauri IPC.

use axiomic_core::{backtest, BacktestConfig, Candle};
use axiomic_data::{MarketDataService, Provider};

/// Runs an SMA-crossover backtest natively in the desktop backend.
/// Exposed to the frontend via Tauri IPC as `run_backtest`.
#[tauri::command]
fn run_backtest(candles: Vec<Candle>, config: BacktestConfig) -> serde_json::Value {
    let result = backtest::run_sma_crossover(&candles, &config);
    serde_json::to_value(result).unwrap_or(serde_json::Value::Null)
}

/// Fetches live daily OHLCV history for `ticker` from a free Yahoo Finance
/// backend, selectable at runtime. Exposed to the frontend as `fetch_history`.
///
/// `provider` accepts `"yfinance"` (modern `yfinance-rs`) or `"yahoo"` (legacy
/// `yahoo_finance_api`); anything else defaults to `yfinance`. Returns candles
/// in the shared [`Candle`] shape the frontend already consumes.
#[tauri::command]
async fn fetch_history(ticker: String, provider: String) -> Result<Vec<Candle>, String> {
    let provider = match provider.to_ascii_lowercase().as_str() {
        "yahoo" | "legacy" | "legacyapi" => Provider::LegacyApi,
        _ => Provider::YFinance,
    };

    let service = MarketDataService::new(provider).map_err(|e| e.to_string())?;
    let quotes = service
        .fetch_history(ticker.trim())
        .await
        .map_err(|e| e.to_string())?;

    Ok(quotes
        .into_iter()
        .map(|q| Candle {
            time: q.timestamp,
            open: q.open,
            high: q.high,
            low: q.low,
            close: q.close,
            volume: q.volume,
        })
        .collect())
}

/// Returns the shared core engine version.
#[tauri::command]
fn engine_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            run_backtest,
            fetch_history,
            engine_version
        ])
        .run(tauri::generate_context!())
        .expect("error while running Axiomic");
}
