/**
 * Pure helpers for the TradingView-style chart "Replay" feature.
 *
 * Replay reveals a historical candle series one bar at a time. These helpers
 * hold the small, side-effect-free math so it can be unit-tested directly; the
 * stateful playback lives in `useChartReplay`.
 */

/** Selectable playback speeds, in **bars per second**. */
export const REPLAY_SPEEDS = [0.5, 1, 2, 3, 5, 10] as const;

export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];

/** Converts a bars-per-second speed into a setInterval delay (ms), clamped. */
export function replayIntervalMs(speed: number): number {
  const s = speed > 0 ? speed : 1;
  return Math.max(20, Math.round(1000 / s));
}

/**
 * Clamps a desired "bars revealed" count into the valid `[1, total]` range
 * (or `0` when there is no data). The value is rounded to a whole bar.
 */
export function clampReplayIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(total, Math.max(1, Math.round(index)));
}

/**
 * Maps a (possibly fractional) logical x-coordinate from the chart to the
 * number of bars that should be revealed when the user clicks there to set the
 * replay start. Clicking bar index `L` reveals `L + 1` bars (inclusive).
 */
export function replayIndexFromLogical(logical: number, total: number): number {
  return clampReplayIndex(Math.floor(logical) + 1, total);
}
