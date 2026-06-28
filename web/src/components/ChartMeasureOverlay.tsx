/**
 * TradingView-style "Measure" overlay shared by every chart.
 *
 * When `active`, the user drags across the chart to measure the move between two
 * points: the box reports the absolute price change, its percentage, the number
 * of bars spanned, and the elapsed time. Anchors are stored in logical/price
 * space and reprojected on pan/zoom/resize so the box tracks the data.
 *
 * Activate it from the chart context menu's **Measure** item or directly with
 * **Shift + right-click**. Press `Escape` (or right-click) to dismiss.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Coordinate,
  IChartApi,
  ISeriesApi,
  Logical,
  SeriesType,
} from 'lightweight-charts';
import type { Candle } from '../types';

const UP = '#26a69a';
const DOWN = '#ef5350';

interface MeasurePoint {
  logical: number;
  price: number;
}

interface Props {
  chart: IChartApi | null;
  series: ISeriesApi<SeriesType> | null;
  /** Candles backing the chart, used to count bars and span time. */
  candles: Candle[];
  /** Whether the measure tool is armed and capturing pointer input. */
  active: boolean;
  /** Called when the user dismisses the tool (Escape / right-click). */
  onComplete?: () => void;
}

/** Formats a span of seconds as a compact `1d 2h` / `3h 4m` / `5m` string. */
function formatDuration(seconds: number): string {
  const s = Math.abs(Math.floor(seconds));
  if (s <= 0) return '';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/** Elapsed time between two logical indices, derived from candle timestamps. */
function durationBetween(candles: Candle[], la: number, lb: number): string {
  const ia = Math.round(Math.min(la, lb));
  const ib = Math.round(Math.max(la, lb));
  const a = candles[ia];
  const b = candles[ib];
  if (!a || !b) return '';
  return formatDuration(b.time - a.time);
}

/** The computed stats + display labels for a measurement between two points. */
export interface MeasurementInfo {
  priceDelta: number;
  pct: number;
  bars: number;
  up: boolean;
  line1: string;
  line2: string;
}

/**
 * Pure measurement math: price change, percent, bar count and elapsed time
 * between two logical/price anchors. Exported for direct unit testing.
 */
export function measurementInfo(
  start: MeasurePoint,
  end: MeasurePoint,
  candles: Candle[],
): MeasurementInfo {
  const priceDelta = end.price - start.price;
  const pct = start.price ? (priceDelta / start.price) * 100 : 0;
  const bars = Math.abs(Math.round(end.logical) - Math.round(start.logical));
  const up = priceDelta >= 0;
  const sign = up ? '+' : '';
  const timeStr = durationBetween(candles, start.logical, end.logical);
  return {
    priceDelta,
    pct,
    bars,
    up,
    line1: `${sign}${priceDelta.toFixed(2)} (${sign}${pct.toFixed(2)}%)`,
    line2: `${bars} bar${bars === 1 ? '' : 's'}${timeStr ? ` · ${timeStr}` : ''}`,
  };
}

export function ChartMeasureOverlay({ chart, series, candles, active, onComplete }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [start, setStart] = useState<MeasurePoint | null>(null);
  const [end, setEnd] = useState<MeasurePoint | null>(null);
  const [dragging, setDragging] = useState(false);
  // Bumped on pan/zoom/resize so stored anchors reproject to fresh pixels.
  const [tick, setTick] = useState(0);

  // Reproject when the visible range changes (pan/zoom).
  useEffect(() => {
    if (!chart) return;
    const ts = chart.timeScale();
    const bump = () => setTick((t) => t + 1);
    ts.subscribeVisibleLogicalRangeChange(bump);
    return () => ts.unsubscribeVisibleLogicalRangeChange(bump);
  }, [chart]);

  // Reproject on resize.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTick((t) => t + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Clear any in-progress measurement when the tool is disarmed.
  useEffect(() => {
    if (!active) {
      setStart(null);
      setEnd(null);
      setDragging(false);
    }
  }, [active]);

  // Escape dismisses the tool.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setStart(null);
        setEnd(null);
        onComplete?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onComplete]);

  function pointFromEvent(e: React.PointerEvent): MeasurePoint | null {
    const el = svgRef.current;
    if (!chart || !series || !el) return null;
    const rect = el.getBoundingClientRect();
    const logical = chart.timeScale().coordinateToLogical((e.clientX - rect.left) as Coordinate);
    const price = series.coordinateToPrice(e.clientY - rect.top);
    if (logical == null || price == null) return null;
    return { logical: logical as number, price };
  }

  function project(p: MeasurePoint): { x: number; y: number } | null {
    if (!chart || !series) return null;
    const x = chart.timeScale().logicalToCoordinate(p.logical as Logical);
    const y = series.priceToCoordinate(p.price);
    if (x == null || y == null) return null;
    return { x: x as number, y: y as number };
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (!active) return;
    const p = pointFromEvent(e);
    if (!p) return;
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      // jsdom / unsupported — ignore.
    }
    setStart(p);
    setEnd(p);
    setDragging(true);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!active || !dragging) return;
    const p = pointFromEvent(e);
    if (p) setEnd(p);
  }

  function handlePointerUp() {
    if (!active) return;
    setDragging(false);
  }

  function handleContextMenu(e: React.MouseEvent) {
    if (!active) return;
    e.preventDefault();
    e.stopPropagation();
    setStart(null);
    setEnd(null);
    onComplete?.();
  }

  const measurement = useMemo(() => {
    void tick; // recompute projections on pan/zoom/resize
    if (!start || !end) return null;
    const a = project(start);
    const b = project(end);
    if (!a || !b) return null;

    const info = measurementInfo(start, end, candles);
    const color = info.up ? UP : DOWN;

    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);

    const { line1, line2 } = info;

    const labelW = Math.max(line1.length, line2.length) * 6.7 + 16;
    const labelH = 32;
    const midX = (a.x + b.x) / 2;
    const width = svgRef.current?.clientWidth ?? 0;
    let lx = midX - labelW / 2;
    if (width > labelW) lx = Math.max(2, Math.min(lx, width - labelW - 2));
    else lx = Math.max(2, lx);
    let ly = y - labelH - 6;
    if (ly < 2) ly = Math.max(a.y, b.y) + 6;

    return (
      <g>
        <rect x={x} y={y} width={w} height={h} fill={`${color}1f`} stroke={color} strokeWidth={1} />
        <line x1={midX} y1={a.y} x2={midX} y2={b.y} stroke={color} strokeWidth={1} strokeDasharray="3 3" />
        <g>
          <rect x={lx} y={ly} width={labelW} height={labelH} rx={4} fill="#0b0f17" stroke={color} strokeWidth={1} opacity={0.96} />
          <text x={lx + 8} y={ly + 14} fill={color} fontSize={11} fontFamily="ui-monospace, monospace" fontWeight={600}>
            {line1}
          </text>
          <text x={lx + 8} y={ly + 26} fill="#cbd5e1" fontSize={10} fontFamily="ui-monospace, monospace">
            {line2}
          </text>
        </g>
      </g>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end, candles, tick]);

  return (
    <svg
      ref={svgRef}
      data-testid="chart-measure"
      data-active={active ? 'true' : 'false'}
      className="absolute inset-0 h-full w-full"
      style={{
        pointerEvents: active ? 'auto' : 'none',
        cursor: active ? 'crosshair' : 'default',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onContextMenu={handleContextMenu}
    >
      {measurement}
    </svg>
  );
}
