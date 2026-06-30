# Price Targets

## Summary

A standalone **Targets** workspace that visualises percentage-based price
targets for a position. Enter a base price (manually or resolved from a stock
ticker) and get a ladder of target prices from **-100% to +500% in 5% steps**
plus a line chart of target price vs. percentage change with a dashed **0%
(current price)** reference line. This is the price-tier foundation for the
"average down a losing position" tool.

## Status

- **Added** — 2026-06-30

## How to use

1. Run the app (`pnpm --dir web dev`) and click **Targets** in the top nav.
2. Set the base price one of two ways:
   - **Manual** — type a price and click **Set price**.
   - **Ticker** — switch to the Ticker tab, type a symbol (e.g. `AAPL`) and
     click **Use last price**. The price is taken from already-loaded candles,
     or fetched live; with no live source it falls back to deterministic sample
     data so the tool works offline.
3. The center **Target Price vs. % Change** chart plots every tier; hover to
   read a specific `% → price`. The amber dashed line marks 0% (the base price).
4. The right **Price Targets** table lists each 5% tier with its target price
   and dollar change (Δ $); the 0% row is highlighted.

The target price for any tier is `base × (1 + percent / 100)`.

## Source

- [web/src/lib/priceTargets.ts](../../web/src/lib/priceTargets.ts) — pure ladder
  + chart-geometry math (`buildPriceTargets`, `targetPrice`,
  `targetChartGeometry`).
- [web/src/components/PriceTargetChart.tsx](../../web/src/components/PriceTargetChart.tsx)
  — SVG percentage-vs-price line chart (resize-aware, with the 0% baseline).
- [web/src/components/PriceTargetWorkspace.tsx](../../web/src/components/PriceTargetWorkspace.tsx)
  — sidebar input, ladder table, and chart layout.
- [web/src/App.tsx](../../web/src/App.tsx) — the **Targets** top-nav view.

## Notes / caveats

- The chart is plain SVG (not lightweight-charts, which is time-axis based) so
  the X-axis can be a true percentage scale. Coordinate math lives in
  `priceTargets.ts` and is unit-tested directly.
- Resolving a ticker does **not** change the Analyse view's active symbol; it
  only reads a last price.
- Capital-to-average-down math (Feature Set 2) builds on these tiers and is a
  planned follow-up.
