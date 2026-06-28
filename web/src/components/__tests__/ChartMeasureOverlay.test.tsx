import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ISeriesApi, SeriesType } from 'lightweight-charts';
import {
  ChartMeasureOverlay,
  measurementInfo,
} from '../ChartMeasureOverlay';
import type { Candle } from '../../types';

function makeFakeChart() {
  const timeScale = {
    coordinateToLogical: (x: number) => x / 10,
    logicalToCoordinate: (l: number) => l * 10,
    subscribeVisibleLogicalRangeChange: vi.fn(),
    unsubscribeVisibleLogicalRangeChange: vi.fn(),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chart = { timeScale: () => timeScale } as any;
  const series = {
    coordinateToPrice: (y: number) => 100 - y,
    priceToCoordinate: (p: number) => 100 - p,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as ISeriesApi<SeriesType>;
  return { chart, series };
}

function makeCandles(n: number): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    time: 1700000000 + i * 60, // 60s apart
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1,
  }));
}

beforeEach(() => {
  // jsdom lacks ResizeObserver, used by the overlay.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe('measurementInfo', () => {
  const candles = makeCandles(20);

  it('reports a positive price delta, percent, bars and time', () => {
    const info = measurementInfo({ logical: 0, price: 50 }, { logical: 10, price: 70 }, candles);
    expect(info.priceDelta).toBeCloseTo(20);
    expect(info.pct).toBeCloseTo(40);
    expect(info.bars).toBe(10);
    expect(info.up).toBe(true);
    expect(info.line1).toBe('+20.00 (+40.00%)');
    expect(info.line2).toBe('10 bars · 10m'); // 10 × 60s
  });

  it('reports a negative move when the price drops', () => {
    const info = measurementInfo({ logical: 0, price: 70 }, { logical: 5, price: 50 }, candles);
    expect(info.up).toBe(false);
    expect(info.line1).toBe('-20.00 (-28.57%)');
    expect(info.line2).toBe('5 bars · 5m');
  });

  it('singularises a one-bar span and omits time when out of range', () => {
    const info = measurementInfo({ logical: 0, price: 100 }, { logical: 1, price: 100 }, []);
    expect(info.line2).toBe('1 bar');
  });
});

describe('ChartMeasureOverlay', () => {
  it('is inert (no pointer events) when inactive', () => {
    const { chart, series } = makeFakeChart();
    render(
      <ChartMeasureOverlay chart={chart} series={series} candles={makeCandles(20)} active={false} />,
    );
    const svg = screen.getByTestId('chart-measure');
    expect(svg).toHaveAttribute('data-active', 'false');
    expect(svg).toHaveStyle({ pointerEvents: 'none' });
  });

  it('captures pointer input when active', () => {
    const { chart, series } = makeFakeChart();
    render(<ChartMeasureOverlay chart={chart} series={series} candles={makeCandles(20)} active />);
    const svg = screen.getByTestId('chart-measure');
    expect(svg).toHaveAttribute('data-active', 'true');
    expect(svg).toHaveStyle({ pointerEvents: 'auto' });
  });

  it('renders above the chart canvases (z-index > 2) so it can receive input', () => {
    // lightweight-charts paints its canvases at z-index 1 & 2; the overlay must
    // sit above them or the canvas swallows every pointer event (regression).
    const { chart, series } = makeFakeChart();
    render(<ChartMeasureOverlay chart={chart} series={series} candles={makeCandles(20)} active />);
    const z = Number(screen.getByTestId('chart-measure').style.zIndex);
    expect(z).toBeGreaterThan(2);
  });

  it('Escape dismisses the tool via onComplete', () => {
    const onComplete = vi.fn();
    const { chart, series } = makeFakeChart();
    render(
      <ChartMeasureOverlay
        chart={chart}
        series={series}
        candles={makeCandles(20)}
        active
        onComplete={onComplete}
      />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('right-click while active cancels the tool', () => {
    const onComplete = vi.fn();
    const { chart, series } = makeFakeChart();
    render(
      <ChartMeasureOverlay
        chart={chart}
        series={series}
        candles={makeCandles(20)}
        active
        onComplete={onComplete}
      />,
    );
    fireEvent.contextMenu(screen.getByTestId('chart-measure'));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
