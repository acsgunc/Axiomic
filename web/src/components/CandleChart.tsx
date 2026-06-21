import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type CandlestickData,
  type UTCTimestamp,
} from 'lightweight-charts';
import { engine } from '../engine';
import type { Candle, IndicatorConfig, Series } from '../types';

interface Props {
  candles: Candle[];
  indicators: IndicatorConfig[];
}

const CHART_BG = '#0b0f17';
const GRID = '#1a2233';

/** Maps a WASM Series to lightweight-charts LineData, skipping null points. */
function toLineData(series: Series): LineData[] {
  const out: LineData[] = [];
  for (let i = 0; i < series.time.length; i++) {
    const v = series.values[i];
    if (v != null) {
      out.push({ time: series.time[i] as UTCTimestamp, value: v });
    }
  }
  return out;
}

/**
 * Interactive candlestick chart with WASM-computed indicator overlays and an
 * optional RSI sub-pane. All indicator math is delegated to the Rust core.
 */
export function CandleChart({ candles, indicators }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const overlayRefs = useRef<ISeriesApi<'Line'>[]>([]);
  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const [overlayError, setOverlayError] = useState<string | null>(null);

  const showRsi = useMemo(
    () => indicators.some((i) => i.kind === 'rsi' && i.enabled),
    [indicators],
  );

  // Create the chart once.
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: CHART_BG },
        textColor: '#94a3b8',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      },
      grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: GRID },
      timeScale: {
        borderColor: GRID,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        barSpacing: 8,
      },
      handleScroll: true,
      handleScale: true,
      autoSize: true,
    });
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });
    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
  }, []);

  // Create/teardown the RSI sub-chart on demand.
  useEffect(() => {
    if (showRsi && rsiContainerRef.current && !rsiChartRef.current) {
      const chart = createChart(rsiContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: CHART_BG },
          textColor: '#94a3b8',
        },
        grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
        rightPriceScale: { borderColor: GRID },
        timeScale: { borderColor: GRID, timeVisible: false },
        autoSize: true,
      });
      const series = chart.addLineSeries({ color: '#22d3ee', lineWidth: 1 });
      // Reference bands at 30 / 70.
      series.createPriceLine({ price: 70, color: '#ef5350', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '70' });
      series.createPriceLine({ price: 30, color: '#26a69a', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '30' });
      rsiChartRef.current = chart;
      rsiSeriesRef.current = series;
    }
    if (!showRsi && rsiChartRef.current) {
      rsiChartRef.current.remove();
      rsiChartRef.current = null;
      rsiSeriesRef.current = null;
    }
  }, [showRsi]);

  // Feed candle data.
  useEffect(() => {
    if (!candleSeriesRef.current) return;
    const data: CandlestickData[] = candles.map((c) => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    candleSeriesRef.current.setData(data);
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  // Compute and render overlays whenever candles or indicator config change.
  useEffect(() => {
    let cancelled = false;
    const chart = chartRef.current;
    if (!chart || candles.length === 0) return;

    // Clear previous overlays.
    overlayRefs.current.forEach((s) => chart.removeSeries(s));
    overlayRefs.current = [];

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
            const line = chart.addLineSeries({ color: ind.color, lineWidth: 2 });
            line.setData(toLineData(series));
            overlayRefs.current.push(line);
          } else if (ind.kind === 'bollinger') {
            const b = await engine.bollinger(candles, ind.period, 2);
            if (cancelled) return;
            for (const band of [b.upper, b.middle, b.lower]) {
              const line = chart.addLineSeries({
                color: ind.color,
                lineWidth: 1,
                lineStyle: 1,
              });
              line.setData(toLineData(band));
              overlayRefs.current.push(line);
            }
          }
        }

        // RSI sub-pane.
        const rsiInd = indicators.find((i) => i.kind === 'rsi' && i.enabled);
        if (rsiInd && rsiSeriesRef.current) {
          const rsi = await engine.rsi(candles, rsiInd.period);
          if (cancelled) return;
          rsiSeriesRef.current.setData(toLineData(rsi));
          rsiChartRef.current?.timeScale().fitContent();
        }
      } catch (err) {
        if (!cancelled) {
          setOverlayError(
            err instanceof Error ? err.message : 'Failed to compute indicators.',
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [candles, indicators, showRsi]);

  return (
    <div className="flex h-full flex-col gap-2">
      <div ref={containerRef} className="min-h-0 flex-1" />
      {showRsi && (
        <div className="relative h-32 shrink-0">
          <span className="absolute left-2 top-1 z-10 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            RSI
          </span>
          <div ref={rsiContainerRef} className="h-full" />
        </div>
      )}
      {overlayError && (
        <p className="shrink-0 text-xs text-accent-down">{overlayError}</p>
      )}
    </div>
  );
}
