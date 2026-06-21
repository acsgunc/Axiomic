import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  PriceScaleMode,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type HistogramData,
  type CandlestickData,
  type BarData,
  type Logical,
  type MouseEventParams,
  type SeriesType,
  type UTCTimestamp,
} from 'lightweight-charts';
import { engine } from '../engine';
import type { Candle, IndicatorConfig, Series } from '../types';
import { ChartToolbar } from './ChartToolbar';
import {
  downloadChartsScreenshot,
  isOhlcType,
  nextDrawingId,
  type ChartType,
  type Drawing,
  type DrawTool,
  type ScaleMode,
} from '../lib/chart';
import { type TimeframeId } from '../lib/timeframe';

interface Props {
  candles: Candle[];
  indicators: IndicatorConfig[];
  symbol?: string;
  /** Active zoom/lookback preset; sets the initial visible window. */
  timeframe?: TimeframeId;
}

const CHART_BG = '#0b0f17';
const GRID = '#1a2233';
const UP = '#26a69a';
const DOWN = '#ef5350';

/** Maps a WASM Series to lightweight-charts LineData, skipping null points. */
function toLineData(series: Series): LineData[] {
  const out: LineData[] = [];
  for (let i = 0; i < series.time.length; i++) {
    const v = series.values[i];
    if (v != null) out.push({ time: series.time[i] as UTCTimestamp, value: v });
  }
  return out;
}

/** Metadata kept per indicator overlay so the legend can read live values. */
interface OverlayMeta {
  series: ISeriesApi<'Line'>;
  label: string;
  color: string;
}

interface LegendState {
  o: number;
  h: number;
  l: number;
  c: number;
  changePct: number;
  inds: { label: string; color: string; value: number }[];
}

const SCALE_MODE_MAP: Record<ScaleMode, PriceScaleMode> = {
  normal: PriceScaleMode.Normal,
  log: PriceScaleMode.Logarithmic,
  percent: PriceScaleMode.Percentage,
};

const baseLayout = {
  layout: {
    background: { type: ColorType.Solid, color: CHART_BG },
    textColor: '#94a3b8',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  },
  grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
  rightPriceScale: { borderColor: GRID },
} as const;

/**
 * Interactive, TradingView-style chart. Supports multiple price-series types
 * (candles / bars / line / area / Heikin-Ashi), a volume histogram, WASM
 * indicator overlays, RSI & MACD sub-panes, a crosshair-following legend, a
 * drawing layer (trend & horizontal lines), price-scale modes, and PNG export.
 * All price math (including Heikin-Ashi) is delegated to the Rust core.
 */
export function CandleChart({ candles, indicators, symbol = '', timeframe = 'ALL' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<SVGSVGElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const macdContainerRef = useRef<HTMLDivElement>(null);

  const chartRef = useRef<IChartApi | null>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  const macdChartRef = useRef<IChartApi | null>(null);

  const priceSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const priceSeriesTypeRef = useRef<ChartType | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const overlayRefs = useRef<ISeriesApi<'Line'>[]>([]);
  const overlayMetaRef = useRef<OverlayMeta[]>([]);
  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const macdSeriesRef = useRef<{
    macd: ISeriesApi<'Line'>;
    signal: ISeriesApi<'Line'>;
    hist: ISeriesApi<'Histogram'>;
  } | null>(null);
  const candleMapRef = useRef<Map<number, Candle>>(new Map());

  // Toolbar / view state.
  const [chartType, setChartType] = useState<ChartType>('candles');
  const [scaleMode, setScaleMode] = useState<ScaleMode>('normal');
  const [showVolume, setShowVolume] = useState(true);
  const [crosshair, setCrosshair] = useState(true);
  const [drawTool, setDrawTool] = useState<DrawTool>('none');
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [pending, setPending] = useState<{ logical: number; price: number } | null>(null);
  const [cursorPt, setCursorPt] = useState<{ logical: number; price: number } | null>(null);

  const [displayCandles, setDisplayCandles] = useState<Candle[]>(candles);
  const [legend, setLegend] = useState<LegendState | null>(null);
  const [overlayError, setOverlayError] = useState<string | null>(null);
  const [renderTick, setRenderTick] = useState(0);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const showRsi = useMemo(
    () => indicators.some((i) => i.kind === 'rsi' && i.enabled),
    [indicators],
  );
  const showMacd = useMemo(
    () => indicators.some((i) => i.kind === 'macd' && i.enabled),
    [indicators],
  );

  // Resolve display candles (Heikin-Ashi is computed in the Rust core).
  useEffect(() => {
    let cancelled = false;
    if (chartType === 'heikin-ashi') {
      engine
        .heikinAshi(candles)
        .then((ha) => !cancelled && setDisplayCandles(ha))
        .catch(() => !cancelled && setDisplayCandles(candles));
    } else {
      setDisplayCandles(candles);
    }
    return () => {
      cancelled = true;
    };
  }, [candles, chartType]);

  // Create the main chart once, wiring crosshair legend + redraw subscriptions.
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      ...baseLayout,
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: {
        borderColor: GRID,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        barSpacing: 8,
        // Allow a long window (e.g. a full year) to compress into a narrow pane.
        minBarSpacing: 0.05,
      },
      handleScroll: true,
      handleScale: true,
      autoSize: true,
    });
    chartRef.current = chart;

    const bump = () => setRenderTick((t) => t + 1);
    chart.timeScale().subscribeVisibleLogicalRangeChange(bump);

    chart.subscribeCrosshairMove((param: MouseEventParams) => {
      if (param.time == null) {
        setLegend(null);
        return;
      }
      const candle = candleMapRef.current.get(param.time as number);
      if (!candle) {
        setLegend(null);
        return;
      }
      const inds: LegendState['inds'] = [];
      for (const m of overlayMetaRef.current) {
        const d = param.seriesData.get(m.series) as { value?: number } | undefined;
        if (d?.value != null) inds.push({ label: m.label, color: m.color, value: d.value });
      }
      setLegend({
        o: candle.open,
        h: candle.high,
        l: candle.low,
        c: candle.close,
        changePct: candle.open ? ((candle.close - candle.open) / candle.open) * 100 : 0,
        inds,
      });
    });

    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ w: r.width, h: r.height });
      setRenderTick((t) => t + 1);
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      priceSeriesRef.current = null;
      priceSeriesTypeRef.current = null;
      volumeSeriesRef.current = null;
      overlayRefs.current = [];
      overlayMetaRef.current = [];
    };
  }, []);

  // (Re)build the price series when the chart type changes, then feed data.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (priceSeriesTypeRef.current !== chartType) {
      if (priceSeriesRef.current) chart.removeSeries(priceSeriesRef.current);
      priceSeriesRef.current = createPriceSeries(chart, chartType);
      priceSeriesTypeRef.current = chartType;
    }
    const series = priceSeriesRef.current;
    if (!series) return;

    candleMapRef.current = new Map(displayCandles.map((c) => [c.time, c]));

    if (isOhlcType(chartType)) {
      const data: (CandlestickData | BarData)[] = displayCandles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      series.setData(data as CandlestickData[]);
    } else {
      const data: LineData[] = displayCandles.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.close,
      }));
      series.setData(data);
    }
    setRenderTick((t) => t + 1);
  }, [chartType, displayCandles]);

  // Fit the full (aggregated) history to view whenever the data or the selected
  // timeframe interval changes, so every bar is visible end-to-end by default.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || displayCandles.length === 0) return;
    chart.timeScale().fitContent();
    setRenderTick((t) => t + 1);
  }, [timeframe, displayCandles]);

  // Volume histogram pane (bottom overlay on the main chart).
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (showVolume) {
      if (!volumeSeriesRef.current) {
        const vol = chart.addHistogramSeries({
          priceFormat: { type: 'volume' },
          priceScaleId: 'volume',
        });
        chart.priceScale('volume').applyOptions({
          scaleMargins: { top: 0.82, bottom: 0 },
        });
        volumeSeriesRef.current = vol;
      }
      const data: HistogramData[] = displayCandles.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? `${UP}66` : `${DOWN}66`,
      }));
      volumeSeriesRef.current.setData(data);
    } else if (volumeSeriesRef.current) {
      chart.removeSeries(volumeSeriesRef.current);
      volumeSeriesRef.current = null;
    }
  }, [showVolume, displayCandles]);

  // Price-scale mode (linear / log / percent).
  useEffect(() => {
    chartRef.current?.priceScale('right').applyOptions({ mode: SCALE_MODE_MAP[scaleMode] });
  }, [scaleMode]);

  // Crosshair visibility toggle.
  useEffect(() => {
    chartRef.current?.applyOptions({
      crosshair: {
        vertLine: { visible: crosshair, labelVisible: crosshair },
        horzLine: { visible: crosshair, labelVisible: crosshair },
      },
    });
  }, [crosshair]);

  // RSI sub-pane lifecycle.
  useEffect(() => {
    if (showRsi && rsiContainerRef.current && !rsiChartRef.current) {
      const chart = createChart(rsiContainerRef.current, {
        ...baseLayout,
        timeScale: { borderColor: GRID, timeVisible: false, visible: false },
        autoSize: true,
      });
      const series = chart.addLineSeries({ color: '#22d3ee', lineWidth: 1 });
      series.createPriceLine({ price: 70, color: DOWN, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '70' });
      series.createPriceLine({ price: 30, color: UP, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '30' });
      rsiChartRef.current = chart;
      rsiSeriesRef.current = series;
    }
    if (!showRsi && rsiChartRef.current) {
      rsiChartRef.current.remove();
      rsiChartRef.current = null;
      rsiSeriesRef.current = null;
    }
  }, [showRsi]);

  // MACD sub-pane lifecycle.
  useEffect(() => {
    if (showMacd && macdContainerRef.current && !macdChartRef.current) {
      const chart = createChart(macdContainerRef.current, {
        ...baseLayout,
        timeScale: { borderColor: GRID, timeVisible: false, visible: false },
        autoSize: true,
      });
      const hist = chart.addHistogramSeries({ priceLineVisible: false });
      const macdLine = chart.addLineSeries({ color: '#3b82f6', lineWidth: 1, priceLineVisible: false });
      const signal = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, priceLineVisible: false });
      macdChartRef.current = chart;
      macdSeriesRef.current = { macd: macdLine, signal, hist };
    }
    if (!showMacd && macdChartRef.current) {
      macdChartRef.current.remove();
      macdChartRef.current = null;
      macdSeriesRef.current = null;
    }
  }, [showMacd]);

  // Keep all panes time-synced (TradingView-style linked panes).
  useEffect(() => {
    const charts = [chartRef.current, rsiChartRef.current, macdChartRef.current].filter(
      (c): c is IChartApi => c != null,
    );
    if (charts.length < 2) return;
    let syncing = false;
    const handlers: Array<[IChartApi, (r: unknown) => void]> = [];
    for (const src of charts) {
      const h = (range: unknown) => {
        if (syncing || !range) return;
        syncing = true;
        for (const t of charts) {
          if (t !== src) t.timeScale().setVisibleLogicalRange(range as never);
        }
        syncing = false;
      };
      src.timeScale().subscribeVisibleLogicalRangeChange(h);
      handlers.push([src, h]);
    }
    return () => {
      for (const [c, h] of handlers) c.timeScale().unsubscribeVisibleLogicalRangeChange(h);
    };
  }, [showRsi, showMacd]);

  // Compute & render indicator overlays + sub-pane series (math in Rust).
  useEffect(() => {
    let cancelled = false;
    const chart = chartRef.current;
    if (!chart || candles.length === 0) return;

    overlayRefs.current.forEach((s) => chart.removeSeries(s));
    overlayRefs.current = [];
    overlayMetaRef.current = [];

    (async () => {
      try {
        setOverlayError(null);
        for (const ind of indicators) {
          if (!ind.enabled) continue;
          if (ind.kind === 'sma' || ind.kind === 'ema') {
            const series =
              ind.kind === 'sma'
                ? await engine.sma(candles, ind.period)
                : await engine.ema(candles, ind.period);
            if (cancelled) return;
            const line = chart.addLineSeries({ color: ind.color, lineWidth: 2, priceLineVisible: false });
            line.setData(toLineData(series));
            overlayRefs.current.push(line);
            overlayMetaRef.current.push({
              series: line,
              label: `${ind.kind.toUpperCase()} ${ind.period}`,
              color: ind.color,
            });
          } else if (ind.kind === 'bollinger') {
            const b = await engine.bollinger(candles, ind.period, 2);
            if (cancelled) return;
            const bands: [Series, string][] = [
              [b.upper, 'BB Upper'],
              [b.middle, 'BB Mid'],
              [b.lower, 'BB Lower'],
            ];
            for (const [band, label] of bands) {
              const line = chart.addLineSeries({ color: ind.color, lineWidth: 1, lineStyle: LineStyle.Dotted, priceLineVisible: false });
              line.setData(toLineData(band));
              overlayRefs.current.push(line);
              overlayMetaRef.current.push({ series: line, label, color: ind.color });
            }
          }
        }

        // RSI sub-pane.
        const rsiInd = indicators.find((i) => i.kind === 'rsi' && i.enabled);
        if (rsiInd && rsiSeriesRef.current) {
          const rsi = await engine.rsi(candles, rsiInd.period);
          if (cancelled) return;
          rsiSeriesRef.current.setData(toLineData(rsi));
        }

        // MACD sub-pane.
        const macdInd = indicators.find((i) => i.kind === 'macd' && i.enabled);
        if (macdInd && macdSeriesRef.current) {
          const m = await engine.macd(candles, 12, 26, 9);
          if (cancelled) return;
          macdSeriesRef.current.macd.setData(toLineData(m.macd));
          macdSeriesRef.current.signal.setData(toLineData(m.signal));
          const hist: HistogramData[] = [];
          for (let i = 0; i < m.histogram.time.length; i++) {
            const v = m.histogram.values[i];
            if (v != null)
              hist.push({
                time: m.histogram.time[i] as UTCTimestamp,
                value: v,
                color: v >= 0 ? `${UP}aa` : `${DOWN}aa`,
              });
          }
          macdSeriesRef.current.hist.setData(hist);
        }
      } catch (err) {
        if (!cancelled)
          setOverlayError(err instanceof Error ? err.message : 'Failed to compute indicators.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [candles, indicators, showRsi, showMacd]);

  // --- Drawing layer -------------------------------------------------------

  function pointFromEvent(e: React.PointerEvent): { logical: number; price: number } | null {
    const chart = chartRef.current;
    const series = priceSeriesRef.current;
    const el = overlayRef.current;
    if (!chart || !series || !el) return null;
    const rect = el.getBoundingClientRect();
    const logical = chart.timeScale().coordinateToLogical(e.clientX - rect.left);
    const price = series.coordinateToPrice(e.clientY - rect.top);
    if (logical == null || price == null) return null;
    return { logical: logical as number, price };
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (drawTool === 'none') return;
    const p = pointFromEvent(e);
    if (!p) return;
    if (drawTool === 'hline') {
      setDrawings((d) => [...d, { id: nextDrawingId('h'), type: 'hline', price: p.price }]);
    } else if (drawTool === 'trend') {
      if (!pending) {
        setPending(p);
      } else {
        setDrawings((d) => [...d, { id: nextDrawingId('t'), type: 'trend', p1: pending, p2: p }]);
        setPending(null);
        setCursorPt(null);
      }
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (drawTool === 'trend' && pending) setCursorPt(pointFromEvent(e));
  }

  function removeDrawing(id: string) {
    setDrawings((d) => d.filter((x) => x.id !== id));
  }

  function project(p: { logical: number; price: number }): { x: number; y: number } | null {
    const chart = chartRef.current;
    const series = priceSeriesRef.current;
    if (!chart || !series) return null;
    const x = chart.timeScale().logicalToCoordinate(p.logical as Logical);
    const y = series.priceToCoordinate(p.price);
    if (x == null || y == null) return null;
    return { x, y };
  }

  function priceY(price: number): number | null {
    const y = priceSeriesRef.current?.priceToCoordinate(price);
    return y == null ? null : y;
  }

  // Recompute projected drawing geometry on pan/zoom/resize/data changes.
  const renderedDrawings = useMemo(() => {
    void renderTick;
    void displayCandles;
    const lines: React.ReactNode[] = [];
    for (const d of drawings) {
      if (d.type === 'hline') {
        const y = priceY(d.price);
        if (y == null) continue;
        lines.push(
          <g key={d.id}>
            <line x1={0} y1={y} x2={size.w} y2={y} stroke="#e2e8f0" strokeWidth={1} strokeDasharray="4 3" />
            <line
              x1={0}
              y1={y}
              x2={size.w}
              y2={y}
              stroke="transparent"
              strokeWidth={8}
              style={{ pointerEvents: drawTool === 'none' ? 'stroke' : 'none', cursor: 'pointer' }}
              onClick={() => removeDrawing(d.id)}
            >
              <title>Click to remove</title>
            </line>
          </g>,
        );
      } else {
        const a = project(d.p1);
        const b = project(d.p2);
        if (!a || !b) continue;
        lines.push(
          <g key={d.id}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fbbf24" strokeWidth={1.5} />
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="transparent"
              strokeWidth={10}
              style={{ pointerEvents: drawTool === 'none' ? 'stroke' : 'none', cursor: 'pointer' }}
              onClick={() => removeDrawing(d.id)}
            >
              <title>Click to remove</title>
            </line>
          </g>,
        );
      }
    }
    // Rubber-band preview while placing a trend line.
    if (drawTool === 'trend' && pending && cursorPt) {
      const a = project(pending);
      const b = project(cursorPt);
      if (a && b)
        lines.push(
          <line key="preview" x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fbbf24" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.7} />,
        );
    }
    return lines;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawings, drawTool, pending, cursorPt, renderTick, size.w, size.h, displayCandles]);

  // --- Toolbar actions -----------------------------------------------------

  /**
   * Zooms the visible time range around its center. `factor < 1` zooms in
   * (fewer bars), `factor > 1` zooms out (more bars). Mirrors TradingView's
   * +/- zoom buttons.
   */
  function zoom(factor: number) {
    const ts = chartRef.current?.timeScale();
    if (!ts) return;
    const range = ts.getVisibleLogicalRange();
    if (!range) return;
    const center = (range.from + range.to) / 2;
    const half = ((range.to - range.from) / 2) * factor;
    const minHalf = 1.5; // keep at least ~3 bars visible when fully zoomed in
    const h = Math.max(half, minHalf);
    ts.setVisibleLogicalRange({
      from: (center - h) as Logical,
      to: (center + h) as Logical,
    });
  }
  function handleZoomIn() {
    zoom(0.6);
  }
  function handleZoomOut() {
    zoom(1 / 0.6);
  }
  function handleFit() {
    chartRef.current?.timeScale().fitContent();
  }
  function handleScreenshot() {
    downloadChartsScreenshot(
      [chartRef.current, rsiChartRef.current, macdChartRef.current],
      `${symbol || 'chart'}-${new Date().toISOString().slice(0, 10)}.png`,
    );
  }

  const last = displayCandles[displayCandles.length - 1];
  const view = legend ?? (last ? legendFromCandle(last) : null);

  return (
    <div className="flex h-full flex-col">
      <ChartToolbar
        chartType={chartType}
        onChartType={setChartType}
        scaleMode={scaleMode}
        onScaleMode={setScaleMode}
        showVolume={showVolume}
        onToggleVolume={() => setShowVolume((v) => !v)}
        crosshair={crosshair}
        onToggleCrosshair={() => setCrosshair((v) => !v)}
        drawTool={drawTool}
        onDrawTool={(t) => {
          setDrawTool(t);
          setPending(null);
          setCursorPt(null);
        }}
        hasDrawings={drawings.length > 0}
        onClearDrawings={() => setDrawings([])}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFit={handleFit}
        onScreenshot={handleScreenshot}
      />

      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="h-full w-full" />

        {/* Crosshair-following legend. */}
        {view && (
          <div className="pointer-events-none absolute left-2 top-2 z-10 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 rounded-md bg-base-900/70 px-2 py-1 text-[11px] font-mono backdrop-blur-sm">
            {symbol && <span className="font-sans font-semibold text-slate-200">{symbol}</span>}
            <span className="text-slate-400">O<span className="ml-1 text-slate-200">{view.o.toFixed(2)}</span></span>
            <span className="text-slate-400">H<span className="ml-1 text-slate-200">{view.h.toFixed(2)}</span></span>
            <span className="text-slate-400">L<span className="ml-1 text-slate-200">{view.l.toFixed(2)}</span></span>
            <span className="text-slate-400">C<span className="ml-1 text-slate-200">{view.c.toFixed(2)}</span></span>
            <span className={view.changePct >= 0 ? 'text-accent-up' : 'text-accent-down'}>
              {view.changePct >= 0 ? '+' : ''}
              {view.changePct.toFixed(2)}%
            </span>
            {view.inds.map((i) => (
              <span key={i.label} style={{ color: i.color }}>
                {i.label} {i.value.toFixed(2)}
              </span>
            ))}
          </div>
        )}

        {/* Drawing overlay (SVG). */}
        <svg
          ref={overlayRef}
          className="absolute inset-0 h-full w-full"
          style={{
            pointerEvents: drawTool === 'none' ? 'none' : 'auto',
            cursor: drawTool === 'none' ? 'default' : 'crosshair',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
        >
          {renderedDrawings}
        </svg>
      </div>

      {showRsi && (
        <div className="relative mt-1 h-28 shrink-0">
          <span className="absolute left-2 top-1 z-10 text-[10px] font-semibold uppercase tracking-wide text-slate-500">RSI</span>
          <div ref={rsiContainerRef} className="h-full" />
        </div>
      )}
      {showMacd && (
        <div className="relative mt-1 h-28 shrink-0">
          <span className="absolute left-2 top-1 z-10 text-[10px] font-semibold uppercase tracking-wide text-slate-500">MACD</span>
          <div ref={macdContainerRef} className="h-full" />
        </div>
      )}
      {overlayError && <p className="shrink-0 px-2 text-xs text-accent-down">{overlayError}</p>}
    </div>
  );
}

/** Builds a default legend snapshot from a single candle (no indicator values). */
function legendFromCandle(c: Candle): LegendState {
  return {
    o: c.open,
    h: c.high,
    l: c.low,
    c: c.close,
    changePct: c.open ? ((c.close - c.open) / c.open) * 100 : 0,
    inds: [],
  };
}

/** Creates the main price series for the requested chart type. */
function createPriceSeries(chart: IChartApi, type: ChartType): ISeriesApi<SeriesType> {
  switch (type) {
    case 'bars':
      return chart.addBarSeries({ upColor: UP, downColor: DOWN, thinBars: false });
    case 'line':
      return chart.addLineSeries({ color: '#3b82f6', lineWidth: 2 });
    case 'area':
      return chart.addAreaSeries({
        lineColor: '#3b82f6',
        topColor: 'rgba(59,130,246,0.4)',
        bottomColor: 'rgba(59,130,246,0.02)',
        lineWidth: 2,
      });
    case 'candles':
    case 'heikin-ashi':
    default:
      return chart.addCandlestickSeries({
        upColor: UP,
        downColor: DOWN,
        borderVisible: false,
        wickUpColor: UP,
        wickDownColor: DOWN,
      });
  }
}
