import { describe, it, expect } from 'vitest';
import {
  CHART_COUNTS,
  MAX_CHARTS,
  gridShape,
  isChartCount,
  responsiveColumns,
} from '../gridLayout';

describe('gridShape', () => {
  it('maps each chart count to the canonical layout', () => {
    expect(gridShape(1)).toEqual({ cols: 1, rows: 1 });
    expect(gridShape(2)).toEqual({ cols: 2, rows: 1 });
    expect(gridShape(4)).toEqual({ cols: 2, rows: 2 });
    expect(gridShape(6)).toEqual({ cols: 3, rows: 2 });
    expect(gridShape(8)).toEqual({ cols: 4, rows: 2 });
  });

  it('covers every allowed count with enough cells', () => {
    for (const count of CHART_COUNTS) {
      const { cols, rows } = gridShape(count);
      expect(cols * rows).toBeGreaterThanOrEqual(count);
    }
  });

  it('falls back to a near-square layout for unknown counts', () => {
    const { cols, rows } = gridShape(5);
    expect(cols * rows).toBeGreaterThanOrEqual(5);
    expect(cols).toBeGreaterThanOrEqual(1);
  });

  it('never exceeds the documented maximum of 8', () => {
    expect(MAX_CHARTS).toBe(8);
    expect(Math.max(...CHART_COUNTS)).toBe(8);
  });
});

describe('responsiveColumns', () => {
  it('stacks to a single column on phones', () => {
    expect(responsiveColumns(4, 500)).toBe(1);
  });

  it('caps at two columns on tablets', () => {
    expect(responsiveColumns(4, 800)).toBe(2);
    expect(responsiveColumns(1, 800)).toBe(1);
  });

  it('uses the ideal columns on desktops', () => {
    expect(responsiveColumns(4, 1440)).toBe(4);
    expect(responsiveColumns(3, 1440)).toBe(3);
  });
});

describe('isChartCount', () => {
  it('accepts allowed counts and rejects others', () => {
    expect(isChartCount(4)).toBe(true);
    expect(isChartCount(8)).toBe(true);
    expect(isChartCount(3)).toBe(false);
    expect(isChartCount('4')).toBe(false);
    expect(isChartCount(undefined)).toBe(false);
  });
});
