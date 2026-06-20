# Market Data Fetching

> Swap between Yahoo Finance backends behind one trait, returning a unified OHLCV model.

## Summary

The native `axiomic-data` crate fetches historical OHLCV data and lets you switch
at runtime between two backends — the modern `yfinance-rs` and the legacy
`yahoo_finance_api` — behind a single `MarketDataClient` strategy trait. Results
are normalized to a serializable `UnifiedQuote` (UNIX-seconds timestamps that line
up with the analysis `core`).

This is a **native-only** crate (tokio + reqwest); it deliberately lives outside
the WASM `core` so the WASM build stays free of non-`wasm32` dependencies.

## Status

- **Added** — 2026-06-21
- **Changed** — 2026-06-21 — Wired into the **desktop app** via the
  `fetch_history` Tauri command, with a UI provider selector. See
  [live-data](./live-data.md).

## How to use

Run the bundled demo (fetches `AAPL` via `yfinance-rs`, then switches to
`yahoo_finance_api` with an identical call site):

```bash
cd data
cargo run --bin axiomic-data-demo
```

Use it from code:

```rust
use axiomic_data::{MarketDataService, Provider};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Pick a backend at runtime.
    let mut svc = MarketDataService::new(Provider::YFinance)?;
    let quotes = svc.fetch_history("AAPL").await?; // Vec<UnifiedQuote>

    // Seamless switch — call site is unchanged.
    svc.switch(Provider::LegacyApi)?;
    let quotes_legacy = svc.fetch_history("AAPL").await?;

    println!("{} / {} bars", quotes.len(), quotes_legacy.len());
    Ok(())
}
```

`UnifiedQuote` fields: `timestamp: i64` (UNIX seconds, UTC), `open`, `high`,
`low`, `close`, `volume` (all `f64`); derives `Serialize`/`Deserialize`.

## Notes / caveats

- Requires Rust ≥ 1.91 (`yfinance-rs` 0.9 MSRV); verified compiling on 1.96.
- Default window is 6 months of daily bars; override per backend with
  `YFinanceClient::with_window(Range, Interval)` or
  `YahooApiWrapper::with_window(interval, range)`.
- Both backends hit the network — runtime fetches can fail if offline or
  rate-limited.
- **Native-only:** consumed by the **desktop** app (Tauri) via `fetch_history`,
  not the browser build (tokio/reqwest don't target WASM — the browser uses the
  proxy instead). See [live-data](./live-data.md).

## Source

- [data/Cargo.toml](../../data/Cargo.toml)
- [data/src/lib.rs](../../data/src/lib.rs)
- [data/src/main.rs](../../data/src/main.rs)
- [desktop/src-tauri/src/lib.rs](../../desktop/src-tauri/src/lib.rs) — `fetch_history` Tauri command
