# Feature Documentation

Living docs for shipped features and notable fixes. One page per feature area.

## Features

- [Test Suite](./testing.md) — backend + frontend tests and how to run them
- [Loading Live Data in the App](./live-data.md) — enable and use the in-app live fetch
- [Market Data Fetching](./market-data.md) — pluggable Yahoo Finance backends behind one trait

## Changelog

- 2026-06-21 — **Added** comprehensive test suite (Rust core/data/desktop + Vitest frontend) and [docs/TESTING.md](../TESTING.md) ([testing](./testing.md))
- 2026-06-21 — **Added** Data mode toggle (Live / Local) with persistence ([live-data](./live-data.md))
- 2026-06-21 — **Added** desktop provider selector + native `fetch_history` (yfinance-rs / yahoo_finance_api) ([live-data](./live-data.md))
- 2026-06-21 — **Fixed** live-data control discoverability in the Data panel ([live-data](./live-data.md))
- 2026-06-21 — **Added** market data fetching crate (`axiomic-data`) with runtime backend switching ([market-data](./market-data.md))
