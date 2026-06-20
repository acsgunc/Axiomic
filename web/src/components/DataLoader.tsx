import { useRef } from 'react';
import { useStore, useActiveCandles } from '../store/useStore';
import {
  hasProxy,
  isDesktop,
  liveAvailable,
  type NativeProvider,
} from '../lib/dataProvider';
import { candlesToCsv } from '../lib/sampleData';
import { Button } from './ui';

/** Data loading controls: data mode, source, CSV upload, live fetch, export. */
export function DataLoader() {
  const fileRef = useRef<HTMLInputElement>(null);
  const loadCsv = useStore((s) => s.loadCsv);
  const loadProxy = useStore((s) => s.loadProxy);
  const loadNative = useStore((s) => s.loadNative);
  const provider = useStore((s) => s.provider);
  const setProvider = useStore((s) => s.setProvider);
  const dataMode = useStore((s) => s.dataMode);
  const setDataMode = useStore((s) => s.setDataMode);
  const activeSymbol = useStore((s) => s.activeSymbol);
  const activeCandles = useActiveCandles();
  const loading = useStore((s) => s.loading);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void loadCsv(file);
    e.target.value = '';
  };

  const exportCsv = () => {
    if (!activeCandles.length) return;
    const csv = candlesToCsv(activeCandles);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeSymbol}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        onChange={onFile}
        className="hidden"
      />

      {/* Data mode: auto-fetch live on symbol select, or use local/cached data. */}
      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-slate-400">Data mode</span>
        <div className="flex rounded-md border border-base-700 p-0.5">
          {(['live', 'local'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setDataMode(mode)}
              disabled={loading || (mode === 'live' && !liveAvailable)}
              title={
                mode === 'live' && !liveAvailable
                  ? 'Live data needs the desktop app or a configured proxy'
                  : mode === 'live'
                    ? 'Fetch fresh data automatically when selecting a symbol'
                    : 'Use cached/sample data without fetching'
              }
              className={
                'flex-1 rounded px-2 py-1 text-xs font-medium capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-40 ' +
                (dataMode === mode
                  ? 'bg-accent text-white'
                  : 'text-slate-300 hover:bg-base-700')
              }
            >
              {mode}
            </button>
          ))}
        </div>
        <p className="text-[11px] leading-snug text-slate-500">
          {dataMode === 'live'
            ? 'Live: selecting a symbol fetches fresh data automatically.'
            : 'Local: uses cached or sample data — no network calls.'}
        </p>
      </div>

      <Button onClick={() => fileRef.current?.click()} disabled={loading}>
        Upload CSV
      </Button>

      {isDesktop ? (
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2 text-[11px] text-slate-400">
            Source
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as NativeProvider)}
              disabled={loading}
              className="flex-1 rounded-md border border-base-700 bg-base-800 px-2 py-1 text-xs text-slate-200 focus:border-accent focus:outline-none disabled:opacity-50"
            >
              <option value="yfinance">yfinance-rs (Yahoo)</option>
              <option value="yahoo">yahoo_finance_api (legacy)</option>
            </select>
          </label>
          <Button
            onClick={() => void loadNative(activeSymbol)}
            disabled={loading}
            title={`Fetch live daily candles for ${activeSymbol} via ${provider}`}
          >
            {loading ? 'Fetching…' : 'Fetch Live Data'}
          </Button>
        </div>
      ) : (
        <>
          <Button
            onClick={() => void loadProxy(activeSymbol)}
            disabled={loading || !hasProxy}
            title={
              hasProxy
                ? `Fetch live daily candles for ${activeSymbol}`
                : 'Live fetch is disabled — configure a data proxy to enable it'
            }
          >
            {hasProxy ? 'Fetch Live Data' : 'Fetch Live Data (setup needed)'}
          </Button>
          {!hasProxy && (
            <p className="text-[11px] leading-snug text-amber-500/90">
              Live fetch is off. Deploy the data proxy and set{' '}
              <code className="rounded bg-base-700 px-1">VITE_PROXY_URL</code> in{' '}
              <code className="rounded bg-base-700 px-1">web/.env</code> to enable
              it (see{' '}
              <code className="rounded bg-base-700 px-1">proxy/README.md</code>).
              Meanwhile, upload a CSV.
            </p>
          )}
        </>
      )}

      <Button
        onClick={exportCsv}
        variant="ghost"
        disabled={!activeCandles.length}
      >
        Export CSV
      </Button>
      <p className="text-[11px] leading-snug text-slate-500">
        CSV columns: Date, Open, High, Low, Close, Volume. Parsed in Rust/WASM.
      </p>
    </div>
  );
}
