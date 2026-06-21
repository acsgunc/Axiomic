import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MAX_CHARTS } from '../../lib/gridLayout';

const STORAGE_KEY = 'axiomic.dashboard';

/** Re-imports the store fresh so it re-reads localStorage at module init. */
async function freshStore() {
  vi.resetModules();
  const mod = await import('../useDashboardStore');
  return mod.useDashboardStore;
}

beforeEach(() => {
  localStorage.clear();
});

describe('useDashboardStore defaults', () => {
  it('starts with 4 charts and a full MAX_CHARTS pane line-up', async () => {
    const useStore = await freshStore();
    const { chartCount, panes } = useStore.getState();
    expect(chartCount).toBe(4);
    expect(panes).toHaveLength(MAX_CHARTS);
  });

  it('showcases crypto + US/SG/India equity sources by default', async () => {
    const useStore = await freshStore();
    const { panes } = useStore.getState();
    const sources = new Set(panes.map((p) => p.sourceId));
    expect(sources).toContain('hyperliquid');
    expect(sources).toContain('yfinance');
    expect(panes.map((p) => p.symbol)).toContain('D05.SI'); // Singapore
    expect(panes.map((p) => p.symbol)).toContain('RELIANCE.NS'); // India
  });
});

describe('useDashboardStore mutations persist', () => {
  it('persists the chart count', async () => {
    const useStore = await freshStore();
    useStore.getState().setChartCount(8);
    expect(useStore.getState().chartCount).toBe(8);
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.chartCount).toBe(8);
  });

  it('ignores invalid chart counts', async () => {
    const useStore = await freshStore();
    useStore.getState().setChartCount(3 as never);
    expect(useStore.getState().chartCount).toBe(4);
  });

  it('uppercases and persists a custom symbol', async () => {
    const useStore = await freshStore();
    const id = useStore.getState().panes[0].id;
    useStore.getState().setPaneSymbol(id, 'btc');
    expect(useStore.getState().panes[0].symbol).toBe('BTC');
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.panes[0].symbol).toBe('BTC');
  });

  it('resets symbol/interval when switching a pane to another source', async () => {
    const useStore = await freshStore();
    const id = useStore.getState().panes[3].id; // an equity pane
    useStore.getState().setPaneSource(id, 'hyperliquid');
    const pane = useStore.getState().panes[3];
    expect(pane.sourceId).toBe('hyperliquid');
    // Symbol reset to the source's first curated symbol.
    expect(pane.symbol).toBe('BTC');
  });

  it('updates a pane interval', async () => {
    const useStore = await freshStore();
    const id = useStore.getState().panes[0].id;
    useStore.getState().setPaneInterval(id, '5m');
    expect(useStore.getState().panes[0].interval).toBe('5m');
  });
});

describe('useDashboardStore persistence + validation', () => {
  it('restores a previously saved layout', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        chartCount: 2,
        panes: [{ id: 'x', sourceId: 'hyperliquid', symbol: 'ETH', interval: '15m' }],
      }),
    );
    const useStore = await freshStore();
    expect(useStore.getState().chartCount).toBe(2);
    expect(useStore.getState().panes[0].symbol).toBe('ETH');
    expect(useStore.getState().panes[0].interval).toBe('15m');
  });

  it('falls back to defaults on corrupt storage', async () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    const useStore = await freshStore();
    expect(useStore.getState().chartCount).toBe(4);
    expect(useStore.getState().panes).toHaveLength(MAX_CHARTS);
  });

  it('sanitises an unknown source/interval to safe values', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        chartCount: 4,
        panes: [{ id: 'x', sourceId: 'nope', symbol: 'ZZZ', interval: 'bogus' }],
      }),
    );
    const useStore = await freshStore();
    const pane = useStore.getState().panes[0];
    expect(pane.sourceId).toBe('hyperliquid'); // resolved to default
    expect(hyperliquidIntervals()).toContain(pane.interval);
    expect(pane.symbol).toBe('ZZZ'); // free-form symbol retained, upper-cased
  });
});

function hyperliquidIntervals(): string[] {
  return ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];
}
