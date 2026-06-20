/**
 * Lazy-loading wrapper around the Rust/WASM analysis core.
 *
 * The WASM module is code-split and only fetched/instantiated on first use,
 * keeping the initial page load fast. All heavy computation (indicators,
 * backtests, CSV parsing) is delegated to Rust — there is no analysis logic
 * implemented in JavaScript.
 */

import type {
  BacktestConfig,
  BacktestResult,
  BollingerResult,
  Candle,
  MacdResult,
  Series,
} from './types';

type WasmModule = typeof import('./wasm/axiomic_core');

let modulePromise: Promise<WasmModule> | null = null;

/** Loads and initializes the WASM module exactly once. */
async function getModule(): Promise<WasmModule> {
  if (!modulePromise) {
    modulePromise = (async () => {
      const mod = await import('./wasm/axiomic_core');
      // wasm-pack `web` target requires calling the default init to fetch the .wasm.
      await mod.default();
      return mod;
    })();
  }
  return modulePromise;
}

/** Pre-warms the WASM module in the background (e.g. on app mount). */
export function preloadEngine(): void {
  void getModule();
}

export const engine = {
  async version(): Promise<string> {
    const mod = await getModule();
    return mod.version();
  },

  async parseCsv(csv: string): Promise<Candle[]> {
    const mod = await getModule();
    return mod.parse_csv(csv) as Candle[];
  },

  async sma(candles: Candle[], period: number): Promise<Series> {
    const mod = await getModule();
    return mod.sma(candles, period) as Series;
  },

  async ema(candles: Candle[], period: number): Promise<Series> {
    const mod = await getModule();
    return mod.ema(candles, period) as Series;
  },

  async rsi(candles: Candle[], period: number): Promise<Series> {
    const mod = await getModule();
    return mod.rsi(candles, period) as Series;
  },

  async macd(
    candles: Candle[],
    fast = 12,
    slow = 26,
    signal = 9,
  ): Promise<MacdResult> {
    const mod = await getModule();
    return mod.macd(candles, fast, slow, signal) as MacdResult;
  },

  async bollinger(
    candles: Candle[],
    period = 20,
    stdDevs = 2,
  ): Promise<BollingerResult> {
    const mod = await getModule();
    return mod.bollinger(candles, period, stdDevs) as BollingerResult;
  },

  async atr(candles: Candle[], period = 14): Promise<Series> {
    const mod = await getModule();
    return mod.atr(candles, period) as Series;
  },

  async backtestSmaCrossover(
    candles: Candle[],
    config: BacktestConfig,
  ): Promise<BacktestResult> {
    const mod = await getModule();
    return mod.backtest_sma_crossover(candles, config) as BacktestResult;
  },
};
