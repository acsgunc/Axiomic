# Chart Timeframes

> The `1D` / `1W` / `1M` / `3M` / `1Y` / `ALL` buttons select the **candle
> interval**: each button aggregates the full daily history into that bar size
> (TradingView-style interval selection). The chart opens on a readable window of
> the most recent bars and is pan/zoom-able to reveal the rest of the history.

## Summary

Each timeframe button sets the candle size: `1D` shows daily candles, `1W`
weekly, `1M` monthly, `3M` quarterly, `1Y` yearly. The full price history is
aggregated into that interval. Like TradingView, the chart opens on the most
recent ~160 bars at a legible width (rather than cramming all history into the
pane); scroll/zoom out to see older data. When fewer than ~160 bars exist for an
interval, everything is fit to view. `ALL` (like `1D`) shows the raw daily candles.

## Status

- **Fixed** — 2026-06-21 (recent-window default view; `1D` blob bug resolved)

## How to use

In the web app, click a timeframe button above the chart:

- `1D` — daily candles (default; one bar per source day) · `ALL` — same raw daily bars
- `1W` — weekly bars (fixed 7-day buckets)
- `1M` — monthly bars (calendar month) · `3M` — quarterly · `1Y` — yearly

Each aggregated bar uses first-open, last-close, max-high, min-low and summed
volume. The chart opens on the most recent bars; use the toolbar's **＋ / －**
to zoom, **⟲ Reset** to jump back to the default recent window, and drag to pan
through older history.

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

- Because the timeframe is the **candle size**, the amount of history available
  depends on how much data is loaded. The offline sample data spans ~10 years
  and the live backends fetch the full available history, so `1Y` shows ~10
  yearly candles, `3M` ~40, and `1M` ~120. `1D` opens on the most recent ~160
  daily candles (≈8 months) and scrolls back through the full ~10 years.
- Intra-day intervals are not supported because the source data is daily; `1D`
  is the finest interval and the default.
- Aggregation assumes source candles are sorted ascending by time (they are, as
  produced by the data layer and sample generator) and does not mutate the
  source array.

## Source

- [web/src/lib/timeframe.ts](../../web/src/lib/timeframe.ts) — `resampleCandles`, `bucketKey`, `TIMEFRAMES`
- [web/src/App.tsx](../../web/src/App.tsx) — resamples by timeframe, timeframe buttons
- [web/src/components/CandleChart.tsx](../../web/src/components/CandleChart.tsx) — opens on the recent-window default view (`DEFAULT_VISIBLE_BARS`); zoom/reset controls
