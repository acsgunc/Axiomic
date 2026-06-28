import { describe, it, expect } from 'vitest';
import {
  REPLAY_SPEEDS,
  clampReplayIndex,
  replayIndexFromLogical,
  replayIntervalMs,
} from '../replay';

describe('replay helpers', () => {
  it('exposes ascending playback speeds', () => {
    expect([...REPLAY_SPEEDS]).toEqual([0.5, 1, 2, 3, 5, 10]);
  });

  describe('replayIntervalMs', () => {
    it('converts bars-per-second to a millisecond delay', () => {
      expect(replayIntervalMs(1)).toBe(1000);
      expect(replayIntervalMs(2)).toBe(500);
      expect(replayIntervalMs(10)).toBe(100);
    });

    it('floors at 20ms and treats non-positive speeds as 1×', () => {
      expect(replayIntervalMs(100)).toBe(20);
      expect(replayIntervalMs(0)).toBe(1000);
      expect(replayIntervalMs(-4)).toBe(1000);
    });
  });

  describe('clampReplayIndex', () => {
    it('keeps the index within [1, total] and rounds', () => {
      expect(clampReplayIndex(0, 100)).toBe(1);
      expect(clampReplayIndex(50.4, 100)).toBe(50);
      expect(clampReplayIndex(250, 100)).toBe(100);
    });

    it('returns 0 when there is no data', () => {
      expect(clampReplayIndex(5, 0)).toBe(0);
    });
  });

  describe('replayIndexFromLogical', () => {
    it('reveals bar L+1 for a click at logical index L', () => {
      expect(replayIndexFromLogical(0, 100)).toBe(1);
      expect(replayIndexFromLogical(41.8, 100)).toBe(42);
      expect(replayIndexFromLogical(99, 100)).toBe(100);
    });

    it('clamps clicks beyond the data range', () => {
      expect(replayIndexFromLogical(500, 100)).toBe(100);
      expect(replayIndexFromLogical(-5, 100)).toBe(1);
    });
  });
});
