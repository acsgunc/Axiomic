import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const flags = vi.hoisted(() => ({ liveAvailable: false }));

vi.mock('../../engine', () => ({ engine: {}, preloadEngine: vi.fn() }));

vi.mock('../../lib/storage', () => ({
  isStorageReady: vi.fn().mockResolvedValue(false),
  listCachedSymbols: vi.fn().mockResolvedValue([]),
  loadCandles: vi.fn().mockResolvedValue([]),
  readOpfs: vi.fn().mockResolvedValue(null),
  saveCandles: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/dataProvider', () => ({
  get liveAvailable() {
    return flags.liveAvailable;
  },
  get isDesktop() {
    return false;
  },
  get hasProxy() {
    return false;
  },
  fetchLive: vi.fn(),
  loadFromCsvFile: vi.fn(),
  loadFromNative: vi.fn(),
  loadFromProxy: vi.fn(),
  loadSample: vi.fn(() => [
    { time: 1, open: 9, high: 11, low: 8, close: 42.5, volume: 100 },
  ]),
}));

// jsdom has no ResizeObserver; the chart observes its container size.
beforeEach(() => {
  flags.liveAvailable = false;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

import { PriceTargetWorkspace } from '../PriceTargetWorkspace';

describe('PriceTargetWorkspace', () => {
  it('renders the default ladder with a highlighted 0% base row', () => {
    render(<PriceTargetWorkspace />);
    // Default base price 100 → 0% target is 100.00.
    expect(screen.getByText('+5%')).toBeInTheDocument();
    expect(screen.getByText('-100%')).toBeInTheDocument();
    expect(screen.getByText('+500%')).toBeInTheDocument();
  });

  it('recomputes targets when a manual base price is set', () => {
    render(<PriceTargetWorkspace />);
    const input = screen.getByLabelText('Base price') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set price' }));
    // +5% of 200 = 210.00, and the current-price readout updates.
    expect(screen.getByText('210.00')).toBeInTheDocument();
  });

  it('resolves a base price from a ticker via the sample fallback', async () => {
    render(<PriceTargetWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: 'Ticker' }));
    const input = screen.getByLabelText('Stock ticker') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'aapl' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use last price' }));
    // loadSample returns a candle with close 42.5 → becomes the base price
    // (shown in the readout and the 0% ladder row).
    await waitFor(() =>
      expect(screen.getAllByText('42.50').length).toBeGreaterThan(0),
    );
  });
});
