/**
 * Stateful controller for the chart "Replay" feature (TradingView-style).
 *
 * Tracks how many bars of a historical series are currently revealed and drives
 * playback (advance one bar per tick at the selected speed). The owning chart
 * slices its candles to `index` and re-renders, so indicators and the price
 * series reveal progressively. Pure math lives in `./replay`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { clampReplayIndex, replayIntervalMs } from './replay';

export interface ChartReplay {
  /** Replay mode is engaged (chart is showing a truncated prefix). */
  active: boolean;
  /** Waiting for the user to click a bar to set the start point. */
  selecting: boolean;
  /** Playback timer is running. */
  playing: boolean;
  /** Playback speed in bars per second. */
  speed: number;
  /** Number of bars currently revealed (1..total). */
  index: number;
  /** Total number of bars available. */
  total: number;
  /** Whether the last bar has been reached. */
  atEnd: boolean;

  /** Arm replay and wait for a start-bar click. */
  start(): void;
  /** Set the revealed-bar count (e.g. from a chart click) and stop selecting. */
  pick(index: number): void;
  play(): void;
  pause(): void;
  togglePlay(): void;
  stepForward(): void;
  stepBack(): void;
  setSpeed(speed: number): void;
  /** Leave replay mode and restore the full series. */
  exit(): void;
}

/** Default start position: reveal ~60% of history, leaving room to play forward. */
function defaultStart(total: number): number {
  return clampReplayIndex(Math.floor(total * 0.6), total);
}

export function useChartReplay(total: number): ChartReplay {
  const [active, setActive] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const [index, setIndex] = useState(0);

  // Reset everything when the underlying data size changes (new symbol/timeframe).
  const prevTotal = useRef(total);
  useEffect(() => {
    if (prevTotal.current !== total) {
      prevTotal.current = total;
      setActive(false);
      setSelecting(false);
      setPlaying(false);
      setIndex(0);
    }
  }, [total]);

  const atEnd = index >= total;

  // Playback timer: advance one bar per tick until the end.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setIndex((i) => (i >= total ? i : i + 1));
    }, replayIntervalMs(speed));
    return () => clearInterval(id);
  }, [playing, speed, total]);

  // Stop automatically once the end is reached.
  useEffect(() => {
    if (playing && index >= total) setPlaying(false);
  }, [playing, index, total]);

  const start = useCallback(() => {
    if (total <= 0) return;
    setActive(true);
    setSelecting(true);
    setPlaying(false);
    setIndex((i) => (i > 0 && i < total ? i : defaultStart(total)));
  }, [total]);

  const pick = useCallback(
    (i: number) => {
      setIndex(clampReplayIndex(i, total));
      setSelecting(false);
      setActive(true);
    },
    [total],
  );

  const play = useCallback(() => {
    setSelecting(false);
    setIndex((i) => {
      if (i >= total) return i; // nothing left to play
      setPlaying(true);
      return i;
    });
  }, [total]);

  const pause = useCallback(() => setPlaying(false), []);

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      if (p) return false;
      setSelecting(false);
      return index < total;
    });
  }, [index, total]);

  const stepForward = useCallback(() => {
    setPlaying(false);
    setSelecting(false);
    setIndex((i) => clampReplayIndex(i + 1, total));
  }, [total]);

  const stepBack = useCallback(() => {
    setPlaying(false);
    setSelecting(false);
    setIndex((i) => clampReplayIndex(i - 1, total));
  }, [total]);

  const setSpeed = useCallback((s: number) => setSpeedState(s), []);

  const exit = useCallback(() => {
    setActive(false);
    setSelecting(false);
    setPlaying(false);
    setIndex(0);
  }, []);

  return {
    active,
    selecting,
    playing,
    speed,
    index,
    total,
    atEnd,
    start,
    pick,
    play,
    pause,
    togglePlay,
    stepForward,
    stepBack,
    setSpeed,
    exit,
  };
}
