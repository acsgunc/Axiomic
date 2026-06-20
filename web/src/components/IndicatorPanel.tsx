import { useStore } from '../store/useStore';
import { cn } from '../lib/utils';

const LABELS: Record<string, string> = {
  sma: 'SMA',
  ema: 'EMA',
  rsi: 'RSI',
  macd: 'MACD',
  bollinger: 'Bollinger',
  atr: 'ATR',
};

/** Toggle indicators on/off and tune their lookback periods. */
export function IndicatorPanel() {
  const indicators = useStore((s) => s.indicators);
  const toggle = useStore((s) => s.toggleIndicator);
  const setPeriod = useStore((s) => s.setIndicatorPeriod);

  return (
    <ul className="flex flex-col gap-2">
      {indicators.map((ind) => (
        <li
          key={ind.id}
          className="flex items-center justify-between gap-2 rounded-md border border-base-700 bg-base-900/40 px-2.5 py-2"
        >
          <label className="flex flex-1 items-center gap-2">
            <input
              type="checkbox"
              checked={ind.enabled}
              onChange={() => toggle(ind.id)}
              className="h-4 w-4 accent-accent"
            />
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: ind.color }}
            />
            <span
              className={cn(
                'text-sm font-medium',
                ind.enabled ? 'text-slate-100' : 'text-slate-500',
              )}
            >
              {LABELS[ind.kind] ?? ind.kind}
            </span>
          </label>
          {ind.kind !== 'macd' && (
            <input
              type="number"
              min={1}
              value={ind.period}
              onChange={(e) => setPeriod(ind.id, Number(e.target.value))}
              className="w-16 rounded-md border border-base-700 bg-base-900 px-2 py-1 text-right font-mono text-xs outline-none focus:border-accent"
            />
          )}
        </li>
      ))}
    </ul>
  );
}
