/**
 * A single dashboard pane: a colour-coded ticker bar, independent source /
 * symbol / timeframe selectors, and a streaming candlestick chart.
 *
 * The pane owns the full data lifecycle for its symbol — fetch history, then
 * subscribe to live updates — and pushes ticks into the chart imperatively so
 * price flashes never re-render the chart subtree.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Candle } from '../../types';
import {
  INTERVALS,
  listSources,
  resolveSource,
  type IntervalId,
  type PriceUpdate,
} from '../../lib/marketData';
import { useDashboardStore, type PaneConfig } from '../../store/useDashboardStore';
import { LiveChart, type LiveChartHandle } from './LiveChart';
import { TickerBar, type PaneStatus } from './TickerBar';

interface TickerState {
  price: number | null;
  change: number;
  changePct: number;
  direction: 'up' | 'down' | 'flat';
  flashId: number;
}

const INITIAL_TICKER: TickerState = {
  price: null,
  change: 0,
  changePct: 0,
  direction: 'flat',
  flashId: 0,
};

export function LivePane({ pane }: { pane: PaneConfig }) {
  const setPaneSource = useDashboardStore((s) => s.setPaneSource);
  const setPaneSymbol = useDashboardStore((s) => s.setPaneSymbol);
  const setPaneInterval = useDashboardStore((s) => s.setPaneInterval);

  const source = useMemo(() => resolveSource(pane.sourceId), [pane.sourceId]);
  const sources = useMemo(() => listSources(), []);

  const [candles, setCandles] = useState<Candle[]>([]);
  const [status, setStatus] = useState<PaneStatus>('idle');
  const [ticker, setTicker] = useState<TickerState>(INITIAL_TICKER);

  const chartRef = useRef<LiveChartHandle>(null);
  const prevPriceRef = useRef<number | undefined>(undefined);
  /** Close of the last *completed* bar — the baseline for the % change. */
  const baselineRef = useRef<number | undefined>(undefined);
  /** Open time of the currently-forming bar, to detect when a new bar starts. */
  const lastBarTimeRef = useRef<number | undefined>(undefined);
  /** Latest close of the currently-forming bar. */
  const currentCloseRef = useRef<number | undefined>(undefined);

  // Fetch history + subscribe whenever the source/symbol/interval changes.
  useEffect(() => {
    let cancelled = false;
    prevPriceRef.current = undefined;
    baselineRef.current = undefined;
    lastBarTimeRef.current = undefined;
    currentCloseRef.current = undefined;
    setStatus('loading');
    setTicker(INITIAL_TICKER);

    const pctOf = (price: number): number => {
      const baseline = baselineRef.current;
      return baseline ? ((price - baseline) / baseline) * 100 : 0;
    };

    const applyTick = (update: PriceUpdate) => {
      const price = update.price;
      const barTime = update.candle?.time ?? update.time;
      // When a fresh bar starts, the prior bar's last close becomes the baseline.
      if (lastBarTimeRef.current != null && barTime > lastBarTimeRef.current) {
        baselineRef.current = currentCloseRef.current ?? baselineRef.current;
      }
      lastBarTimeRef.current = barTime;
      currentCloseRef.current = price;

      const prev = prevPriceRef.current;
      const direction: TickerState['direction'] =
        prev == null ? 'flat' : price > prev ? 'up' : price < prev ? 'down' : 'flat';
      prevPriceRef.current = price;
      setTicker((t) => ({
        price,
        change: price - (baselineRef.current ?? price),
        changePct: pctOf(price),
        direction,
        flashId: t.flashId + 1,
      }));
    };

    let unsubscribe: (() => void) | undefined;

    source
      .fetchCandles(pane.symbol, pane.interval)
      .then((data) => {
        if (cancelled) return;
        setCandles(data);
        const last = data[data.length - 1];
        const prevBar = data[data.length - 2];
        // Baseline = previous bar's close, so the % reflects the current bar's
        // move (e.g. today's change on a daily chart) rather than all-time.
        baselineRef.current = prevBar?.close ?? last?.open;
        lastBarTimeRef.current = last?.time;
        currentCloseRef.current = last?.close;
        prevPriceRef.current = last?.close;
        setTicker({
          price: last?.close ?? null,
          change: last ? last.close - (baselineRef.current ?? last.close) : 0,
          changePct: last ? pctOf(last.close) : 0,
          direction: 'flat',
          flashId: 0,
        });
        setStatus('live');

        unsubscribe = source.subscribe(pane.symbol, pane.interval, (u: PriceUpdate) => {
          if (cancelled) return;
          if (u.candle) chartRef.current?.update(u.candle);
          applyTick(u);
        });
      })
      .catch(() => {
        if (cancelled) return;
        setCandles([]);
        setStatus('error');
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [source, pane.symbol, pane.interval]);

  return (
    <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-base-700 bg-base-800/40">
      <TickerBar
        symbol={pane.symbol}
        sourceLabel={source.assetClass}
        price={ticker.price}
        change={ticker.change}
        changePct={ticker.changePct}
        direction={ticker.direction}
        flashId={ticker.flashId}
        status={status}
      />

      {/* Per-pane controls: source, symbol, timeframe — all independent. */}
      <div className="flex shrink-0 items-center gap-1 border-b border-base-700 bg-base-800/60 px-2 py-1">
        <select
          aria-label="Data source"
          value={pane.sourceId}
          onChange={(e) => setPaneSource(pane.id, e.target.value)}
          className="rounded border border-base-700 bg-base-800 px-1.5 py-0.5 text-[11px] text-slate-200 focus:border-accent focus:outline-none"
        >
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>

        <input
          aria-label="Symbol"
          list={`symbols-${pane.id}`}
          defaultValue={pane.symbol}
          key={`${pane.sourceId}:${pane.symbol}`}
          onBlur={(e) => setPaneSymbol(pane.id, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          className="w-24 min-w-0 flex-1 rounded border border-base-700 bg-base-800 px-1.5 py-0.5 text-[11px] uppercase text-slate-200 focus:border-accent focus:outline-none"
        />
        <datalist id={`symbols-${pane.id}`}>
          {source.symbols.map((opt) => (
            <option key={opt.symbol} value={opt.symbol}>
              {opt.label}
            </option>
          ))}
        </datalist>

        <select
          aria-label="Timeframe"
          value={pane.interval}
          onChange={(e) => setPaneInterval(pane.id, e.target.value as IntervalId)}
          className="rounded border border-base-700 bg-base-800 px-1.5 py-0.5 text-[11px] text-slate-200 focus:border-accent focus:outline-none"
        >
          {INTERVALS.filter((i) => source.intervals.includes(i.id)).map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </select>
      </div>

      <div className="relative min-h-0 flex-1">
        {status === 'error' ? (
          <div className="flex h-full items-center justify-center px-3 text-center text-xs text-slate-500">
            No data for {pane.symbol}. Pick another symbol, or configure a data
            source.
          </div>
        ) : candles.length ? (
          <LiveChart ref={chartRef} candles={candles} />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-500">
            Loading {pane.symbol}…
          </div>
        )}
      </div>
    </section>
  );
}
