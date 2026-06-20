import { useState } from 'react';
import {
  createChart,
  ColorType,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useEffect, useRef } from 'react';
import { engine } from '../engine';
import { useStore, useActiveCandles } from '../store/useStore';
import type { BacktestConfig, BacktestResult } from '../types';
import { cn, fmtNum, fmtPct } from '../lib/utils';
import { Button } from './ui';

const DEFAULT_CONFIG: BacktestConfig = {
  fast_period: 20,
  slow_period: 50,
  initial_capital: 10_000,
  fee: 0.001,
  periods_per_year: 252,
};

/** SMA-crossover backtesting panel. Strategy logic runs in Rust/WASM. */
export function BacktestPanel() {
  const candles = useActiveCandles();
  const activeSymbol = useStore((s) => s.activeSymbol);
  const [config, setConfig] = useState<BacktestConfig>(DEFAULT_CONFIG);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!candles.length) return;
    setRunning(true);
    setError(null);
    try {
      const res = await engine.backtestSmaCrossover(candles, config);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backtest failed.');
    } finally {
      setRunning(false);
    }
  };

  const update = (key: keyof BacktestConfig, value: number) =>
    setConfig((c) => ({ ...c, [key]: value }));

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Field
          label="Fast SMA"
          value={config.fast_period}
          onChange={(v) => update('fast_period', v)}
        />
        <Field
          label="Slow SMA"
          value={config.slow_period}
          onChange={(v) => update('slow_period', v)}
        />
        <Field
          label="Capital"
          value={config.initial_capital}
          onChange={(v) => update('initial_capital', v)}
        />
        <Field
          label="Fee (bps)"
          value={config.fee * 10_000}
          onChange={(v) => update('fee', v / 10_000)}
        />
      </div>

      <Button onClick={run} variant="accent" disabled={running || !candles.length}>
        {running ? 'Running…' : `Run on ${activeSymbol}`}
      </Button>

      {error && <p className="text-xs text-accent-down">{error}</p>}

      {result && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Metric
              label="Total Return"
              value={fmtPct(result.total_return_pct)}
              positive={result.total_return_pct >= 0}
            />
            <Metric label="Sharpe" value={fmtNum(result.sharpe_ratio)} />
            <Metric
              label="Max Drawdown"
              value={fmtPct(-result.max_drawdown_pct)}
              positive={false}
            />
            <Metric label="Win Rate" value={fmtPct(result.win_rate_pct, 1)} />
            <Metric label="Trades" value={String(result.num_trades)} />
          </div>
          <EquityCurve result={result} />
        </>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-md border border-base-700 bg-base-900 px-2 py-1 font-mono text-sm outline-none focus:border-accent"
      />
    </label>
  );
}

function Metric({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-md border border-base-700 bg-base-900/40 px-2.5 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div
        className={cn(
          'font-mono text-sm font-semibold',
          positive === undefined
            ? 'text-slate-100'
            : positive
              ? 'text-accent-up'
              : 'text-accent-down',
        )}
      >
        {value}
      </div>
    </div>
  );
}

/** Renders the backtest equity curve as a small area chart. */
function EquityCurve({ result }: { result: BacktestResult }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0b0f17' },
        textColor: '#94a3b8',
      },
      grid: { vertLines: { color: '#1a2233' }, horzLines: { color: '#1a2233' } },
      rightPriceScale: { borderColor: '#1a2233' },
      timeScale: { borderColor: '#1a2233' },
      height: 140,
      autoSize: true,
    });
    const series = chart.addAreaSeries({
      lineColor: '#3b82f6',
      topColor: 'rgba(59,130,246,0.4)',
      bottomColor: 'rgba(59,130,246,0.02)',
      lineWidth: 2,
    });
    series.setData(
      result.equity_time.map((t, i) => ({
        time: t as UTCTimestamp,
        value: result.equity_curve[i],
      })),
    );
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [result]);

  return (
    <div>
      <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">
        Equity Curve
      </div>
      <div ref={ref} className="h-36" />
    </div>
  );
}
