import { describe, it, expect } from 'vitest';
import {
  buildPriceTargets,
  targetPrice,
  targetChartGeometry,
  DEFAULT_RANGE,
} from '../priceTargets';

describe('targetPrice', () => {
  it('applies the percentage formula price * (1 + %/100)', () => {
    expect(targetPrice(100, 0)).toBe(100);
    expect(targetPrice(100, 5)).toBeCloseTo(105);
    expect(targetPrice(100, -25)).toBeCloseTo(75);
    expect(targetPrice(100, 500)).toBeCloseTo(600);
    expect(targetPrice(100, -100)).toBeCloseTo(0);
  });
});

describe('buildPriceTargets', () => {
  it('spans -100% to +500% in 5% steps by default (121 inclusive rows)', () => {
    const tiers = buildPriceTargets(100);
    expect(tiers).toHaveLength(121);
    expect(tiers[0]).toEqual({ percent: -100, price: 0 });
    expect(tiers[tiers.length - 1]).toEqual({ percent: 500, price: 600 });
    // 5% increments throughout.
    expect(tiers[1].percent).toBe(-95);
    expect(tiers[20].percent).toBe(0);
    expect(tiers[20].price).toBe(100);
  });

  it('honours custom min/max/step and stays inclusive', () => {
    const tiers = buildPriceTargets(50, { min: -10, max: 10, step: 10 });
    expect(tiers.map((t) => t.percent)).toEqual([-10, 0, 10]);
    expect(tiers[0].price).toBeCloseTo(45);
    expect(tiers[1].price).toBeCloseTo(50);
    expect(tiers[2].price).toBeCloseTo(55);
  });

  it('keeps percent labels clean (no float drift)', () => {
    const tiers = buildPriceTargets(100, { min: -100, max: 0, step: 5 });
    for (const t of tiers) {
      expect(Number.isInteger(t.percent)).toBe(true);
    }
  });

  it('returns an empty ladder for invalid base price or range', () => {
    expect(buildPriceTargets(0)).toEqual([]);
    expect(buildPriceTargets(-5)).toEqual([]);
    expect(buildPriceTargets(NaN)).toEqual([]);
    expect(buildPriceTargets(100, { step: 0 })).toEqual([]);
    expect(buildPriceTargets(100, { min: 10, max: -10 })).toEqual([]);
  });

  it('exposes the documented default range', () => {
    expect(DEFAULT_RANGE).toEqual({ min: -100, max: 500, step: 5 });
  });
});

describe('targetChartGeometry', () => {
  const tiers = buildPriceTargets(100);

  it('returns null for degenerate inputs', () => {
    expect(targetChartGeometry([], { width: 400, height: 300 })).toBeNull();
    expect(
      targetChartGeometry(tiers, { width: 0, height: 300 }),
    ).toBeNull();
    // Padding larger than the box leaves no plot area.
    expect(
      targetChartGeometry(tiers, {
        width: 10,
        height: 10,
        padding: { left: 100, right: 100, top: 100, bottom: 100 },
      }),
    ).toBeNull();
  });

  it('maps the first/last points to the plot corners (x increasing)', () => {
    const geo = targetChartGeometry(tiers, { width: 400, height: 300 })!;
    expect(geo).not.toBeNull();
    expect(geo.points).toHaveLength(tiers.length);
    const first = geo.points[0];
    const last = geo.points[geo.points.length - 1];
    // Lowest percent at the left edge, highest at the right edge.
    expect(first.x).toBeCloseTo(geo.plot.x0);
    expect(last.x).toBeCloseTo(geo.plot.x1);
    expect(last.x).toBeGreaterThan(first.x);
    // Lowest price (at -100%) sits at the bottom, highest at the top.
    expect(first.y).toBeCloseTo(geo.plot.y1);
    expect(last.y).toBeCloseTo(geo.plot.y0);
  });

  it('places the 0% baseline at the base-price height', () => {
    const geo = targetChartGeometry(tiers, { width: 400, height: 300 })!;
    expect(geo.baselineY).not.toBeNull();
    const zero = geo.points.find((p) => p.percent === 0)!;
    expect(geo.baselineY).toBeCloseTo(zero.y);
  });

  it('omits the baseline when 0% is outside the range', () => {
    const positive = buildPriceTargets(100, { min: 10, max: 50, step: 10 });
    const geo = targetChartGeometry(positive, { width: 400, height: 300 })!;
    expect(geo.baselineY).toBeNull();
  });

  it('produces a polyline string aligned with the points', () => {
    const geo = targetChartGeometry(tiers, { width: 400, height: 300 })!;
    const coords = geo.polyline.split(' ');
    expect(coords).toHaveLength(geo.points.length);
    expect(coords[0]).toBe(`${geo.points[0].x},${geo.points[0].y}`);
  });

  it('emits x ticks on the requested percentage step', () => {
    const geo = targetChartGeometry(tiers, {
      width: 400,
      height: 300,
      xTickStep: 100,
    })!;
    expect(geo.xTicks.map((t) => t.value)).toEqual([
      -100, 0, 100, 200, 300, 400, 500,
    ]);
  });
});
