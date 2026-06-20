//! Axiomic desktop entry point (Tauri 2.0).
//!
//! The desktop app reuses the exact same web frontend (built to `web/dist`) and
//! the shared `axiomic-core` crate natively. A sample command demonstrates
//! invoking the shared analysis engine from the Rust backend over Tauri IPC.

use axiomic_core::{backtest, BacktestConfig, Candle};

/// Runs an SMA-crossover backtest natively in the desktop backend.
/// Exposed to the frontend via Tauri IPC as `run_backtest`.
#[tauri::command]
fn run_backtest(candles: Vec<Candle>, config: BacktestConfig) -> serde_json::Value {
    let result = backtest::run_sma_crossover(&candles, &config);
    serde_json::to_value(result).unwrap_or(serde_json::Value::Null)
}

/// Returns the shared core engine version.
#[tauri::command]
fn engine_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![run_backtest, engine_version])
        .run(tauri::generate_context!())
        .expect("error while running Axiomic");
}
