//! Demo: fetch the same ticker through both backends, switching at runtime.
//!
//! Run with:  `cargo run --bin axiomic-data-demo`

use axiomic_data::{BoxError, MarketDataService, Provider, UnifiedQuote};

#[tokio::main]
async fn main() -> Result<(), BoxError> {
    let ticker = "AAPL";

    // Start on the modern backend.
    let mut service = MarketDataService::new(Provider::YFinance)?;
    report(&service, ticker).await;

    // Seamless switch to the legacy backend — call site is identical.
    service.switch(Provider::LegacyApi)?;
    report(&service, ticker).await;

    Ok(())
}

/// Fetches and prints a short summary for the service's active provider.
async fn report(service: &MarketDataService, ticker: &str) {
    println!("\n=== provider: {:?} ===", service.provider());
    match service.fetch_history(ticker).await {
        Ok(quotes) => summarize(ticker, &quotes),
        Err(e) => eprintln!("  fetch failed: {e}"),
    }
}

fn summarize(ticker: &str, quotes: &[UnifiedQuote]) {
    println!("  {ticker}: {} bars", quotes.len());
    if let (Some(first), Some(last)) = (quotes.first(), quotes.last()) {
        println!(
            "  first  ts={} close={:.2}",
            first.timestamp, first.close
        );
        println!("  last   ts={} close={:.2}", last.timestamp, last.close);
    }
}
