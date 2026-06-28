/**
 * A compact, streaming candlestick chart for a single dashboard pane.
 *
 * It renders an initial history via `setData` and then accepts live bar updates
 * imperatively (through a ref handle) so high-frequency price ticks don't
 * re-render the React tree. A thin volume histogram sits at the bottom.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle } from '../../types';
import { ChartContextMenu } from '../ChartContextMenu';
import { ChartMeasureOverlay } from '../ChartMeasureOverlay';
import { ChartReplayBar, ReplaySelectOverlay } from '../ChartReplayBar';
import { CandleTable } from '../CandleTable';
import { useChartReplay } from '../../lib/useChartReplay';
import { replayIndexFromLogical } from '../../lib/replay';
import { type ViewMode } from '../../lib/chart';
import { cn } from '../../lib/utils';

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
  const candlesRef = useRef<Candle[]>(candles);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('chart');
  const [fullscreen, setFullscreen] = useState(false);

  // Replay over the loaded history (TradingView-style). While active, live
  // ticks are ignored and the chart shows a growing prefix of the candles.
  const replay = useChartReplay(candles.length);
  const replayActiveRef = useRef(false);
  useEffect(() => {
    replayActiveRef.current = replay.active;
  }, [replay.active]);
  const effectiveCandles = useMemo(
    () => (replay.active ? candles.slice(0, replay.index) : candles),
    [candles, replay.active, replay.index],
  );

  // Reset the visible window to the most recent bars (or fit when few exist).
  const applyDefaultView = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const count = candlesRef.current.length;
    if (count > VISIBLE_BARS) {
      const to = count - 1 + 4;
      chart.timeScale().setVisibleLogicalRange({ from: to - VISIBLE_BARS, to });
    } else {
      chart.timeScale().fitContent();
    }
  }, []);

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

  // Load/replace the history. When replay is active this fires on each revealed
  // bar (no view reset); otherwise it reloads on a new candle array.
  useEffect(() => {
    const price = priceRef.current;
    const volume = volumeRef.current;
    const chart = chartRef.current;
    if (!price || !volume || !chart) return;
    candlesRef.current = effectiveCandles;
    price.setData(effectiveCandles.map(toCandlestick));
    volume.setData(effectiveCandles.map(toVolume));
    if (!replay.active) applyDefaultView();
  }, [effectiveCandles, replay.active, applyDefaultView]);

  // Keep the revealed replay edge in view as playback advances.
  useEffect(() => {
    if (!replay.active) return;
    const ts = chartRef.current?.timeScale();
    if (!ts) return;
    const range = ts.getVisibleLogicalRange();
    if (!range) return;
    const edge = replay.index - 1;
    if (edge > range.to - 1 || edge < range.from) {
      ts.setVisibleLogicalRange({ from: edge - VISIBLE_BARS + 4, to: edge + 4 });
    }
  }, [replay.active, replay.index]);

  useImperativeHandle(ref, () => ({
    update(candle: Candle) {
      if (replayActiveRef.current) return; // freeze live ticks during replay
      priceRef.current?.update(toCandlestick(candle));
      volumeRef.current?.update(toVolume(candle));
    },
  }), []);

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    // Shift + right-click arms the Measure tool directly (TradingView-style).
    if (e.shiftKey) {
      setCtxMenu(null);
      setMeasuring(true);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setCtxMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  function startReplay() {
    setCtxMenu(null);
    setMeasuring(false);
    replay.start();
  }

  function handleReplayPick(logical: number) {
    const idx = replayIndexFromLogical(logical, candles.length);
    replay.pick(idx);
    const ts = chartRef.current?.timeScale();
    if (ts) {
      const edge = idx - 1;
      ts.setVisibleLogicalRange({ from: edge - VISIBLE_BARS + 4, to: edge + 4 });
    }
  }

  // Esc exits full screen (unless a tool is mid-gesture, which uses Esc itself).
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !measuring && !replay.selecting) {
        setFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen, measuring, replay.selecting]);

  return (
    <div
      className={cn(
        fullscreen ? 'fixed inset-0 z-50 bg-base-900 p-2' : 'h-full w-full',
      )}
      onContextMenu={handleContextMenu}
    >
      <div
        className={cn(
          'flex h-full w-full',
          viewMode === 'split' ? 'flex-row gap-1' : 'flex-col',
        )}
      >
        <div
          className={cn(
            'relative min-h-0 min-w-0 flex-1',
            viewMode === 'table' && 'hidden',
          )}
        >
          <div ref={containerRef} className="h-full w-full" />
          <ChartMeasureOverlay
            chart={chartRef.current}
            series={priceRef.current as unknown as ISeriesApi<SeriesType> | null}
            candles={effectiveCandles}
            active={measuring}
            onComplete={() => setMeasuring(false)}
          />
          {replay.selecting && (
            <ReplaySelectOverlay chart={chartRef.current} onPick={handleReplayPick} />
          )}
          <ChartReplayBar replay={replay} compact />
        </div>
        {viewMode !== 'chart' && (
          <div
            className={cn(
              'min-h-0 min-w-0 overflow-hidden rounded-md border border-base-700 bg-base-800/40',
              viewMode === 'split' ? 'flex-1' : 'flex-1',
            )}
          >
            <CandleTable candles={effectiveCandles} />
          </div>
        )}
      </div>
      {ctxMenu && (
        <ChartContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            {
              label: 'Measure',
              title: 'Measure price, %, bars & time (Shift + right-click)',
              onSelect: () => setMeasuring(true),
            },
            {
              label: replay.active ? 'Exit Replay' : 'Replay…',
              title: 'Replay history bar by bar (TradingView-style)',
              onSelect: replay.active ? replay.exit : startReplay,
            },
            {
              label:
                viewMode === 'table' ? 'Hide Table' : 'Table View',
              title: 'Show the OHLCV data table',
              onSelect: () =>
                setViewMode((m) => (m === 'table' ? 'chart' : 'table')),
            },
            {
              label: viewMode === 'split' ? 'Hide Split' : 'Split View',
              title: 'Show chart and table side by side',
              onSelect: () =>
                setViewMode((m) => (m === 'split' ? 'chart' : 'split')),
            },
            {
              label: fullscreen ? 'Exit Full Screen' : 'Full Screen',
              title: 'Expand this pane to fill the window (Esc to exit)',
              onSelect: () => setFullscreen((v) => !v),
            },
            {
              label: 'Reset Chart View',
              title: 'Reset zoom & pan to the latest bars',
              onSelect: applyDefaultView,
            },
          ]}
        />
      )}
    </div>
  );
});
