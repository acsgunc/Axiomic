import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Candle } from '../../types';

// The CSV path delegates to the Rust/WASM engine; mock it so tests stay in JS.
vi.mock('../../engine', () => ({
  engine: { parseCsv: vi.fn() },
  preloadEngine: vi.fn(),
}));

const sampleCandles: Candle[] = [
  { time: 1, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
];

/** Imports a fresh copy of the module so module-level consts re-evaluate. */
async function freshModule() {
  vi.resetModules();
  return import('../dataProvider');
}

/** jsdom's File lacks .text(); build a minimal stand-in. */
function fakeCsvFile(name: string, contents = 'data'): File {
  return { name, text: async () => contents } as unknown as File;
}

beforeEach(() => {
  // Default to "no proxy configured"; individual tests opt in as needed.
  vi.stubEnv('VITE_PROXY_URL', '');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('loadFromCsvFile', () => {
  beforeEach(() => vi.resetModules());

  it('returns parsed candles on success', async () => {
    const { engine } = await import('../../engine');
    (engine.parseCsv as ReturnType<typeof vi.fn>).mockResolvedValue(sampleCandles);
    const { loadFromCsvFile } = await import('../dataProvider');
    const file = fakeCsvFile('AAPL.csv');
    await expect(loadFromCsvFile(file)).resolves.toEqual(sampleCandles);
  });

  it('throws DataError when the CSV has no rows', async () => {
    const { engine } = await import('../../engine');
    (engine.parseCsv as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const { loadFromCsvFile, DataError } = await import('../dataProvider');
    const file = fakeCsvFile('empty.csv', '');
    await expect(loadFromCsvFile(file)).rejects.toBeInstanceOf(DataError);
  });

  it('wraps engine errors in DataError', async () => {
    const { engine } = await import('../../engine');
    (engine.parseCsv as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('bad header'),
    );
    const { loadFromCsvFile, DataError } = await import('../dataProvider');
    const file = fakeCsvFile('bad.csv');
    await expect(loadFromCsvFile(file)).rejects.toBeInstanceOf(DataError);
  });
});

describe('runtime detection', () => {
  it('isDesktop is false and hasProxy is false by default', async () => {
    vi.stubEnv('VITE_PROXY_URL', '');
    const { isDesktop, hasProxy, liveAvailable } = await freshModule();
    expect(isDesktop).toBe(false);
    expect(hasProxy).toBe(false);
    expect(liveAvailable).toBe(false);
  });

  it('hasProxy is true when VITE_PROXY_URL is set', async () => {
    vi.stubEnv('VITE_PROXY_URL', 'http://proxy.test');
    const { hasProxy, liveAvailable } = await freshModule();
    expect(hasProxy).toBe(true);
    expect(liveAvailable).toBe(true);
  });

  it('isDesktop is true when the Tauri global is present', async () => {
    vi.stubGlobal('__TAURI__', { core: { invoke: vi.fn() } });
    const { isDesktop, liveAvailable } = await freshModule();
    expect(isDesktop).toBe(true);
    expect(liveAvailable).toBe(true);
  });
});

describe('loadFromProxy', () => {
  it('throws when no proxy is configured', async () => {
    const { loadFromProxy, DataError } = await freshModule();
    await expect(loadFromProxy('AAPL')).rejects.toBeInstanceOf(DataError);
  });

  it('returns candles from a { candles } payload', async () => {
    vi.stubEnv('VITE_PROXY_URL', 'http://proxy.test');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ candles: sampleCandles }),
      }),
    );
    const { loadFromProxy } = await freshModule();
    await expect(loadFromProxy('AAPL')).resolves.toEqual(sampleCandles);
  });

  it('forwards the selected provider as a query param', async () => {
    vi.stubEnv('VITE_PROXY_URL', 'http://proxy.test');
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ candles: sampleCandles }) });
    vi.stubGlobal('fetch', fetchMock);
    const { loadFromProxy } = await freshModule();

    await loadFromProxy('AAPL', 'yahoo');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://proxy.test/quotes?symbol=AAPL&provider=yahoo',
    );
  });

  it('defaults to the yfinance provider when none is given', async () => {
    vi.stubEnv('VITE_PROXY_URL', 'http://proxy.test');
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ candles: sampleCandles }) });
    vi.stubGlobal('fetch', fetchMock);
    const { loadFromProxy } = await freshModule();

    await loadFromProxy('AAPL');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://proxy.test/quotes?symbol=AAPL&provider=yfinance',
    );
  });

  it('accepts a bare array payload', async () => {
    vi.stubEnv('VITE_PROXY_URL', 'http://proxy.test');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => sampleCandles }),
    );
    const { loadFromProxy } = await freshModule();
    await expect(loadFromProxy('AAPL')).resolves.toEqual(sampleCandles);
  });

  it('throws on a non-ok response', async () => {
    vi.stubEnv('VITE_PROXY_URL', 'http://proxy.test');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 502, statusText: 'Bad Gateway' }),
    );
    const { loadFromProxy, DataError } = await freshModule();
    await expect(loadFromProxy('AAPL')).rejects.toBeInstanceOf(DataError);
  });

  it('throws on an empty result set', async () => {
    vi.stubEnv('VITE_PROXY_URL', 'http://proxy.test');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candles: [] }) }),
    );
    const { loadFromProxy, DataError } = await freshModule();
    await expect(loadFromProxy('AAPL')).rejects.toBeInstanceOf(DataError);
  });

  it('throws a DataError on network failure', async () => {
    vi.stubEnv('VITE_PROXY_URL', 'http://proxy.test');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const { loadFromProxy, DataError } = await freshModule();
    await expect(loadFromProxy('AAPL')).rejects.toBeInstanceOf(DataError);
  });
});

describe('loadFromNative', () => {
  it('throws when not running under Tauri', async () => {
    const { loadFromNative, DataError } = await freshModule();
    await expect(loadFromNative('AAPL', 'yfinance')).rejects.toBeInstanceOf(
      DataError,
    );
  });

  it('invokes fetch_history and returns candles', async () => {
    const invoke = vi.fn().mockResolvedValue(sampleCandles);
    vi.stubGlobal('__TAURI__', { core: { invoke } });
    const { loadFromNative } = await freshModule();
    await expect(loadFromNative('aapl', 'yahoo')).resolves.toEqual(sampleCandles);
    expect(invoke).toHaveBeenCalledWith('fetch_history', {
      ticker: 'aapl',
      provider: 'yahoo',
    });
  });

  it('surfaces a string error from the backend', async () => {
    const invoke = vi.fn().mockRejectedValue('rate limited');
    vi.stubGlobal('__TAURI__', { core: { invoke } });
    const { loadFromNative, DataError } = await freshModule();
    await expect(loadFromNative('AAPL', 'yfinance')).rejects.toThrow('rate limited');
    await expect(loadFromNative('AAPL', 'yfinance')).rejects.toBeInstanceOf(
      DataError,
    );
  });

  it('throws when the backend returns no candles', async () => {
    const invoke = vi.fn().mockResolvedValue([]);
    vi.stubGlobal('__TAURI__', { core: { invoke } });
    const { loadFromNative, DataError } = await freshModule();
    await expect(loadFromNative('AAPL', 'yfinance')).rejects.toBeInstanceOf(
      DataError,
    );
  });
});

describe('fetchLive routing', () => {
  it('uses the native path on desktop', async () => {
    const invoke = vi.fn().mockResolvedValue(sampleCandles);
    vi.stubGlobal('__TAURI__', { core: { invoke } });
    const { fetchLive } = await freshModule();
    await expect(fetchLive('AAPL', 'yfinance')).resolves.toEqual(sampleCandles);
    expect(invoke).toHaveBeenCalledOnce();
  });

  it('uses the proxy path in the browser when configured', async () => {
    vi.stubEnv('VITE_PROXY_URL', 'http://proxy.test');
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ candles: sampleCandles }) });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchLive } = await freshModule();
    await expect(fetchLive('AAPL', 'yahoo')).resolves.toEqual(sampleCandles);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://proxy.test/quotes?symbol=AAPL&provider=yahoo',
    );
  });

  it('throws when no live source is available', async () => {
    const { fetchLive, DataError } = await freshModule();
    await expect(fetchLive('AAPL', 'yfinance')).rejects.toBeInstanceOf(DataError);
  });
});

describe('loadSample', () => {
  it('is deterministic per symbol', async () => {
    const { loadSample } = await freshModule();
    expect(loadSample('AAPL')).toEqual(loadSample('AAPL'));
  });
});
