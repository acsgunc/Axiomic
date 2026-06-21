/**
 * A compact, streaming candlestick chart for a single dashboard pane.
 *
 * It renders an initial history via `setData` and then accepts live bar updates
 * imperatively (through a ref handle) so high-frequency price ticks don't
 * re-render the React tree. A thin volume histogram sits at the bottom.
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle } from '../../types';

const BG = '#0b0f17';
const GRID = '#161d2b';
const UP = '#26a69a';
const DOWN = '#ef5350';

/** Imperative API exposed to the owning pane for live updates. */
export interface LiveChartHandle {
  /** Inserts/updates the latest bar (lightweight-charts upserts by time). */
  update(candle: Candle): void;
}

interface Props {
  candles: Candle[];
}

/** Most-recent bars shown by default so the live edge is readable. */
const VISIBLE_BARS = 120;

function toCandlestick(c: Candle): CandlestickData {
  return {
    time: c.time as UTCTimestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  };
}

function toVolume(c: Candle): HistogramData {
  return {
    time: c.time as UTCTimestamp,
    value: c.volume,
    color: c.close >= c.open ? `${UP}55` : `${DOWN}55`,
  };
}

export const LiveChart = forwardRef<LiveChartHandle, Props>(function LiveChart(
  { candles },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  // Create the chart once.
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: BG },
        textColor: '#94a3b8',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        fontSize: 11,
      },
      grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
      rightPriceScale: { borderColor: GRID },
      timeScale: {
        borderColor: GRID,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
      },
      crosshair: { mode: CrosshairMode.Normal },
    });
    chartRef.current = chart;

    priceRef.current = chart.addCandlestickSeries({
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      priceLineVisible: true,
      lastValueVisible: true,
    });

    volumeRef.current = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    // Pin volume to the bottom ~20% of the pane.
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    return () => {
      chart.remove();
      chartRef.current = null;
      priceRef.current = null;
      volumeRef.current = null;
    };
  }, []);

  // Load/replace the full history whenever the candle array identity changes.
  useEffect(() => {
    const price = priceRef.current;
    const volume = volumeRef.current;
    const chart = chartRef.current;
    if (!price || !volume || !chart) return;
    price.setData(candles.map(toCandlestick));
    volume.setData(candles.map(toVolume));
    if (candles.length > VISIBLE_BARS) {
      const to = candles.length - 1 + 4;
      chart.timeScale().setVisibleLogicalRange({ from: to - VISIBLE_BARS, to });
    } else {
      chart.timeScale().fitContent();
    }
  }, [candles]);

  useImperativeHandle(ref, () => ({
    update(candle: Candle) {
      priceRef.current?.update(toCandlestick(candle));
      volumeRef.current?.update(toVolume(candle));
    },
  }), []);

  return <div ref={containerRef} className="h-full w-full" />;
});
