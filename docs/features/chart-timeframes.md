# Chart Timeframes

> The `1D` / `1W` / `1M` / `3M` / `1Y` / `ALL` buttons now resample candles into
> bar intervals instead of cropping to a few days, with a draggable time axis.

## Summary

The timeframe buttons select a **candle interval** and aggregate the full price
history into that bar size (weekly, monthly, quarterly, yearly), so every
timeframe shows many candles. The chart's time axis is visible and the chart
pans/zooms by drag.

## Status

- **Fixed** — 2026-06-21

## How to use

In the web app, click a timeframe button above the chart:

- `1D` / `ALL` — raw daily candles (one bar per source candle).
- `1W` — weekly bars (fixed 7-day buckets).
- `1M` — monthly bars (calendar month).
- `3M` — quarterly bars.
- `1Y` — yearly bars.

Each aggregated bar uses first-open, last-close, max-high, min-low, and summed
volume. Drag horizontally to pan; scroll / pinch to zoom. The time axis is
shown along the bottom.

```ts
// App.tsx — resampling drives the selected interval
const candles = useMemo(
  () => resampleCandles(allCandles, timeframe),
  [allCandles, timeframe],
);
```

## Notes / caveats

- Previously the buttons were **trailing day-window filters**. On daily data,
  `1D` kept ~1 candle and `1W` ~5 — too few to render a time axis or to pan,
  which looked like "no candles / no time axis / can't drag."
- Aggregation assumes source candles are sorted ascending by time (they are, as
  produced by the data layer and sample generator).
- Intra-day intervals are not supported because the source data is daily; `1D`
  is therefore the finest interval and the new default.

## Source

- [web/src/App.tsx](../../web/src/App.tsx) — `resampleCandles`, `bucketKey`, timeframe buttons
- [web/src/components/CandleChart.tsx](../../web/src/components/CandleChart.tsx) — visible time scale + scroll/scale handling
