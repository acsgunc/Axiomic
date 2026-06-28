# Live Multi-Chart Dashboard

> A configurable, responsive grid of live trading charts with independent
> per-pane symbol and timeframe, colour-coded flashing tickers, and a pluggable
> data-source layer (Hyperliquid crypto + yfinance equities out of the box).

## Summary

The **Live Grid** view (top-bar tab, default) shows 1–8 live candlestick charts
in the cleanest layout for the chosen count. A **Number of charts** selector
(1, 2, 4, 6, 8) reshuffles the grid (1 = full screen, 2 = side-by-side, 4 = 2×2,
6 = 3×2, 8 = 4×2) and is **persisted**, along with every pane's source/symbol/
timeframe, so your last layout is restored on reload. Each pane has its own
**source**, **symbol**, and **timeframe** dropdowns and a ticker bar that
**flashes green/red on every price change**.

Data sources are **pluggable** behind a single `MarketDataSource` interface, so
adding Alpaca, Binance, Zerodha, Polygon, etc. is a matter of implementing the
interface and registering it — no UI changes.

## Status

- **Added** — 2026-06-22 — Live multi-chart dashboard, Hyperliquid WebSocket
  crypto streaming, pluggable market-data registry, per-pane symbol/timeframe,
  flashing ticker bars, responsive grid, and intraday/range support in the proxy
  (plus a broadened symbol regex so Singapore `*.SI` and Indian `*.NS` tickers
  work).
- **Changed** — 2026-06-28 — each live pane's chart now has a right-click
  context menu with **Reset Chart View**.
- **Changed** — 2026-06-28 — each live pane gained the **Measure** tool
  (context-menu item + **Shift + right-click** shortcut).
- **Changed** — 2026-06-29 — each live pane gained the **Replay** tool
  (context-menu item) — replays the loaded history bar by bar; live ticks are
  frozen while a pane is in replay.
- **Changed** — 2026-06-29 — each live pane gained a **Table View** / **Split
  View** (OHLCV data window) and a **Full Screen** toggle (context-menu items).

## How to use

### Browser (crypto works with zero setup)

```bash
pnpm --dir web dev          # http://localhost:5173
# Optional, for equities (US/SG/India) in the browser:
pnpm --dir proxy dev        # http://localhost:8787 (Yahoo, no API key)
```

1. The app opens on **Live Grid**.
2. Pick **Number of charts** (1/2/4/6/8) at the top.
3. In any pane, use the three dropdowns:
   - **Data source** — `Hyperliquid (crypto)` or `yfinance (stocks)`.
   - **Symbol** — choose a curated symbol or type any (e.g. `BTC`, `AAPL`,
     `D05.SI`, `RELIANCE.NS`); free-form entry is allowed.
   - **Timeframe** — independent per pane (`1m … 1w` for crypto; `5m … 1w` for
     stocks).
4. The ticker bar flashes **green** on up-ticks and **red** on down-ticks; the
   `%` shown is the move vs. the previous bar's close (e.g. today's change on a
   daily chart). A green dot marks a live pane.
5. **Right-click** a pane's chart for a context menu — **Reset Chart View**
   snaps the zoom/pan back to the latest bars, and **Measure** (or
   **Shift + right-click**) drags out a price/%/bars/time measurement.
6. **Replay…** (context menu) replays that pane's loaded history bar by bar:
   click a bar to start, then play/pause/step/speed via the floating transport.
   Live updates for that pane pause until you exit replay; other panes keep
   streaming.
7. **Table View** / **Split View** (context menu) show that pane's OHLCV data as
   a TradingView-style data table — on its own, or side by side with the chart.
   **Full Screen** expands the pane (chart and/or table) to fill the window;
   `Esc` or **Exit Full Screen** returns to the grid. Each pane's view mode and
   full-screen state are independent, and the other panes keep streaming.

> Hyperliquid streams over a single shared WebSocket and needs no proxy/key.
> Equities use the existing yfinance path (native crates on desktop, the
> Cloudflare Worker proxy in the browser) and stream "live" via lightweight
> polling of the latest bar.

### Add a new broker (pluggable)

```ts
import { registerSource, type MarketDataSource } from './lib/marketData';

const alpaca: MarketDataSource = {
  id: 'alpaca',
  label: 'Alpaca',
  assetClass: 'stocks',
  streaming: true,
  intervals: ['1m', '5m', '1h', '1d'],
  symbols: [{ symbol: 'AAPL', label: 'Apple' }],
  allowCustomSymbol: true,
  async fetchCandles(symbol, interval) { /* … */ return []; },
  subscribe(symbol, interval, onUpdate) { /* … */ return () => {}; },
};

registerSource(alpaca); // now selectable in every pane's source dropdown
```

## Notes / caveats

- **Hyperliquid history** comes from the REST `candleSnapshot` endpoint; live
  bars from the `candle` WebSocket subscription (auto-reconnect + heartbeat).
- **Equity "live"** is poll-based (no Yahoo WebSocket): ~15 s intraday, ~60 s
  daily, emitting only on an actual price change.
- **Cross-origin isolation** (COOP/COEP) does not block the dashboard:
  WebSockets are exempt and Hyperliquid REST responses are CORS-enabled.
- The previous single-symbol analysis workspace is unchanged — it now lives
  behind the **Analyse** tab.

## Source

- [web/src/lib/marketData/types.ts](../../web/src/lib/marketData/types.ts) — `MarketDataSource` interface
- [web/src/lib/marketData/hyperliquid.ts](../../web/src/lib/marketData/hyperliquid.ts) — WS multiplexer + REST candles
- [web/src/lib/marketData/yfinance.ts](../../web/src/lib/marketData/yfinance.ts) — equities source (proxy/native + polling)
- [web/src/lib/marketData/registry.ts](../../web/src/lib/marketData/registry.ts) — source registry (`registerSource`)
- [web/src/lib/gridLayout.ts](../../web/src/lib/gridLayout.ts) — grid geometry
- [web/src/store/useDashboardStore.ts](../../web/src/store/useDashboardStore.ts) — persisted chart count + pane config
- [web/src/components/dashboard/](../../web/src/components/dashboard/) — `LiveDashboard`, `ChartGrid`, `LivePane`, `LiveChart`, `TickerBar`
- [web/src/components/ChartContextMenu.tsx](../../web/src/components/ChartContextMenu.tsx) — shared right-click menu (Reset Chart View)
- [web/src/components/ChartMeasureOverlay.tsx](../../web/src/components/ChartMeasureOverlay.tsx) — shared Measure tool (Shift + right-click)
- [web/src/components/ChartReplayBar.tsx](../../web/src/components/ChartReplayBar.tsx) — shared Replay transport + start-bar picker
- [web/src/components/CandleTable.tsx](../../web/src/components/CandleTable.tsx) — shared OHLCV data table (Table / Split view)
- [web/src/App.tsx](../../web/src/App.tsx) — Live Grid / Analyse view switcher
- [proxy/src/worker.ts](../../proxy/src/worker.ts) — `interval`/`range` params + broadened symbol regex
