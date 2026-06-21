import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CHART_TYPE_LABELS,
  downloadChartsScreenshot,
  isOhlcType,
  nextDrawingId,
  type ChartType,
} from '../chart';

describe('isOhlcType', () => {
  it('treats candles, bars and heikin-ashi as OHLC types', () => {
    expect(isOhlcType('candles')).toBe(true);
    expect(isOhlcType('bars')).toBe(true);
    expect(isOhlcType('heikin-ashi')).toBe(true);
  });

  it('treats line and area as non-OHLC (close-based) types', () => {
    expect(isOhlcType('line')).toBe(false);
    expect(isOhlcType('area')).toBe(false);
  });

  it('has a human label for every chart type', () => {
    const types: ChartType[] = ['candles', 'bars', 'line', 'area', 'heikin-ashi'];
    for (const t of types) {
      expect(CHART_TYPE_LABELS[t]).toBeTruthy();
    }
  });
});

describe('nextDrawingId', () => {
  it('produces unique, prefixed, monotonically increasing ids', () => {
    const a = nextDrawingId('t');
    const b = nextDrawingId('t');
    const c = nextDrawingId('h');
    expect(a).not.toBe(b);
    expect(a.startsWith('t-')).toBe(true);
    expect(c.startsWith('h-')).toBe(true);
  });
});

describe('downloadChartsScreenshot', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ignores null charts and does nothing when none are present', () => {
    const clickSpy = vi.fn();
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag === 'a') return { click: clickSpy } as unknown as HTMLElement;
      throw new Error('canvas should not be created when there are no charts');
    }) as typeof document.createElement);

    expect(() => downloadChartsScreenshot([null, null], 'x.png')).not.toThrow();
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('stacks chart screenshots into one canvas and triggers a download', () => {
    // Two fake charts whose takeScreenshot returns sized canvases.
    const mkChart = (w: number, h: number) => ({
      takeScreenshot: () => ({ width: w, height: h }) as HTMLCanvasElement,
    });

    const drawn: Array<{ y: number }> = [];
    const ctx = {
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage: vi.fn((_img: unknown, _x: number, y: number) => drawn.push({ y })),
    };
    const outCanvas = {
      width: 0,
      height: 0,
      getContext: () => ctx,
      toDataURL: () => 'data:image/png;base64,AAAA',
    };
    const link: { href: string; download: string; click: ReturnType<typeof vi.fn> } = {
      href: '',
      download: '',
      click: vi.fn(),
    };
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag === 'canvas') return outCanvas as unknown as HTMLElement;
      if (tag === 'a') return link as unknown as HTMLElement;
      throw new Error(`unexpected element ${tag}`);
    }) as typeof document.createElement);

    downloadChartsScreenshot(
      [mkChart(300, 100) as never, null, mkChart(280, 80) as never],
      'AAPL.png',
    );

    // Output canvas spans the widest chart and the summed heights.
    expect(outCanvas.width).toBe(300);
    expect(outCanvas.height).toBe(180);
    // Second chart is stacked below the first.
    expect(drawn).toEqual([{ y: 0 }, { y: 100 }]);
    expect(link.download).toBe('AAPL.png');
    expect(link.click).toHaveBeenCalledTimes(1);
  });
});
