# Feature Documentation

Living docs for shipped features and notable fixes. One page per feature area.

## Features

- [Chart Timeframes](./chart-timeframes.md) — resample candles into bar intervals with a draggable time axis
- [Test Suite](./testing.md) — backend + frontend tests and how to run them
- [Loading Live Data in the App](./live-data.md) — enable and use the in-app live fetch
- [Market Data Fetching](./market-data.md) — pluggable Yahoo Finance backends behind one trait

## Changelog

- 2026-06-21 — **Fixed** chart timeframe buttons now resample candles into bar intervals (1W/1M/3M/1Y) with a visible, draggable time axis ([chart-timeframes](./chart-timeframes.md))
- 2026-06-21 — **Added** `feature-tests` skill — auto-adds/updates tests and refreshes [docs/TESTING.md](../TESTING.md) for every feature/fix ([testing](./testing.md))
- 2026-06-21 — **Added** comprehensive test suite (Rust core/data/desktop + Vitest frontend) and [docs/TESTING.md](../TESTING.md) ([testing](./testing.md))
- 2026-06-21 — **Added** Data mode toggle (Live / Local) with persistence ([live-data](./live-data.md))
- 2026-06-21 — **Added** desktop provider selector + native `fetch_history` (yfinance-rs / yahoo_finance_api) ([live-data](./live-data.md))
- 2026-06-21 — **Fixed** live-data control discoverability in the Data panel ([live-data](./live-data.md))
- 2026-06-21 — **Added** market data fetching crate (`axiomic-data`) with runtime backend switching ([market-data](./market-data.md))
