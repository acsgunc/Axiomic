# TradingView-Style Charts

> Candles / Bars / Line / Area / Heikin-Ashi, a volume histogram, a
> crosshair-following OHLC + indicator legend, RSI & MACD sub-panes, drawing
> tools, price-scale modes, and PNG export — built on TradingView's
> `lightweight-charts`.

## Summary

The center chart is a full, TradingView-style charting surface. A toolbar above
the chart switches the price-series type, price-scale mode, volume, crosshair,
and drawing tools, and exports the chart as a PNG. RSI and MACD render in linked
sub-panes that stay time-synced with the main chart. All price math — including
the Heikin-Ashi transform — runs in the Rust/WASM core.

## Status

- **Added** — 2026-06-21
- **Changed** — 2026-06-28 — added a right-click context menu with **Reset Chart View**
- **Changed** — 2026-06-28 — added a TradingView-style **Measure** tool
  (context-menu item + **Shift + right-click** shortcut)
- **Changed** — 2026-06-29 — added a TradingView-style **Replay** tool
  (toolbar **⏵ Replay** button + context-menu item)
- **Changed** — 2026-06-29 — added a **Table view** (OHLCV data window) with
  **Chart / Table / Split** view modes and a **⤢ Full** full-screen toggle

## How to use

Open the web app, select a symbol, and use the toolbar above the chart:

- **Chart type** (dropdown): `Candles`, `Bars`, `Line`, `Area`, `Heikin-Ashi`.
- **Price scale**: `Lin` (linear), `Log` (logarithmic), `%` (percentage).
- **Drawing tools**: `╱ Trend` (click two points; a rubber-band preview follows
  the cursor), `— H-Line` (click once to drop a horizontal line). Click any
  drawing to remove it, or `Clear` to remove all.
- **Vol** toggles the up/down-colored volume histogram.
- **✛** toggles the crosshair; **＋ / －** zoom in/out; **⟲ Reset** jumps back to
  the default recent window (the most recent ~160 bars at a readable width,
  TradingView-style) and you can scroll/pan back through the full history.
- **⤓ PNG** downloads the chart (main + RSI + MACD panes stacked) as a PNG.
- **Right-click** anywhere on the chart to open a context menu. **Reset Chart
  View** restores the default recent window (same as the toolbar's **⟲ Reset**).
  The menu closes on selection, outside click, or `Escape`. (Right-click is
  suppressed while a drawing tool is active so it doesn't interrupt drawing.)
- **Measure** (context-menu item, or **Shift + right-click** as a shortcut)
  arms a TradingView-style measure tool: drag across the chart to read the
  **price change**, **percentage**, **number of bars**, and **elapsed time**
  between the two points. The box is colour-coded green (up) / red (down) and
  reprojects as you pan/zoom. Press `Escape` or right-click to dismiss it.
- **⏵ Replay** (toolbar button or context-menu item) replays history bar by
  bar. Click a bar to set the **start point**, then use the floating transport:
  **⏮** step back, **▶ / ⏸** play-pause, **⏭** step forward, a **speed**
  selector (0.5–10× bars/sec), a `revealed/total` readout, and **✕** to exit.
  Indicators (SMA/EMA/Bollinger/RSI/MACD) recompute on the revealed prefix, and
  the chart auto-scrolls to keep the replay edge in view.
- **Chart / Table / Split** (toolbar segmented control) switch the layout:
  `Chart` is the chart only, `Table` is a TradingView-style **data window** (a
  scrollable OHLCV table, most-recent first, with each bar's signed change and
  % change colour-coded green/red), and `Split` shows the chart and table side
  by side. The table tracks the active timeframe and the replay prefix.
- **⤢ Full** toggles full screen — the chart (and table, in Table/Split mode)
  expand to fill the window so you can read both at once. Press `Esc` or click
  **⤢ Exit** to leave full screen.

The legend in the top-left follows the crosshair, showing O/H/L/C, the bar's
percentage change, and live values for each enabled overlay (SMA/EMA/Bollinger).
Enable **RSI** and **MACD** in the Indicators panel to show their sub-panes.

```ts
// CandleChart is driven by candles + indicator config + the active symbol/timeframe.
<CandleChart
  candles={candles}
  indicators={indicators}
  symbol={activeSymbol}
  timeframe={timeframe}
/>
```

```ts
// Heikin-Ashi candles are computed in Rust and exposed via the engine bridge.
const ha = await engine.heikinAshi(candles); // Candle[] (same shape as input)
```

## Notes / caveats

- **Overlay stacking.** lightweight-charts paints its canvases at `z-index` 1 &
  2, so the interactive SVG overlays must sit above them: the drawing layer uses
  `z-index: 15` and the Measure overlay `z-index: 20`. Without this the canvas
  swallows every pointer event and the tools appear "dead".

- **All math stays in Rust.** Heikin-Ashi is `core/src/indicators.rs::heikin_ashi`,
  exposed through `lib.rs` as `heikin_ashi` and surfaced as `engine.heikinAshi`.
  Rebuild the WASM bundle (`pnpm --dir web wasm`) after editing the core.
- Volume uses a dedicated overlaid price scale (`scaleMargins` pin it to the
  bottom ~18% of the main pane).
- The drawing layer is an SVG overlay positioned with the chart's
  `logicalToCoordinate` / `priceToCoordinate`, so drawings reproject correctly
  on pan, zoom, resize, and data changes. The SVG is not part of the PNG export
  (the screenshot captures the chart canvas only).
- RSI/MACD panes are separate `lightweight-charts` instances kept in sync via
  `subscribeVisibleLogicalRangeChange`.

## Source

- [web/src/components/CandleChart.tsx](../../web/src/components/CandleChart.tsx) — chart, panes, legend, drawing layer
- [web/src/components/ChartToolbar.tsx](../../web/src/components/ChartToolbar.tsx) — toolbar controls
- [web/src/components/ChartContextMenu.tsx](../../web/src/components/ChartContextMenu.tsx) — right-click context menu (shared with the live dashboard panes)
- [web/src/components/ChartMeasureOverlay.tsx](../../web/src/components/ChartMeasureOverlay.tsx) — Measure tool overlay + `measurementInfo` math (shared)
- [web/src/components/ChartReplayBar.tsx](../../web/src/components/ChartReplayBar.tsx) — Replay transport + start-bar picker overlay (shared)
- [web/src/components/CandleTable.tsx](../../web/src/components/CandleTable.tsx) — TradingView-style OHLCV data table (shared)
- [web/src/lib/candleTable.ts](../../web/src/lib/candleTable.ts) — pure table-row builder (change vs previous close)
- [web/src/lib/useChartReplay.ts](../../web/src/lib/useChartReplay.ts) — replay state machine + playback timer
- [web/src/lib/replay.ts](../../web/src/lib/replay.ts) — pure replay helpers (speeds, clamping, click→index)
- [web/src/lib/chart.ts](../../web/src/lib/chart.ts) — chart types, ids, PNG export helper, `ViewMode`
- [web/src/engine.ts](../../web/src/engine.ts) — `heikinAshi` bridge
- [core/src/indicators.rs](../../core/src/indicators.rs) — `heikin_ashi`
- [core/src/lib.rs](../../core/src/lib.rs) — `heikin_ashi` WASM export
