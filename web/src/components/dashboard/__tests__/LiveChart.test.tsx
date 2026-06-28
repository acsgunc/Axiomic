import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Candle } from '../../../types';

// lightweight-charts does not render under jsdom, so stub it with a fake chart
// that records visible-range calls we can assert against.
const fake = vi.hoisted(() => {
  const timeScale = {
    setVisibleLogicalRange: vi.fn(),
    fitContent: vi.fn(),
    subscribeVisibleLogicalRangeChange: vi.fn(),
    unsubscribeVisibleLogicalRangeChange: vi.fn(),
    coordinateToLogical: (x: number) => x / 10,
    logicalToCoordinate: (l: number) => l * 10,
  };
  const series = {
    setData: vi.fn(),
    update: vi.fn(),
    applyOptions: vi.fn(),
    coordinateToPrice: (y: number) => 100 - y,
    priceToCoordinate: (p: number) => 100 - p,
  };
  const chart = {
    addCandlestickSeries: vi.fn(() => series),
    addHistogramSeries: vi.fn(() => series),
    priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
    timeScale: vi.fn(() => timeScale),
    remove: vi.fn(),
  };
  return { timeScale, series, chart };
});

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => fake.chart),
  ColorType: { Solid: 'solid' },
  CrosshairMode: { Normal: 0 },
}));

import { LiveChart } from '../LiveChart';

function makeCandles(n: number): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    time: 1700000000 + i * 60,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 10,
  }));
}

beforeEach(() => {
  fake.timeScale.setVisibleLogicalRange.mockClear();
  fake.timeScale.fitContent.mockClear();
  // jsdom lacks ResizeObserver, used by the measure overlay.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe('LiveChart — context menu', () => {
  it('opens a context menu with Reset Chart View on right-click', () => {
    const { container } = render(<LiveChart candles={makeCandles(10)} />);
    fireEvent.contextMenu(container.firstChild as Element);
    expect(
      screen.getByRole('menuitem', { name: 'Reset Chart View' }),
    ).toBeInTheDocument();
  });

  it('Reset Chart View fits content when there are few bars', () => {
    const { container } = render(<LiveChart candles={makeCandles(10)} />);
    fake.timeScale.fitContent.mockClear();
    fireEvent.contextMenu(container.firstChild as Element);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reset Chart View' }));
    expect(fake.timeScale.fitContent).toHaveBeenCalled();
  });

  it('Reset Chart View sets a recent window when there are many bars', () => {
    const { container } = render(<LiveChart candles={makeCandles(300)} />);
    fake.timeScale.setVisibleLogicalRange.mockClear();
    fireEvent.contextMenu(container.firstChild as Element);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reset Chart View' }));
    expect(fake.timeScale.setVisibleLogicalRange).toHaveBeenCalled();
  });
});

describe('LiveChart — measure tool', () => {
  it('lists a Measure item in the context menu', () => {
    const { container } = render(<LiveChart candles={makeCandles(20)} />);
    fireEvent.contextMenu(container.firstChild as Element);
    expect(screen.getByRole('menuitem', { name: 'Measure' })).toBeInTheDocument();
  });

  it('Shift + right-click arms the measure tool instead of opening the menu', () => {
    const { container, getByTestId } = render(<LiveChart candles={makeCandles(20)} />);
    fireEvent.contextMenu(container.firstChild as Element, { shiftKey: true });
    // No context menu shown…
    expect(screen.queryByRole('menu')).toBeNull();
    // …and the measure overlay is now armed (captures pointer input).
    expect(getByTestId('chart-measure')).toHaveAttribute('data-active', 'true');
  });

  it('selecting Measure from the menu arms the tool', () => {
    const { container, getByTestId } = render(<LiveChart candles={makeCandles(20)} />);
    fireEvent.contextMenu(container.firstChild as Element);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Measure' }));
    expect(getByTestId('chart-measure')).toHaveAttribute('data-active', 'true');
  });
});
