import { useState } from 'react';
import { useStore } from '../store/useStore';
import { cn } from '../lib/utils';
import { Button } from './ui';

/** Sidebar watchlist with add/remove and quick symbol switching. */
export function Watchlist() {
  const watchlist = useStore((s) => s.watchlist);
  const activeSymbol = useStore((s) => s.activeSymbol);
  const candlesBySymbol = useStore((s) => s.candlesBySymbol);
  const setActiveSymbol = useStore((s) => s.setActiveSymbol);
  const addSymbol = useStore((s) => s.addSymbol);
  const removeSymbol = useStore((s) => s.removeSymbol);
  const loadSampleData = useStore((s) => s.loadSampleData);
  const [input, setInput] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const sym = input.trim().toUpperCase();
    if (!sym) return;
    addSymbol(sym);
    void loadSampleData(sym);
    setInput('');
  };

  return (
    <div className="flex h-full flex-col gap-2">
      <form onSubmit={submit} className="flex gap-1.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add symbol…"
          className="min-w-0 flex-1 rounded-md border border-base-700 bg-base-900 px-2 py-1.5 text-sm outline-none placeholder:text-slate-500 focus:border-accent"
        />
        <Button type="submit" variant="accent" aria-label="Add symbol">
          +
        </Button>
      </form>

      <ul className="flex flex-col gap-1 overflow-auto">
        {watchlist.map((symbol) => {
          const candles = candlesBySymbol[symbol];
          const last = candles?.[candles.length - 1];
          const prev = candles?.[candles.length - 2];
          const change =
            last && prev ? ((last.close - prev.close) / prev.close) * 100 : null;
          return (
            <li key={symbol}>
              <button
                onClick={() => setActiveSymbol(symbol)}
                className={cn(
                  'group flex w-full items-center justify-between rounded-md border px-2.5 py-2 text-left transition-colors',
                  symbol === activeSymbol
                    ? 'border-accent bg-accent/10'
                    : 'border-transparent hover:bg-base-700',
                )}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-100">
                    {symbol}
                  </div>
                  {last && (
                    <div className="font-mono text-xs text-slate-400">
                      {last.close.toFixed(2)}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {change != null && (
                    <span
                      className={cn(
                        'font-mono text-xs',
                        change >= 0 ? 'text-accent-up' : 'text-accent-down',
                      )}
                    >
                      {change >= 0 ? '+' : ''}
                      {change.toFixed(2)}%
                    </span>
                  )}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSymbol(symbol);
                    }}
                    className="text-slate-600 opacity-0 transition-opacity hover:text-accent-down group-hover:opacity-100"
                    aria-label={`Remove ${symbol}`}
                  >
                    ×
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
