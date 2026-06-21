/**
 * Shared types and helpers for the TradingView-style chart surface.
 *
 * All price math (including Heikin-Ashi) is delegated to the Rust/WASM core via
 * `engine.ts`; this module only holds presentation types and small DOM helpers.
 */

import type { IChartApi } from 'lightweight-charts';

/** Selectable price-series render styles, mirroring TradingView. */
export type ChartType = 'candles' | 'bars' | 'line' | 'area' | 'heikin-ashi';

/** Right price-scale mapping mode. */
export type ScaleMode = 'normal' | 'log' | 'percent';

/** Active pointer drawing tool. `none` lets the chart pan/zoom normally. */
export type DrawTool = 'none' | 'trend' | 'hline';

/** A free-form trend line anchored to logical (x) + price (y) coordinates. */
export interface TrendDrawing {
  id: string;
  type: 'trend';
  p1: { logical: number; price: number };
  p2: { logical: number; price: number };
}

/** A full-width horizontal line at a fixed price. */
export interface HLineDrawing {
  id: string;
  type: 'hline';
  price: number;
}

export type Drawing = TrendDrawing | HLineDrawing;

export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  candles: 'Candles',
  bars: 'Bars',
  line: 'Line',
  area: 'Area',
  'heikin-ashi': 'Heikin-Ashi',
};

/** Whether a chart type renders OHLC bars (vs. a single close-based line). */
export function isOhlcType(type: ChartType): boolean {
  return type === 'candles' || type === 'bars' || type === 'heikin-ashi';
}

let drawingSeq = 0;
/** Monotonic id generator for drawings (stable within a session). */
export function nextDrawingId(prefix: string): string {
  drawingSeq += 1;
  return `${prefix}-${drawingSeq}`;
}

/**
 * Stacks the screenshots of the provided charts vertically into a single PNG
 * and triggers a browser download. Sub-panes (RSI/MACD) are included; the SVG
 * drawing overlay is not part of the canvas screenshot.
 */
export function downloadChartsScreenshot(
  charts: Array<IChartApi | null>,
  fileName: string,
): void {
  const canvases = charts
    .filter((c): c is IChartApi => c != null)
    .map((c) => c.takeScreenshot());
  if (!canvases.length) return;

  const width = Math.max(...canvases.map((c) => c.width));
  const height = canvases.reduce((sum, c) => sum + c.height, 0);
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#0b0f17';
  ctx.fillRect(0, 0, width, height);

  let y = 0;
  for (const cv of canvases) {
    ctx.drawImage(cv, 0, y);
    y += cv.height;
  }

  const link = document.createElement('a');
  link.href = out.toDataURL('image/png');
  link.download = fileName;
  link.click();
}
