/**
 * Colour-coded ticker bar shown at the top of each pane. The price area flashes
 * green on an up-tick and red on a down-tick of the streamed price, then fades
 * back, giving an at-a-glance pulse of market activity.
 */

import { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';

/** Connection/loading state of the owning pane. */
export type PaneStatus = 'loading' | 'live' | 'error' | 'idle';

interface Props {
  symbol: string;
  /** Asset-class / source label rendered as a small badge. */
  sourceLabel: string;
  price: number | null;
  /** Absolute change vs. the previous tick. */
  change: number;
  /** Percentage change vs. the previous tick. */
  changePct: number;
  /** Direction of the latest change, used for the flash colour. */
  direction: 'up' | 'down' | 'flat';
  /** Monotonic counter that increments on every price update (drives flashes). */
  flashId: number;
  status: PaneStatus;
}

/** Adaptive price formatting that works for both BTC (~60k) and DOGE (~0.12). */
function formatPrice(value: number): string {
  const abs = Math.abs(value);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 3 : abs >= 0.01 ? 5 : 8;
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function TickerBar({
  symbol,
  sourceLabel,
  price,
  change,
  changePct,
  direction,
  flashId,
  status,
}: Props) {
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);

  // Re-trigger the flash on every update (flashId change), then fade out.
  useEffect(() => {
    if (flashId === 0 || direction === 'flat') return;
    setFlash(direction);
    const timer = setTimeout(() => setFlash(null), 350);
    return () => clearTimeout(timer);
  }, [flashId, direction]);

  const positive = change >= 0;

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 px-2.5 py-1.5 transition-colors duration-300',
        flash === 'up' && 'bg-accent-up/30',
        flash === 'down' && 'bg-accent-down/30',
        flash === null && 'bg-base-800/80',
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-semibold text-slate-100">
          {symbol}
        </span>
        <span className="shrink-0 rounded bg-base-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
          {sourceLabel}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {status === 'loading' && (
          <span className="text-xs text-slate-500">loading…</span>
        )}
        {status === 'error' && (
          <span className="text-xs text-accent-down">no data</span>
        )}
        {price != null && (
          <>
            <span
              className={cn(
                'font-mono text-sm tabular-nums',
                direction === 'up' && 'text-accent-up',
                direction === 'down' && 'text-accent-down',
                direction === 'flat' && 'text-slate-200',
              )}
            >
              {formatPrice(price)}
            </span>
            <span
              className={cn(
                'font-mono text-[11px] tabular-nums',
                positive ? 'text-accent-up' : 'text-accent-down',
              )}
            >
              {positive ? '+' : ''}
              {changePct.toFixed(2)}%
            </span>
          </>
        )}
        {status === 'live' && price != null && (
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-accent-up"
            title="Live"
            aria-label="Live"
          />
        )}
      </div>
    </div>
  );
}
