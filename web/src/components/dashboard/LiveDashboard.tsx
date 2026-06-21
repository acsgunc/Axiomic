/**
 * Live multi-chart dashboard: a "Number of charts" selector over a responsive
 * grid of independent live panes. The chart count and every pane's
 * source/symbol/timeframe are persisted, so the layout is restored on reload.
 */

import { CHART_COUNTS, useDashboardStore } from '../../store/useDashboardStore';
import { cn } from '../../lib/utils';
import { ChartGrid } from './ChartGrid';

export function LiveDashboard() {
  const chartCount = useDashboardStore((s) => s.chartCount);
  const setChartCount = useDashboardStore((s) => s.setChartCount);
  const panes = useDashboardStore((s) => s.panes);

  const visiblePanes = panes.slice(0, chartCount);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-base-700 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-400">
            Number of charts
          </span>
          <div
            className="flex rounded-md border border-base-700 p-0.5"
            role="group"
            aria-label="Number of charts"
          >
            {CHART_COUNTS.map((count) => (
              <button
                key={count}
                onClick={() => setChartCount(count)}
                aria-pressed={chartCount === count}
                className={cn(
                  'min-w-[2rem] rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  chartCount === count
                    ? 'bg-accent text-white'
                    : 'text-slate-300 hover:bg-base-700',
                )}
              >
                {count}
              </button>
            ))}
          </div>
        </div>
        <span className="hidden text-[11px] text-slate-500 sm:inline">
          Live crypto via Hyperliquid · equities via yfinance — each pane is
          independent
        </span>
      </div>

      <ChartGrid panes={visiblePanes} />
    </div>
  );
}
