import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Candle } from '../../types';

const demo: Candle[] = [
  { time: 1, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
];
const live: Candle[] = [
  { time: 2, open: 2, high: 3, low: 1.5, close: 2.5, volume: 20 },
];

vi.mock('../../engine', () => ({ engine: {}, preloadEngine: vi.fn() }));

vi.mock('../../lib/storage', () => ({
  isStorageReady: vi.fn().mockResolvedValue(false),
  listCachedSymbols: vi.fn().mockResolvedValue([]),
  loadCandles: vi.fn().mockResolvedValue([]),
  readOpfs: vi.fn().mockResolvedValue(null),
  saveCandles: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/dataProvider', () => ({
  liveAvailable: true,
  fetchLive: vi.fn(),
  loadFromCsvFile: vi.fn(),
  loadFromNative: vi.fn(),
  loadFromProxy: vi.fn(),
  loadSample: vi.fn(() => demo),
}));

import { useStore } from '../useStore';
import {
  fetchLive,
  loadFromCsvFile,
  loadFromNative,
  loadSample,
} from '../../lib/dataProvider';

const mockFetchLive = fetchLive as ReturnType<typeof vi.fn>;
const mockLoadCsv = loadFromCsvFile as ReturnType<typeof vi.fn>;
const mockLoadNative = loadFromNative as ReturnType<typeof vi.fn>;
const mockLoadSample = loadSample as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockLoadSample.mockReturnValue(demo);
  useStore.setState({
    watchlist: ['AAPL', 'MSFT', 'NVDA'],
    activeSymbol: 'AAPL',
    candlesBySymbol: {},
    provider: 'yfinance',
    dataMode: 'local',
    loading: false,
    error: null,
    storageReady: false,
  });
});

describe('watchlist actions', () => {
  it('addSymbol normalizes case and whitespace', () => {
    useStore.getState().addSymbol('  tsla ');
    expect(useStore.getState().watchlist).toContain('TSLA');
  });

  it('addSymbol ignores duplicates', () => {
    const before = useStore.getState().watchlist.length;
    useStore.getState().addSymbol('aapl');
    expect(useStore.getState().watchlist.length).toBe(before);
  });

  it('addSymbol ignores empty input', () => {
    const before = useStore.getState().watchlist.length;
    useStore.getState().addSymbol('   ');
    expect(useStore.getState().watchlist.length).toBe(before);
  });

  it('removeSymbol reassigns the active symbol to the first remaining', () => {
    useStore.getState().removeSymbol('AAPL');
    const s = useStore.getState();
    expect(s.watchlist).not.toContain('AAPL');
    expect(s.activeSymbol).toBe('MSFT');
  });
});

describe('indicators', () => {
  it('toggleIndicator flips enabled', () => {
    const id = useStore.getState().indicators[0].id;
    const before = useStore.getState().indicators[0].enabled;
    useStore.getState().toggleIndicator(id);
    expect(useStore.getState().indicators[0].enabled).toBe(!before);
  });

  it('setIndicatorPeriod clamps to a minimum of 1', () => {
    const id = useStore.getState().indicators[0].id;
    useStore.getState().setIndicatorPeriod(id, 0);
    expect(useStore.getState().indicators[0].period).toBe(1);
  });
});

describe('provider + data mode', () => {
  it('setProvider updates the active provider', () => {
    useStore.getState().setProvider('yahoo');
    expect(useStore.getState().provider).toBe('yahoo');
  });

  it('setDataMode persists the choice', () => {
    useStore.getState().setDataMode('live');
    expect(useStore.getState().dataMode).toBe('live');
    expect(localStorage.getItem('axiomic.dataMode')).toBe('live');
  });

  it('switching to live refreshes the active symbol via fetchLive', async () => {
    mockFetchLive.mockResolvedValue(live);
    useStore.getState().setDataMode('live');
    // refreshActive runs asynchronously; allow microtasks to flush.
    await vi.waitFor(() =>
      expect(useStore.getState().candlesBySymbol['AAPL']).toEqual(live),
    );
    expect(mockFetchLive).toHaveBeenCalledWith('AAPL', 'yfinance');
  });
});

describe('setActiveSymbol', () => {
  it('local mode uses sample/cached data and never fetches live', async () => {
    useStore.setState({ dataMode: 'local' });
    await useStore.getState().setActiveSymbol('IBM');
    expect(mockFetchLive).not.toHaveBeenCalled();
    expect(useStore.getState().candlesBySymbol['IBM']).toEqual(demo);
  });

  it('live mode fetches fresh data', async () => {
    useStore.setState({ dataMode: 'live' });
    mockFetchLive.mockResolvedValue(live);
    await useStore.getState().setActiveSymbol('IBM');
    expect(mockFetchLive).toHaveBeenCalledWith('IBM', 'yfinance');
    expect(useStore.getState().candlesBySymbol['IBM']).toEqual(live);
  });

  it('live failure falls back to local data and records an error', async () => {
    useStore.setState({ dataMode: 'live' });
    mockFetchLive.mockRejectedValue(new Error('rate limited'));
    await useStore.getState().setActiveSymbol('IBM');
    expect(useStore.getState().candlesBySymbol['IBM']).toEqual(demo);
    expect(useStore.getState().error).toMatch(/live fetch failed/i);
  });

  it('does not refetch a symbol already in memory', async () => {
    useStore.setState({
      dataMode: 'live',
      candlesBySymbol: { IBM: demo },
    });
    await useStore.getState().setActiveSymbol('IBM');
    expect(mockFetchLive).not.toHaveBeenCalled();
  });
});

describe('loadCsv / loadNative', () => {
  it('loadCsv derives the symbol from the filename and activates it', async () => {
    mockLoadCsv.mockResolvedValue(demo);
    const file = new File(['x'], 'goog.csv', { type: 'text/csv' });
    await useStore.getState().loadCsv(file);
    const s = useStore.getState();
    expect(s.activeSymbol).toBe('GOOG');
    expect(s.watchlist).toContain('GOOG');
    expect(s.candlesBySymbol['GOOG']).toEqual(demo);
  });

  it('loadNative stores fetched candles on success', async () => {
    mockLoadNative.mockResolvedValue(live);
    await useStore.getState().loadNative('nvda');
    expect(mockLoadNative).toHaveBeenCalledWith('NVDA', 'yfinance');
    expect(useStore.getState().candlesBySymbol['NVDA']).toEqual(live);
  });

  it('loadNative records an error on failure', async () => {
    mockLoadNative.mockRejectedValue(new Error('network down'));
    await useStore.getState().loadNative('NVDA');
    expect(useStore.getState().error).toMatch(/network down/i);
  });
});
