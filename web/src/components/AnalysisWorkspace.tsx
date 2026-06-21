/**
 * The single-symbol analysis workspace: watchlist + data loading on the left,
 * an interactive TradingView-style chart in the centre, and indicators +
 * backtest on the right. Extracted from the former `App` body so the app shell
 * can switch between this and the live multi-chart dashboard.
 */

import { useMemo, useState } from 'react';
import { CandleChart } from './CandleChart';
import { Watchlist } from './Watchlist';
import { IndicatorPanel } from './IndicatorPanel';
import { DataLoader } from './DataLoader';
import { BacktestPanel } from './BacktestPanel';
import { Panel, Button } from './ui';
import { useStore, useActiveCandles } from '../store/useStore';
import { TIMEFRAMES, resampleCandles, type TimeframeId } from '../lib/timeframe';

export function AnalysisWorkspace() {
  const activeSymbol = useStore((s) => s.activeSymbol);
  const allCandles = useActiveCandles();
  const indicators = useStore((s) => s.indicators);
  const loading = useStore((s) => s.loading);
  const error = useStore((s) => s.error);
  const clearError = useStore((s) => s.clearError);
  const [timeframe, setTimeframe] = useState<TimeframeId>('1D');

  // The timeframe selects the candle interval (1D daily, 1W weekly, …); the
  // full history is aggregated into that bar size and shown end-to-end.
  const candles = useMemo(
    () => resampleCandles(allCandles, timeframe),
    [allCandles, timeframe],
  );

  const last = candles[candles.length - 1];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error && (
        <div className="flex items-center justify-between border-b border-accent-down/40 bg-accent-down/10 px-4 py-2 text-sm text-accent-down">
          <span>{error}</span>
          <button onClick={clearError} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[220px_1fr_300px] gap-2 p-2">
        {/* Left: watchlist + data */}
        <div className="flex min-h-0 flex-col gap-2">
          <Panel title="Watchlist" className="min-h-0 flex-1">
            <Watchlist />
          </Panel>
          <Panel title="Data" className="shrink-0">
            <DataLoader />
          </Panel>
        </div>

        {/* Center: chart */}
        <Panel
          title={`${activeSymbol}${last ? ` · ${last.close.toFixed(2)}` : ''}`}
          className="min-h-0"
          action={
            <div className="flex items-center gap-1">
              {TIMEFRAMES.map((tf) => (
                <Button
                  key={tf.id}
                  variant={tf.id === timeframe ? 'accent' : 'ghost'}
                  onClick={() => setTimeframe(tf.id)}
                  className="px-2 py-1 text-xs"
                >
                  {tf.id}
                </Button>
              ))}
            </div>
          }
        >
          {loading && !candles.length ? (
            <div className="flex h-full items-center justify-center text-slate-500">
              Loading…
            </div>
          ) : candles.length ? (
            <CandleChart
              candles={candles}
              indicators={indicators}
              symbol={activeSymbol}
              timeframe={timeframe}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-slate-500">
              No data. Upload a CSV or add a symbol.
            </div>
          )}
        </Panel>

        {/* Right: indicators + backtest */}
        <div className="flex min-h-0 flex-col gap-2 overflow-auto">
          <Panel title="Indicators" className="shrink-0">
            <IndicatorPanel />
          </Panel>
          <Panel title="Backtest · SMA Crossover" className="shrink-0">
            <BacktestPanel />
          </Panel>
        </div>
      </div>
    </div>
  );
}
