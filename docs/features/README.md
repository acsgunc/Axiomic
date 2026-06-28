# Feature Documentation

Living docs for shipped features and notable fixes. One page per feature area.

## Features

- [Live Multi-Chart Dashboard](./live-dashboard.md) — configurable 1–8 live chart grid, Hyperliquid crypto + yfinance equities, per-pane symbol/timeframe, flashing tickers, pluggable sources
- [Feature Guard Hook](./feature-guard-hook.md) — Stop hook enforcing docs + tests for code changes
- [TradingView-Style Charts](./tradingview-charts.md) — chart types, volume, legend, RSI/MACD panes, drawing tools, PNG export
- [Chart Timeframes](./chart-timeframes.md) — timeframe buttons select the candle interval (1D/1W/1M/3M/1Y aggregation)
- [Test Suite](./testing.md) — backend + frontend tests and how to run them
- [Loading Live Data in the App](./live-data.md) — enable and use the in-app live fetch
- [Market Data Fetching](./market-data.md) — pluggable Yahoo Finance backends behind one trait

## Changelog

- 2026-06-28 — **Added** TradingView-style **Measure** tool (context-menu item + **Shift + right-click**) on every chart — drag to read price change, %, bars and elapsed time ([tradingview-charts](./tradingview-charts.md), [live-dashboard](./live-dashboard.md))
- 2026-06-28 — **Added** chart right-click context menu with a **Reset Chart View** action — in the analysis chart and every live-grid pane ([tradingview-charts](./tradingview-charts.md), [live-dashboard](./live-dashboard.md))
- 2026-06-22 — **Added** live multi-chart dashboard — configurable 1/2/4/6/8 grid (persisted), Hyperliquid WebSocket crypto + yfinance equities (US/SG/India), independent per-pane symbol/timeframe, colour-coded flashing ticker bars, and a pluggable `MarketDataSource` registry; proxy now accepts `interval`/`range` and a broadened symbol regex for `*.SI`/`*.NS` tickers ([live-dashboard](./live-dashboard.md))
- 2026-06-21 — **Added** browser **Source** provider selector (like the desktop) — the Data panel dropdown forwards a `provider` query param to the proxy, routed to Yahoo's query1/query2 edge hosts ([live-data](./live-data.md))
- 2026-06-21 — **Fixed** browser live data ("Network error contacting the data proxy") — the proxy now fronts Yahoo Finance (free, **no API key**) and pins dev port 8787, so live fetch works with just `pnpm --dir proxy dev` ([live-data](./live-data.md))
- 2026-06-21 — **Fixed** desktop app loaded stale/blank content — Vite now uses `strictPort` on 5173 (matching Tauri's `devUrl`) instead of silently moving to 5174, and `run-desktop.ps1` reports a busy port early ([live-data](./live-data.md))
- 2026-06-21 — **Fixed** `1D` chart rendered an unreadable blob (all ~10 years crammed in via `fitContent` + tiny `minBarSpacing`); the chart now opens on a readable recent window (~160 bars) and scrolls back through history, fixing the "1D not working" and zoom-feels-broken bugs ([chart-timeframes](./chart-timeframes.md), [tradingview-charts](./tradingview-charts.md))
- 2026-06-21 — **Changed** extended history depth — offline sample data now spans ~10 years and native backends default to full history, so `1Y` shows many candles ([chart-timeframes](./chart-timeframes.md), [market-data](./market-data.md))
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
