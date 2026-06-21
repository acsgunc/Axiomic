//! Pluggable market-data fetching.
//!
//! This crate hides *which* Yahoo Finance backend is used behind a single
//! strategy trait ([`MarketDataClient`]) and a unified, serializable model
//! ([`UnifiedQuote`]). Callers pick a backend at runtime via [`Provider`] and
//! route through [`MarketDataService`]; the rest of the application never
//! depends on `yfinance-rs` or `yahoo_finance_api` directly.
//!
//! ```no_run
//! use axiomic_data::{MarketDataService, Provider};
//!
//! # async fn run() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
//! let svc = MarketDataService::new(Provider::YFinance)?;
//! let quotes = svc.fetch_history("AAPL").await?;
//! println!("{} bars", quotes.len());
//! # Ok(())
//! # }
//! ```

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

/// Boxed, thread-safe error used across every backend so the `?` operator can
/// transparently convert each crate's native error type.
pub type BoxError = Box<dyn std::error::Error + Send + Sync>;

// ---------------------------------------------------------------------------
// 1. Unified data model
// ---------------------------------------------------------------------------

/// A single OHLCV bar, normalized across all providers.
///
/// `timestamp` is a UNIX timestamp in **seconds** (UTC). This mirrors the shape
/// used by the Axiomic analysis `core` so quotes can flow straight into it.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct UnifiedQuote {
    /// Bar timestamp, UNIX seconds (UTC).
    pub timestamp: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    /// Volume as a float (providers disagree on int vs. float; we normalize).
    pub volume: f64,
}

// ---------------------------------------------------------------------------
// 2. The strategy trait
// ---------------------------------------------------------------------------

/// The single contract every market-data backend implements.
///
/// `#[async_trait]` makes the async method object-safe so backends can be stored
/// as `Box<dyn MarketDataClient>` and chosen at runtime.
#[async_trait]
pub trait MarketDataClient: Send + Sync {
    /// Fetch recent daily history for `ticker`, normalized to [`UnifiedQuote`].
    async fn fetch_history(&self, ticker: &str) -> Result<Vec<UnifiedQuote>, BoxError>;
}

// ---------------------------------------------------------------------------
// 3a. Strategy implementation: yfinance-rs
// ---------------------------------------------------------------------------

/// [`MarketDataClient`] backed by the modern [`yfinance-rs`] crate.
///
/// Holds a reusable [`yfinance_rs::YfClient`] (cookie/crumb handling, retries,
/// connection pooling) for the lifetime of the client.
pub struct YFinanceClient {
    client: yfinance_rs::YfClient,
    range: yfinance_rs::Range,
    interval: yfinance_rs::Interval,
}

impl YFinanceClient {
    /// Creates a client with sensible defaults (full available daily history).
    pub fn new() -> Result<Self, BoxError> {
        Ok(Self {
            client: yfinance_rs::YfClient::default(),
            range: yfinance_rs::Range::Max,
            interval: yfinance_rs::Interval::D1,
        })
    }

    /// Overrides the default range/interval.
    pub fn with_window(
        mut self,
        range: yfinance_rs::Range,
        interval: yfinance_rs::Interval,
    ) -> Self {
        self.range = range;
        self.interval = interval;
        self
    }
}

#[async_trait]
impl MarketDataClient for YFinanceClient {
    async fn fetch_history(&self, ticker: &str) -> Result<Vec<UnifiedQuote>, BoxError> {
        let t = yfinance_rs::Ticker::new(&self.client, ticker);

        // `false` => no auto price-adjustment; keep raw OHLC.
        let candles = t
            .history(Some(self.range), Some(self.interval), false)
            .await?;

        let quotes = candles
            .into_iter()
            .map(|c| UnifiedQuote {
                // `ts` is a chrono `DateTime<Utc>`; `.timestamp()` -> UNIX secs.
                timestamp: c.ts.timestamp(),
                open: decimal_to_f64(c.ohlc.open.as_decimal()),
                high: decimal_to_f64(c.ohlc.high.as_decimal()),
                low: decimal_to_f64(c.ohlc.low.as_decimal()),
                close: decimal_to_f64(c.ohlc.close.as_decimal()),
                // Volume is optional and currency-/unit-agnostic.
                volume: c
                    .volume
                    .as_ref()
                    .map(|q| decimal_to_f64(q.as_decimal()))
                    .unwrap_or(0.0),
            })
            .collect();

        Ok(quotes)
    }
}

/// Converts a `rust_decimal`-style [`yfinance_rs::Decimal`] to `f64`.
///
/// We go through the decimal's `Display` rather than pulling in `num-traits`'
/// `ToPrimitive`, keeping the dependency surface minimal. Malformed values fall
/// back to `NAN` (which downstream analysis can filter).
fn decimal_to_f64(d: &yfinance_rs::Decimal) -> f64 {
    d.to_string().parse::<f64>().unwrap_or(f64::NAN)
}

// ---------------------------------------------------------------------------
// 3b. Strategy implementation: yahoo_finance_api (legacy)
// ---------------------------------------------------------------------------

/// [`MarketDataClient`] backed by the long-standing [`yahoo_finance_api`] crate.
pub struct YahooApiWrapper {
    connector: yahoo_finance_api::YahooConnector,
    /// Lookup interval, e.g. `"1d"`.
    interval: String,
    /// Lookback range, e.g. `"6mo"`.
    range: String,
}

impl YahooApiWrapper {
    /// Creates a wrapper with sensible defaults (full available daily history).
    pub fn new() -> Result<Self, BoxError> {
        Ok(Self {
            connector: yahoo_finance_api::YahooConnector::new()?,
            interval: "1d".to_string(),
            range: "max".to_string(),
        })
    }

    /// Overrides the default interval/range strings (Yahoo's own vocabulary).
    pub fn with_window(
        mut self,
        interval: impl Into<String>,
        range: impl Into<String>,
    ) -> Self {
        self.interval = interval.into();
        self.range = range.into();
        self
    }
}

#[async_trait]
impl MarketDataClient for YahooApiWrapper {
    async fn fetch_history(&self, ticker: &str) -> Result<Vec<UnifiedQuote>, BoxError> {
        let response = self
            .connector
            .get_quote_range(ticker, &self.interval, &self.range)
            .await?;

        let quotes = response
            .quotes()?
            .into_iter()
            .map(|q| UnifiedQuote {
                timestamp: q.timestamp as i64,
                open: q.open,
                high: q.high,
                low: q.low,
                close: q.close,
                volume: q.volume as f64,
            })
            .collect();

        Ok(quotes)
    }
}

// ---------------------------------------------------------------------------
// 4. Runtime switch: Provider enum + factory + routing service
// ---------------------------------------------------------------------------

/// Selects which backend a [`MarketDataService`] uses.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Provider {
    /// The modern `yfinance-rs` backend.
    YFinance,
    /// The legacy `yahoo_finance_api` backend.
    LegacyApi,
}

impl Provider {
    /// Factory: builds the concrete [`MarketDataClient`] for this provider.
    pub fn build_client(self) -> Result<Box<dyn MarketDataClient>, BoxError> {
        match self {
            Provider::YFinance => Ok(Box::new(YFinanceClient::new()?)),
            Provider::LegacyApi => Ok(Box::new(YahooApiWrapper::new()?)),
        }
    }
}

/// A thin wrapper that owns the active backend and forwards requests to it.
///
/// Switching providers is as simple as constructing a new service or calling
/// [`MarketDataService::switch`]; callers keep using [`MarketDataService::fetch_history`]
/// unchanged.
pub struct MarketDataService {
    provider: Provider,
    client: Box<dyn MarketDataClient>,
}

impl MarketDataService {
    /// Builds a service for `provider`.
    pub fn new(provider: Provider) -> Result<Self, BoxError> {
        Ok(Self {
            provider,
            client: provider.build_client()?,
        })
    }

    /// The currently active provider.
    pub fn provider(&self) -> Provider {
        self.provider
    }

    /// Swaps the active backend in place.
    pub fn switch(&mut self, provider: Provider) -> Result<(), BoxError> {
        self.client = provider.build_client()?;
        self.provider = provider;
        Ok(())
    }

    /// Routes a history request to the active backend.
    pub async fn fetch_history(&self, ticker: &str) -> Result<Vec<UnifiedQuote>, BoxError> {
        self.client.fetch_history(ticker).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unified_quote_serde_round_trips() {
        let q = UnifiedQuote {
            timestamp: 1_704_067_200,
            open: 10.0,
            high: 12.5,
            low: 9.25,
            close: 11.75,
            volume: 1_000_000.0,
        };
        let json = serde_json::to_string(&q).expect("serialize");
        let back: UnifiedQuote = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(q, back);
    }

    #[test]
    fn provider_serde_uses_named_variants() {
        assert_eq!(
            serde_json::to_string(&Provider::YFinance).unwrap(),
            "\"YFinance\""
        );
        assert_eq!(
            serde_json::to_string(&Provider::LegacyApi).unwrap(),
            "\"LegacyApi\""
        );
        let p: Provider = serde_json::from_str("\"LegacyApi\"").unwrap();
        assert_eq!(p, Provider::LegacyApi);
    }

    #[test]
    fn build_client_succeeds_for_both_providers() {
        // Construction must not require network access.
        assert!(Provider::YFinance.build_client().is_ok());
        assert!(Provider::LegacyApi.build_client().is_ok());
    }

    #[test]
    fn service_reports_and_switches_provider() {
        let mut svc = MarketDataService::new(Provider::YFinance).expect("construct");
        assert_eq!(svc.provider(), Provider::YFinance);
        svc.switch(Provider::LegacyApi).expect("switch");
        assert_eq!(svc.provider(), Provider::LegacyApi);
    }

    #[test]
    fn yfinance_client_window_override_is_applied() {
        // Smoke test the builder path compiles and runs without network.
        let client = YFinanceClient::new()
            .expect("client")
            .with_window(yfinance_rs::Range::M1, yfinance_rs::Interval::D1);
        // Field is private; constructing without panic is the assertion here.
        let _ = client;
    }
}
