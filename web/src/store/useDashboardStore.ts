/**
 * Live dashboard state (Zustand).
 *
 * Owns the chart count and the per-pane configuration (data source, symbol,
 * interval). The whole layout is persisted to localStorage so the user's last
 * choice — including each pane's symbol/timeframe — is restored on reload.
 *
 * Panes are stored as a fixed-length array of {@link MAX_CHARTS}; the dashboard
 * renders the first `chartCount` of them. Keeping the tail around means hidden
 * panes retain their configuration when the user shrinks then re-grows the grid.
 */

import { create } from 'zustand';
import {
  CHART_COUNTS,
  MAX_CHARTS,
  isChartCount,
  type ChartCount,
} from '../lib/gridLayout';
import {
  defaultInterval,
  resolveSource,
  supportsInterval,
  type IntervalId,
} from '../lib/marketData';

/** Per-pane configuration. */
export interface PaneConfig {
  /** Stable id used as the React key and for targeted updates. */
  id: string;
  /** Market-data source id (see the registry). */
  sourceId: string;
  /** Symbol/ticker within that source. */
  symbol: string;
  /** Chart interval/timeframe. */
  interval: IntervalId;
}

const STORAGE_KEY = 'axiomic.dashboard';
const DEFAULT_CHART_COUNT: ChartCount = 4;

/**
 * Default pane line-up that showcases the breadth of sources: live crypto via
 * Hyperliquid plus US / Singapore / India equities via yfinance.
 */
const DEFAULT_PANES: PaneConfig[] = [
  { id: 'pane-1', sourceId: 'hyperliquid', symbol: 'BTC', interval: '1h' },
  { id: 'pane-2', sourceId: 'hyperliquid', symbol: 'ETH', interval: '1h' },
  { id: 'pane-3', sourceId: 'hyperliquid', symbol: 'SOL', interval: '15m' },
  { id: 'pane-4', sourceId: 'yfinance', symbol: 'AAPL', interval: '1d' },
  { id: 'pane-5', sourceId: 'hyperliquid', symbol: 'DOGE', interval: '5m' },
  { id: 'pane-6', sourceId: 'yfinance', symbol: 'NVDA', interval: '1d' },
  { id: 'pane-7', sourceId: 'yfinance', symbol: 'D05.SI', interval: '1d' },
  { id: 'pane-8', sourceId: 'yfinance', symbol: 'RELIANCE.NS', interval: '1d' },
];

interface PersistedState {
  chartCount: ChartCount;
  panes: PaneConfig[];
}

/** Coerces a possibly-untrusted pane into a valid one (source/interval exist). */
function sanitizePane(raw: unknown, fallback: PaneConfig): PaneConfig {
  if (!raw || typeof raw !== 'object') return fallback;
  const p = raw as Partial<PaneConfig>;
  const source = resolveSource(p.sourceId);
  const symbol =
    typeof p.symbol === 'string' && p.symbol.trim()
      ? p.symbol.trim().toUpperCase()
      : fallback.symbol;
  const interval =
    typeof p.interval === 'string' && supportsInterval(source, p.interval as IntervalId)
      ? (p.interval as IntervalId)
      : defaultInterval(source);
  return { id: fallback.id, sourceId: source.id, symbol, interval };
}

/** Reads + validates persisted dashboard state, falling back to defaults. */
function loadPersisted(): PersistedState {
  const base: PersistedState = {
    chartCount: DEFAULT_CHART_COUNT,
    panes: DEFAULT_PANES,
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    const chartCount = isChartCount(parsed.chartCount)
      ? parsed.chartCount
      : DEFAULT_CHART_COUNT;
    const storedPanes = Array.isArray(parsed.panes) ? parsed.panes : [];
    const panes = DEFAULT_PANES.map((fallback, i) =>
      sanitizePane(storedPanes[i], fallback),
    );
    return { chartCount, panes };
  } catch {
    return base;
  }
}

function persist(state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures (private mode); state still applies in-session.
  }
}

interface DashboardState {
  chartCount: ChartCount;
  /** Always {@link MAX_CHARTS} long; render `panes.slice(0, chartCount)`. */
  panes: PaneConfig[];

  setChartCount: (count: ChartCount) => void;
  setPaneSource: (id: string, sourceId: string) => void;
  setPaneSymbol: (id: string, symbol: string) => void;
  setPaneInterval: (id: string, interval: IntervalId) => void;
}

export const useDashboardStore = create<DashboardState>((set, get) => {
  const initial = loadPersisted();

  const save = () => persist({ chartCount: get().chartCount, panes: get().panes });

  return {
    chartCount: initial.chartCount,
    panes: initial.panes,

    setChartCount(count) {
      if (!isChartCount(count)) return;
      set({ chartCount: count });
      save();
    },

    setPaneSource(id, sourceId) {
      set((state) => ({
        panes: state.panes.map((pane) => {
          if (pane.id !== id) return pane;
          const source = resolveSource(sourceId);
          // Keep the pane's interval if the new source supports it; else reset.
          const interval = supportsInterval(source, pane.interval)
            ? pane.interval
            : defaultInterval(source);
          // Reset to the source's first curated symbol for a sane default.
          const symbol = source.symbols[0]?.symbol ?? pane.symbol;
          return { ...pane, sourceId: source.id, symbol, interval };
        }),
      }));
      save();
    },

    setPaneSymbol(id, symbol) {
      const next = symbol.trim().toUpperCase();
      if (!next) return;
      set((state) => ({
        panes: state.panes.map((pane) =>
          pane.id === id ? { ...pane, symbol: next } : pane,
        ),
      }));
      save();
    },

    setPaneInterval(id, interval) {
      set((state) => ({
        panes: state.panes.map((pane) =>
          pane.id === id ? { ...pane, interval } : pane,
        ),
      }));
      save();
    },
  };
});

/** Exposed for tests/diagnostics. */
export const DASHBOARD_STORAGE_KEY = STORAGE_KEY;
export { CHART_COUNTS };
