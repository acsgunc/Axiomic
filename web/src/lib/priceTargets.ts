/**
 * Pure helpers for the Price Targets tool: build a ladder of percentage-based
 * price targets from a base price and compute the SVG geometry for the
 * percentage-vs-price line chart.
 *
 * Kept free of React/DOM so the numeric math is unit-testable in isolation
 * (jsdom does not give reliable layout, so coordinate math lives here, not in
 * pointer-event tests).
 */

/** A single price target: a percentage move and the resulting price. */
export interface PriceTier {
  /** Percentage change from the base price (e.g. -25, 0, 5, 500). */
  percent: number;
  /** The target price: `base * (1 + percent / 100)`. */
  price: number;
}

/** Inclusive range + step for the target ladder (defaults match the spec). */
export interface TargetRangeOptions {
  /** Lowest percentage change. Default -100. */
  min?: number;
  /** Highest percentage change. Default 500. */
  max?: number;
  /** Increment between rows. Default 5. */
  step?: number;
}

export const DEFAULT_RANGE: Required<TargetRangeOptions> = {
  min: -100,
  max: 500,
  step: 5,
};

/** Target price for a single percentage move: `base * (1 + percent / 100)`. */
export function targetPrice(basePrice: number, percent: number): number {
  return basePrice * (1 + percent / 100);
}

/**
 * Builds the inclusive ladder of price targets from `min` to `max` in `step`
 * increments. Returns an empty array for an invalid base price or range so
 * callers can render an empty state instead of crashing.
 */
export function buildPriceTargets(
  basePrice: number,
  opts: TargetRangeOptions = {},
): PriceTier[] {
  const { min, max, step } = { ...DEFAULT_RANGE, ...opts };
  if (!Number.isFinite(basePrice) || basePrice <= 0) return [];
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return [];
  if (!Number.isFinite(step) || step <= 0) return [];

  const count = Math.round((max - min) / step);
  const tiers: PriceTier[] = [];
  for (let i = 0; i <= count; i++) {
    // Re-derive the percent from min + i*step and round to kill float drift
    // (e.g. -85.00000000000001) so labels and keys stay clean.
    const percent = Math.round((min + i * step) * 1e6) / 1e6;
    tiers.push({ percent, price: targetPrice(basePrice, percent) });
  }
  return tiers;
}

/** A laid-out point on the chart in SVG pixel coordinates. */
export interface ChartPoint {
  x: number;
  y: number;
  percent: number;
  price: number;
}

/** Axis tick with its pixel position and the value it labels. */
export interface AxisTick<T extends 'percent' | 'price'> {
  pos: number;
  value: number;
  kind: T;
}

/** Fully resolved geometry for the percentage-vs-price line chart. */
export interface ChartGeometry {
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
  /** Plot-area bounds (inside the padding). */
  plot: { x0: number; y0: number; x1: number; y1: number };
  points: ChartPoint[];
  /** `points` joined as an SVG polyline `points` attribute. */
  polyline: string;
  /** Y pixel of the 0% (base price) reference line, or null if 0% is off-range. */
  baselineY: number | null;
  xTicks: AxisTick<'percent'>[];
  yTicks: AxisTick<'price'>[];
}

export interface ChartGeometryOptions {
  width: number;
  height: number;
  padding?: Partial<ChartGeometry['padding']>;
  /** X gridline spacing in percent. Default 100. */
  xTickStep?: number;
  /** Approximate number of Y (price) gridlines. Default 6. */
  yTickCount?: number;
}

const DEFAULT_PADDING = { top: 16, right: 16, bottom: 36, left: 64 };

/**
 * Maps a ladder of price tiers to SVG pixel geometry for a line chart with the
 * X-axis as percentage change and the Y-axis as target price. Returns `null`
 * when there is nothing meaningful to draw (fewer than two points or a
 * degenerate range), so the component can show an empty state.
 */
export function targetChartGeometry(
  tiers: PriceTier[],
  opts: ChartGeometryOptions,
): ChartGeometry | null {
  if (tiers.length < 2) return null;
  const width = opts.width;
  const height = opts.height;
  if (!(width > 0) || !(height > 0)) return null;

  const padding = { ...DEFAULT_PADDING, ...opts.padding };
  const x0 = padding.left;
  const x1 = width - padding.right;
  const y0 = padding.top;
  const y1 = height - padding.bottom;
  if (x1 <= x0 || y1 <= y0) return null;

  const percents = tiers.map((t) => t.percent);
  const prices = tiers.map((t) => t.price);
  const minPct = Math.min(...percents);
  const maxPct = Math.max(...percents);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const pctSpan = maxPct - minPct || 1;
  const priceSpan = maxPrice - minPrice || 1;

  const xOf = (pct: number) => x0 + ((pct - minPct) / pctSpan) * (x1 - x0);
  const yOf = (price: number) => y1 - ((price - minPrice) / priceSpan) * (y1 - y0);

  const points: ChartPoint[] = tiers.map((t) => ({
    x: xOf(t.percent),
    y: yOf(t.price),
    percent: t.percent,
    price: t.price,
  }));
  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ');

  const baselineY = minPct <= 0 && maxPct >= 0 ? yOf(targetPrice0(tiers)) : null;

  const xTickStep = opts.xTickStep ?? 100;
  const xTicks: AxisTick<'percent'>[] = [];
  // Walk multiples of xTickStep that fall within [minPct, maxPct].
  const firstTick = Math.ceil(minPct / xTickStep) * xTickStep;
  for (let pct = firstTick; pct <= maxPct + 1e-9; pct += xTickStep) {
    const rounded = Math.round(pct * 1e6) / 1e6;
    xTicks.push({ pos: xOf(rounded), value: rounded, kind: 'percent' });
  }

  const yTickCount = Math.max(2, opts.yTickCount ?? 6);
  const yTicks: AxisTick<'price'>[] = [];
  for (let i = 0; i < yTickCount; i++) {
    const price = minPrice + (priceSpan * i) / (yTickCount - 1);
    yTicks.push({ pos: yOf(price), value: price, kind: 'price' });
  }

  return {
    width,
    height,
    padding,
    plot: { x0, y0, x1, y1 },
    points,
    polyline,
    baselineY,
    xTicks,
    yTicks,
  };
}

/** Base price = the price at 0%; derive from the ladder so it stays consistent. */
function targetPrice0(tiers: PriceTier[]): number {
  const zero = tiers.find((t) => t.percent === 0);
  if (zero) return zero.price;
  // Fall back to deriving the base from any tier: base = price / (1 + pct/100).
  const t = tiers[0];
  return t.price / (1 + t.percent / 100);
}
