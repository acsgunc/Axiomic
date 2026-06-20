import { useRef } from 'react';
import { useStore, useActiveCandles } from '../store/useStore';
import { hasProxy } from '../lib/dataProvider';
import { candlesToCsv } from '../lib/sampleData';
import { Button } from './ui';

/** Data loading controls: CSV upload, proxy fetch, sample data, and export. */
export function DataLoader() {
  const fileRef = useRef<HTMLInputElement>(null);
  const loadCsv = useStore((s) => s.loadCsv);
  const loadProxy = useStore((s) => s.loadProxy);
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
      <Button onClick={() => fileRef.current?.click()} disabled={loading}>
        Upload CSV
      </Button>
      <Button
        onClick={() => void loadProxy(activeSymbol)}
        disabled={loading || !hasProxy}
        title={hasProxy ? undefined : 'Set VITE_PROXY_URL to enable'}
      >
        Fetch via Proxy
      </Button>
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
