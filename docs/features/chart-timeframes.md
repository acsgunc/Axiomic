# Chart Timeframes

> The `1D` / `1W` / `1M` / `3M` / `1Y` / `ALL` buttons select the **candle
> interval**: each button aggregates the full daily history into that bar size
> (TradingView-style interval selection). The whole series is shown end-to-end
> and is pan/zoom-able.

## Summary

Each timeframe button sets the candle size: `1D` shows daily candles, `1W`
weekly, `1M` monthly, `3M` quarterly, `1Y` yearly. The full price history is
aggregated into that interval and fit to view, so you always see every bar for
the chosen size. `ALL` (like `1D`) shows the raw daily candles.

## Status

- **Fixed** — 2026-06-21

## How to use

In the web app, click a timeframe button above the chart:

- `1D` — daily candles (default; one bar per source day) · `ALL` — same raw daily bars
- `1W` — weekly bars (fixed 7-day buckets)
- `1M` — monthly bars (calendar month) · `3M` — quarterly · `1Y` — yearly

Each aggregated bar uses first-open, last-close, max-high, min-low and summed
volume. Use the toolbar's **＋ / －** to zoom and **⟲ Reset** to fit all data;
drag to pan.

```ts
// App.tsx — the timeframe picks the candle interval; the history is aggregated
// into that bar size before being handed to the chart.
const candles = useMemo(
  () => resampleCandles(allCandles, timeframe),
  [allCandles, timeframe],
);
<CandleChart candles={candles} indicators={indicators} symbol={activeSymbol} timeframe={timeframe} />
```

```ts
// lib/timeframe.ts — bucketKey maps a timestamp to its interval bucket;
// resampleCandles aggregates the series into those buckets.
const weekly = resampleCandles(candles, '1W');
```

## Notes / caveats

- Because the timeframe is the **candle size**, coarse intervals on a short
  history show few bars by design — e.g. ~1.4 years of data yields only 1–2
  candles at `1Y` and ~5 at `3M`. Use `1D`/`1W`/`1M` for dense views, or the
  zoom controls to inspect any range.
- Intra-day intervals are not supported because the source data is daily; `1D`
  is the finest interval and the default.
- Aggregation assumes source candles are sorted ascending by time (they are, as
  produced by the data layer and sample generator) and does not mutate the
  source array.

## Source

- [web/src/lib/timeframe.ts](../../web/src/lib/timeframe.ts) — `resampleCandles`, `bucketKey`, `TIMEFRAMES`
- [web/src/App.tsx](../../web/src/App.tsx) — resamples by timeframe, timeframe buttons
- [web/src/components/CandleChart.tsx](../../web/src/components/CandleChart.tsx) — fits aggregated data to view; zoom/reset controls
