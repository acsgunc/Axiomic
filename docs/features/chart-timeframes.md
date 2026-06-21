# Chart Timeframes

> The `1D` / `1W` / `1M` / `3M` / `1Y` / `ALL` buttons are TradingView-style
> zoom/lookback presets over the **full** price history — every candle stays
> loaded and draggable.

## Summary

Each timeframe button sets the **visible window** of the chart to a trailing
lookback (1 day … 1 year, or the whole series for `ALL`). The complete daily
history is always loaded into the chart, so you can pan or zoom out from any
preset to reveal every available bar.

## Status

- **Fixed** — 2026-06-21

## How to use

In the web app, click a timeframe button above the chart:

- `1D` — last day · `1W` — last 7 days · `1M` — last 30 days
- `3M` — last 90 days · `1Y` — last 365 days
- `ALL` — fit the entire available history

`1Y` is the default. Drag horizontally to pan further back than the preset
window; scroll / pinch to zoom. The full history is reachable from any preset.

```ts
// App.tsx — the timeframe is a view preset, not an aggregation; all candles
// are passed straight through to the chart.
const candles = allCandles;
<CandleChart candles={candles} indicators={indicators} symbol={activeSymbol} timeframe={timeframe} />
```

```ts
// lib/timeframe.ts — maps a preset to a visible time window over the history.
const range = visibleRangeFor(candles, '1Y'); // { from, to } in UNIX seconds, or null for ALL
```

## Notes / caveats

- Previously the buttons **resampled** the history into bar intervals
  (weekly/monthly/…). On ~1.4 years of daily data, `1Y` aggregated down to only
  1–2 yearly candles — which looked like "the chart shows 1–2 candles." The
  buttons now window the data instead of aggregating it, so a year shows ~250
  daily candles.
- The window is applied as a **logical (bar-index) range**, and the time scale
  uses a small `minBarSpacing`, so a full year fits reliably even in a narrow
  pane (a plain time range would otherwise be clamped to a handful of fat bars).
- Manually panning/zooming moves away from the preset window; click a timeframe
  again to snap back. `visibleRangeFor` keeps at least `MIN_VISIBLE_BARS`
  visible so tiny windows never collapse to a single candle.
- Assumes source candles are sorted ascending by time (they are, as produced by
  the data layer and sample generator).

## Source

- [web/src/lib/timeframe.ts](../../web/src/lib/timeframe.ts) — `visibleRangeFor`, `TIMEFRAME_DAYS`, `TIMEFRAMES`
- [web/src/App.tsx](../../web/src/App.tsx) — timeframe state + buttons, passes `timeframe` to the chart
- [web/src/components/CandleChart.tsx](../../web/src/components/CandleChart.tsx) — applies the window as a logical range; `minBarSpacing`
