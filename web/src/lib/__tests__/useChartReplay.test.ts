import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useChartReplay } from '../useChartReplay';

afterEach(() => {
  vi.useRealTimers();
});

describe('useChartReplay', () => {
  it('is inactive by default', () => {
    const { result } = renderHook(() => useChartReplay(100));
    expect(result.current.active).toBe(false);
    expect(result.current.index).toBe(0);
    expect(result.current.total).toBe(100);
  });

  it('start() arms selecting mode with a sensible default position', () => {
    const { result } = renderHook(() => useChartReplay(100));
    act(() => result.current.start());
    expect(result.current.active).toBe(true);
    expect(result.current.selecting).toBe(true);
    expect(result.current.index).toBe(60); // ~60% of 100
  });

  it('pick() sets the revealed count and stops selecting', () => {
    const { result } = renderHook(() => useChartReplay(100));
    act(() => result.current.pick(42));
    expect(result.current.active).toBe(true);
    expect(result.current.selecting).toBe(false);
    expect(result.current.index).toBe(42);
  });

  it('stepForward / stepBack move one bar and clamp', () => {
    const { result } = renderHook(() => useChartReplay(10));
    act(() => result.current.pick(9));
    act(() => result.current.stepForward());
    expect(result.current.index).toBe(10);
    act(() => result.current.stepForward()); // clamp at total
    expect(result.current.index).toBe(10);
    act(() => result.current.stepBack());
    expect(result.current.index).toBe(9);
  });

  it('play() advances one bar per tick and stops at the end', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useChartReplay(5));
    act(() => result.current.pick(3));
    act(() => {
      result.current.setSpeed(1); // 1000ms/bar
      result.current.play();
    });
    expect(result.current.playing).toBe(true);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.index).toBe(4);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.index).toBe(5);
    // Reached the end → playback stops, index pinned.
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.index).toBe(5);
    expect(result.current.playing).toBe(false);
    expect(result.current.atEnd).toBe(true);
  });

  it('exit() leaves replay and resets the index', () => {
    const { result } = renderHook(() => useChartReplay(100));
    act(() => result.current.pick(50));
    act(() => result.current.exit());
    expect(result.current.active).toBe(false);
    expect(result.current.index).toBe(0);
  });

  it('resets when the total bar count changes', () => {
    const { result, rerender } = renderHook(({ total }) => useChartReplay(total), {
      initialProps: { total: 100 },
    });
    act(() => result.current.pick(50));
    expect(result.current.active).toBe(true);
    rerender({ total: 250 });
    expect(result.current.active).toBe(false);
    expect(result.current.index).toBe(0);
    expect(result.current.total).toBe(250);
  });
});
