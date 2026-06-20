/**
 * Global application state (Zustand).
 *
 * Holds the watchlist, the active symbol, loaded candle data per symbol,
 * indicator configuration, and async loading status. Analysis itself lives in
 * the WASM engine; this store only orchestrates data flow and persistence.
 */

import { create } from 'zustand';
import { engine } from '../engine';
import {
  fetchLive,
  liveAvailable,
  loadFromCsvFile,
  loadFromNative,
  loadFromProxy,
  loadSample,
  type NativeProvider,
} from '../lib/dataProvider';
import {
  isStorageReady,
  listCachedSymbols,
  loadCandles,
  readOpfs,
  saveCandles,
} from '../lib/storage';
import type { Candle, IndicatorConfig } from '../types';

/** Stable empty reference to avoid re-render loops when a symbol has no data. */
const EMPTY_CANDLES: Candle[] = [];

/** How the app sources candles when a symbol is selected. */
export type DataMode = 'live' | 'local';

const DATA_MODE_KEY = 'axiomic.dataMode';

/** Reads the persisted data mode, defaulting to 'local' (safe/offline). */
function initialDataMode(): DataMode {
  if (!liveAvailable) return 'local';
  try {
    return localStorage.getItem(DATA_MODE_KEY) === 'live' ? 'live' : 'local';
  } catch {
    return 'local';
  }
}

const DEFAULT_INDICATORS: IndicatorConfig[] = [
  { id: 'sma20', kind: 'sma', period: 20, enabled: true, color: '#3b82f6' },
  { id: 'ema50', kind: 'ema', period: 50, enabled: true, color: '#f59e0b' },
  { id: 'boll', kind: 'bollinger', period: 20, enabled: false, color: '#8b5cf6' },
  { id: 'rsi', kind: 'rsi', period: 14, enabled: true, color: '#22d3ee' },
  { id: 'macd', kind: 'macd', period: 12, enabled: false, color: '#ec4899' },
];

interface AppState {
  watchlist: string[];
  activeSymbol: string;
  candlesBySymbol: Record<string, Candle[]>;
  indicators: IndicatorConfig[];
  provider: NativeProvider;
  dataMode: DataMode;
  loading: boolean;
  error: string | null;
  storageReady: boolean;

  init: () => Promise<void>;
  setActiveSymbol: (symbol: string) => Promise<void>;
  addSymbol: (symbol: string) => void;
  removeSymbol: (symbol: string) => void;
  loadCsv: (file: File) => Promise<void>;
  loadProxy: (symbol: string) => Promise<void>;
  loadNative: (symbol: string) => Promise<void>;
  setProvider: (provider: NativeProvider) => void;
  setDataMode: (mode: DataMode) => void;
  refreshActive: () => Promise<void>;
  loadSampleData: (symbol: string) => Promise<void>;
  toggleIndicator: (id: string) => void;
  setIndicatorPeriod: (id: string, period: number) => void;
  clearError: () => void;
}

export const useStore = create<AppState>((set, get) => ({
  watchlist: ['AAPL', 'MSFT', 'NVDA'],
  activeSymbol: 'AAPL',
  candlesBySymbol: {},
  indicators: DEFAULT_INDICATORS,
  provider: 'yfinance',
  dataMode: initialDataMode(),
  loading: false,
  error: null,
  storageReady: false,

  async init() {
    const ready = await isStorageReady();
    set({ storageReady: ready });

    // Merge any previously cached symbols into the watchlist.
    if (ready) {
      const cached = await listCachedSymbols();
      if (cached.length) {
        set((s) => ({
          watchlist: Array.from(new Set([...s.watchlist, ...cached])),
        }));
      }
    }
    await get().setActiveSymbol(get().activeSymbol);
  },

  async setActiveSymbol(symbol) {
    set({ activeSymbol: symbol, error: null });
    if (get().candlesBySymbol[symbol]) return;

    set({ loading: true });
    try {
      let candles: Candle[] | null = null;

      // Live mode: fetch fresh data first; fall back to local on failure.
      if (get().dataMode === 'live' && liveAvailable) {
        try {
          candles = await fetchLive(symbol, get().provider);
          if (get().storageReady && candles.length) {
            await saveCandles(symbol, candles);
          }
        } catch (err) {
          set({
            error: `Live fetch failed (${errMsg(err)}). Showing local data.`,
          });
          candles = null;
        }
      }

      // Local path: persistent stores first, then generated sample data.
      if (!candles) {
        if (get().storageReady) {
          candles = await loadCandles(symbol);
          if (!candles.length) candles = null;
        }
        if (!candles) candles = await readOpfs(symbol);
        if (!candles || !candles.length) {
          candles = loadSample(symbol);
          if (get().storageReady) await saveCandles(symbol, candles);
        }
      }
      set((s) => ({
        candlesBySymbol: { ...s.candlesBySymbol, [symbol]: candles! },
      }));
    } catch (err) {
      set({ error: errMsg(err) });
    } finally {
      set({ loading: false });
    }
  },

  addSymbol(symbol) {
    const s = symbol.trim().toUpperCase();
    if (!s) return;
    set((state) =>
      state.watchlist.includes(s)
        ? state
        : { watchlist: [...state.watchlist, s] },
    );
  },

  removeSymbol(symbol) {
    set((state) => {
      const watchlist = state.watchlist.filter((s) => s !== symbol);
      const activeSymbol =
        state.activeSymbol === symbol
          ? watchlist[0] ?? ''
          : state.activeSymbol;
      return { watchlist, activeSymbol };
    });
  },

  async loadCsv(file) {
    set({ loading: true, error: null });
    try {
      const candles = await loadFromCsvFile(file);
      const symbol = file.name.replace(/\.csv$/i, '').toUpperCase() || 'IMPORT';
      get().addSymbol(symbol);
      set((s) => ({
        candlesBySymbol: { ...s.candlesBySymbol, [symbol]: candles },
        activeSymbol: symbol,
      }));
      if (get().storageReady) await saveCandles(symbol, candles);
    } catch (err) {
      set({ error: errMsg(err) });
    } finally {
      set({ loading: false });
    }
  },

  async loadProxy(symbol) {
    const s = symbol.trim().toUpperCase();
    set({ loading: true, error: null });
    try {
      const candles = await loadFromProxy(s);
      get().addSymbol(s);
      set((state) => ({
        candlesBySymbol: { ...state.candlesBySymbol, [s]: candles },
        activeSymbol: s,
      }));
      if (get().storageReady) await saveCandles(s, candles);
    } catch (err) {
      set({ error: errMsg(err) });
    } finally {
      set({ loading: false });
    }
  },

  async loadNative(symbol) {
    const s = symbol.trim().toUpperCase();
    set({ loading: true, error: null });
    try {
      const candles = await loadFromNative(s, get().provider);
      get().addSymbol(s);
      set((state) => ({
        candlesBySymbol: { ...state.candlesBySymbol, [s]: candles },
        activeSymbol: s,
      }));
      if (get().storageReady) await saveCandles(s, candles);
    } catch (err) {
      set({ error: errMsg(err) });
    } finally {
      set({ loading: false });
    }
  },

  setProvider(provider) {
    set({ provider });
  },

  setDataMode(mode) {
    try {
      localStorage.setItem(DATA_MODE_KEY, mode);
    } catch {
      // Ignore storage failures (e.g. private mode); mode still applies in-session.
    }
    set({ dataMode: mode });
    // Switching to live should immediately refresh the active symbol.
    if (mode === 'live' && liveAvailable) void get().refreshActive();
  },

  async refreshActive() {
    const symbol = get().activeSymbol;
    if (!symbol) return;
    // Drop the cached copy so setActiveSymbol re-sources it per the current mode.
    set((s) => {
      const next = { ...s.candlesBySymbol };
      delete next[symbol];
      return { candlesBySymbol: next };
    });
    await get().setActiveSymbol(symbol);
  },

  async loadSampleData(symbol) {
    const s = symbol.trim().toUpperCase();
    set({ loading: true, error: null });
    try {
      const candles = loadSample(s);
      get().addSymbol(s);
      set((state) => ({
        candlesBySymbol: { ...state.candlesBySymbol, [s]: candles },
        activeSymbol: s,
      }));
      if (get().storageReady) await saveCandles(s, candles);
    } catch (err) {
      set({ error: errMsg(err) });
    } finally {
      set({ loading: false });
    }
  },

  toggleIndicator(id) {
    set((state) => ({
      indicators: state.indicators.map((i) =>
        i.id === id ? { ...i, enabled: !i.enabled } : i,
      ),
    }));
  },

  setIndicatorPeriod(id, period) {
    set((state) => ({
      indicators: state.indicators.map((i) =>
        i.id === id ? { ...i, period: Math.max(1, period) } : i,
      ),
    }));
  },

  clearError() {
    set({ error: null });
  },
}));

// Keep the engine reference alive for tree-shaking clarity.
void engine;

/**
 * Selects the active symbol's candles with a referentially stable empty
 * fallback, preventing the re-render loop that a `?? []` selector would cause.
 */
export function useActiveCandles(): Candle[] {
  return useStore((s) => s.candlesBySymbol[s.activeSymbol] ?? EMPTY_CANDLES);
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
