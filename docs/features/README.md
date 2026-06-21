# Feature Documentation

Living docs for shipped features and notable fixes. One page per feature area.

## Features

- [Feature Guard Hook](./feature-guard-hook.md) — Stop hook enforcing docs + tests for code changes
- [TradingView-Style Charts](./tradingview-charts.md) — chart types, volume, legend, RSI/MACD panes, drawing tools, PNG export
- [Chart Timeframes](./chart-timeframes.md) — timeframe buttons select the candle interval (1D/1W/1M/3M/1Y aggregation)
- [Test Suite](./testing.md) — backend + frontend tests and how to run them
- [Loading Live Data in the App](./live-data.md) — enable and use the in-app live fetch
- [Market Data Fetching](./market-data.md) — pluggable Yahoo Finance backends behind one trait

## Changelog

- 2026-06-21 — **Changed** timeframe buttons now set the candle interval (1D daily, 1W weekly, 1M/3M/1Y aggregated) and added zoom in/out + reset-view controls ([chart-timeframes](./chart-timeframes.md), [tradingview-charts](./tradingview-charts.md))
- 2026-06-21 — **Fixed** timeframe buttons are now zoom/lookback windows over the full history (1Y shows ~250 daily candles, draggable) instead of aggregating to 1–2 bars ([chart-timeframes](./chart-timeframes.md))
- 2026-06-21 — **Added** TradingView-style charts — Candles/Bars/Line/Area/Heikin-Ashi, volume histogram, crosshair legend, RSI/MACD sub-panes, drawing tools, price-scale modes, PNG export ([tradingview-charts](./tradingview-charts.md))
- 2026-06-21 — **Added** Feature Guard Stop hook — blocks turn end when source changed without matching `docs/features/` + tests ([feature-guard-hook](./feature-guard-hook.md))
- 2026-06-21 — **Added** `feature-tests` skill — auto-adds/updates tests and refreshes [docs/TESTING.md](../TESTING.md) for every feature/fix ([testing](./testing.md))
- 2026-06-21 — **Added** comprehensive test suite (Rust core/data/desktop + Vitest frontend) and [docs/TESTING.md](../TESTING.md) ([testing](./testing.md))
- 2026-06-21 — **Added** Data mode toggle (Live / Local) with persistence ([live-data](./live-data.md))
- 2026-06-21 — **Added** desktop provider selector + native `fetch_history` (yfinance-rs / yahoo_finance_api) ([live-data](./live-data.md))
- 2026-06-21 — **Fixed** live-data control discoverability in the Data panel ([live-data](./live-data.md))
- 2026-06-21 — **Added** market data fetching crate (`axiomic-data`) with runtime backend switching ([market-data](./market-data.md))
