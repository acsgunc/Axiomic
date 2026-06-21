import { useEffect, useState } from 'react';
import { CandleChart } from './components/CandleChart';
import { Watchlist } from './components/Watchlist';
import { IndicatorPanel } from './components/IndicatorPanel';
import { DataLoader } from './components/DataLoader';
import { BacktestPanel } from './components/BacktestPanel';
import { Panel, Button } from './components/ui';
import { useStore, useActiveCandles } from './store/useStore';
import { preloadEngine } from './engine';
import { cn } from './lib/utils';
import { TIMEFRAMES, type TimeframeId } from './lib/timeframe';

export default function App() {
  const init = useStore((s) => s.init);
  const activeSymbol = useStore((s) => s.activeSymbol);
  const allCandles = useActiveCandles();
  const indicators = useStore((s) => s.indicators);
  const loading = useStore((s) => s.loading);
  const error = useStore((s) => s.error);
  const clearError = useStore((s) => s.clearError);
  const storageReady = useStore((s) => s.storageReady);
  const [timeframe, setTimeframe] = useState<TimeframeId>('1Y');

  useEffect(() => {
    preloadEngine();
    void init();
  }, [init]);

  const candles = allCandles;

  const last = candles[candles.length - 1];

  return (
    <div className="flex h-screen flex-col bg-base-900 text-slate-200">
      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between border-b border-base-700 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Logo />
            <span className="text-lg font-bold tracking-tight text-slate-100">
              Axiomic
            </span>
          </div>
          <span className="hidden text-xs text-slate-500 sm:inline">
            Browser-first stock analysis · Rust + WASM
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px]',
              storageReady
                ? 'bg-accent-up/15 text-accent-up'
                : 'bg-base-700 text-slate-400',
            )}
          >
            {storageReady ? 'DuckDB ready' : 'In-memory'}
          </span>
        </div>
      </header>

      {error && (
        <div className="flex items-center justify-between border-b border-accent-down/40 bg-accent-down/10 px-4 py-2 text-sm text-accent-down">
          <span>{error}</span>
          <button onClick={clearError} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}

      {/* Body */}
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
            <CandleChart candles={candles} indicators={indicators} symbol={activeSymbol} timeframe={timeframe} />
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

function Logo() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2L3 20h4l2-4h6l2 4h4L12 2zm-2 11l2-4 2 4h-4z"
        fill="#3b82f6"
      />
    </svg>
  );
}
