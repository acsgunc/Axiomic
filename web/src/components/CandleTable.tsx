/**
 * A TradingView-style data/table view of the chart's candles: each bar's
 * OHLCV plus its change vs the previous close, most-recent first. Pairs with
 * `CandleChart`/`LiveChart` so users can read exact prices alongside (or
 * instead of) the chart, and is the surface shown in the split / full-screen
 * layouts.
 */

import { useMemo } from 'react';
import type { Candle } from '../types';
import { buildCandleRows } from '../lib/candleTable';
import { cn, fmtDate, fmtNum, fmtPct } from '../lib/utils';

interface Props {
  candles: Candle[];
  /** Render most-recent first (default true), TradingView data-window style. */
  descending?: boolean;
}

export function CandleTable({ candles, descending = true }: Props) {
  const rows = useMemo(
    () => buildCandleRows(candles, descending),
    [candles, descending],
  );

  if (!rows.length) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        No data.
      </div>
    );
  }

  return (
    <div data-testid="candle-table" className="h-full overflow-auto">
      <table className="w-full border-collapse text-right font-mono text-xs tabular-nums">
        <thead className="sticky top-0 z-10 bg-base-800 text-[10px] uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-2 py-1.5 text-left font-semibold">Date</th>
            <th className="px-2 py-1.5 font-semibold">Open</th>
            <th className="px-2 py-1.5 font-semibold">High</th>
            <th className="px-2 py-1.5 font-semibold">Low</th>
            <th className="px-2 py-1.5 font-semibold">Close</th>
            <th className="px-2 py-1.5 font-semibold">Change</th>
            <th className="px-2 py-1.5 font-semibold">Change %</th>
            <th className="px-2 py-1.5 font-semibold">Volume</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const up = r.changeAbs >= 0;
            const tone = up ? 'text-accent-up' : 'text-accent-down';
            return (
              <tr
                key={r.time}
                className="border-b border-base-700/40 hover:bg-base-700/40"
              >
                <td className="px-2 py-1 text-left text-slate-300">
                  {fmtDate(r.time)}
                </td>
                <td className="px-2 py-1 text-slate-300">{fmtNum(r.open)}</td>
                <td className="px-2 py-1 text-slate-300">{fmtNum(r.high)}</td>
                <td className="px-2 py-1 text-slate-300">{fmtNum(r.low)}</td>
                <td className="px-2 py-1 font-semibold text-slate-200">
                  {fmtNum(r.close)}
                </td>
                <td className={cn('px-2 py-1', tone)}>
                  {up ? '+' : ''}
                  {fmtNum(r.changeAbs)}
                </td>
                <td className={cn('px-2 py-1', tone)}>{fmtPct(r.changePct)}</td>
                <td className="px-2 py-1 text-slate-400">
                  {fmtNum(r.volume, 0)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
