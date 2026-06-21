/**
 * Responsive grid geometry for the live multi-chart dashboard.
 *
 * Maps a chart count to the "cleanest" rectangular arrangement and exposes the
 * concrete column/row counts the grid renders with. Kept pure (no DOM) so it is
 * trivially unit-testable.
 */

/** Selectable chart counts (the maximum is 8). */
export const CHART_COUNTS = [1, 2, 4, 6, 8] as const;

/** One of the allowed chart counts. */
export type ChartCount = (typeof CHART_COUNTS)[number];

/** Hard upper bound on simultaneously rendered charts. */
export const MAX_CHARTS = 8;

/** Concrete grid dimensions. */
export interface GridShape {
  cols: number;
  rows: number;
}

/**
 * Returns the canonical grid shape for a chart count:
 * `1` full-screen, `2` side-by-side, `4` → 2×2, `6` → 3×2, `8` → 4×2.
 *
 * Unknown counts fall back to a near-square layout so the function is total.
 */
export function gridShape(count: number): GridShape {
  switch (count) {
    case 1:
      return { cols: 1, rows: 1 };
    case 2:
      return { cols: 2, rows: 1 };
    case 4:
      return { cols: 2, rows: 2 };
    case 6:
      return { cols: 3, rows: 2 };
    case 8:
      return { cols: 4, rows: 2 };
    default: {
      const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
      const rows = Math.max(1, Math.ceil(count / cols));
      return { cols, rows };
    }
  }
}

/**
 * Collapses the ideal column count to fit a viewport width, so panes never get
 * unusably narrow on small screens. The row count derives from the result.
 */
export function responsiveColumns(idealCols: number, viewportWidth: number): number {
  if (viewportWidth < 640) return 1; // phones: stack
  if (viewportWidth < 1024) return Math.min(idealCols, 2); // tablets: max 2 wide
  return idealCols;
}

/** Whether `value` is one of the allowed chart counts. */
export function isChartCount(value: unknown): value is ChartCount {
  return (
    typeof value === 'number' && (CHART_COUNTS as readonly number[]).includes(value)
  );
}
