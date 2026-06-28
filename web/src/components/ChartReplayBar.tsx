/**
 * Floating control bar + start-picker overlay for the chart Replay feature.
 *
 * `ChartReplayBar` renders the playback transport (step / play-pause / speed /
 * exit) and a progress readout. `ReplaySelectOverlay` is a transparent capture
 * layer shown while the user is choosing the start bar — it sits above the
 * lightweight-charts canvases (z-index 25) so the click is registered.
 */

import type { IChartApi } from 'lightweight-charts';
import { cn } from '../lib/utils';
import { REPLAY_SPEEDS } from '../lib/replay';
import type { ChartReplay } from '../lib/useChartReplay';

interface BarProps {
  replay: ChartReplay;
  /** Compact layout for small dashboard panes. */
  compact?: boolean;
}

export function ChartReplayBar({ replay, compact = false }: BarProps) {
  if (!replay.active) return null;
  const pad = compact ? 'px-1 py-0.5' : 'px-1.5 py-1';

  return (
    <div
      className={cn(
        'pointer-events-auto absolute left-1/2 bottom-2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-base-700 bg-base-900/95 px-1.5 py-1 shadow-lg backdrop-blur-sm',
        compact ? 'text-[10px]' : 'text-xs',
      )}
      role="toolbar"
      aria-label="Replay controls"
    >
      <ReplayButton title="Step back one bar" className={pad} onClick={replay.stepBack} disabled={replay.index <= 1}>
        ⏮
      </ReplayButton>
      <ReplayButton
        title={replay.playing ? 'Pause replay' : 'Play replay'}
        className={pad}
        active={replay.playing}
        onClick={replay.togglePlay}
        disabled={replay.atEnd}
      >
        {replay.playing ? '⏸' : '▶'}
      </ReplayButton>
      <ReplayButton title="Step forward one bar" className={pad} onClick={replay.stepForward} disabled={replay.atEnd}>
        ⏭
      </ReplayButton>

      <span className="mx-0.5 h-4 w-px bg-base-700" aria-hidden />

      <select
        aria-label="Replay speed"
        value={replay.speed}
        onChange={(e) => replay.setSpeed(Number(e.target.value))}
        className="rounded border border-base-700 bg-base-800 px-1 py-0.5 text-slate-200 outline-none focus:border-accent"
      >
        {REPLAY_SPEEDS.map((s) => (
          <option key={s} value={s}>
            {s}×
          </option>
        ))}
      </select>

      <span className={cn('px-1 font-mono tabular-nums text-slate-400', compact && 'hidden sm:inline')}>
        {replay.index}/{replay.total}
      </span>

      <span className="mx-0.5 h-4 w-px bg-base-700" aria-hidden />

      <ReplayButton title="Exit replay" className={pad} onClick={replay.exit}>
        ✕
      </ReplayButton>
    </div>
  );
}

function ReplayButton({
  active,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center rounded text-slate-300 transition-colors hover:bg-base-700 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40',
        active && 'bg-accent/20 text-accent',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

interface OverlayProps {
  chart: IChartApi | null;
  /** Called with the clicked logical x-index when the user picks a start bar. */
  onPick: (logical: number) => void;
}

/** Transparent click-capture shown while choosing the replay start bar. */
export function ReplaySelectOverlay({ chart, onPick }: OverlayProps) {
  return (
    <div
      data-testid="replay-select"
      className="absolute inset-0"
      style={{ zIndex: 25, cursor: 'crosshair' }}
      onClick={(e) => {
        if (!chart) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const logical = chart.timeScale().coordinateToLogical((e.clientX - rect.left) as never);
        if (logical != null) onPick(logical as number);
      }}
    >
      <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md bg-base-900/90 px-2.5 py-1 text-[11px] font-medium text-slate-200 shadow">
        Click a bar to start replay
      </div>
    </div>
  );
}
