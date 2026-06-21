/**
 * yfinance market-data source — live equities (USA, Singapore, India, …).
 *
 * Charting history comes from the existing runtime-aware fetchers: native Yahoo
 * crates inside the Tauri desktop shell, or the Cloudflare Worker proxy in the
 * browser. Yahoo has no public WebSocket, so "live" updates are delivered by
 * lightweight polling of the latest bar — gated to emit only on price change.
 *
 * Singapore (`*.SI`) and Indian (`*.NS` / `*.BO`) tickers work as-is because the
 * proxy forwards the raw symbol to Yahoo's chart API.
 */

import type { Candle } from '../../types';
import {
  isDesktop,
  hasProxy,
  loadFromNative,
  loadFromProxy,
} from '../dataProvider';
import {
  MarketDataError,
  type IntervalId,
  type MarketDataSource,
  type SymbolOption,
  type Unsubscribe,
} from './types';

/** Maps an app interval to Yahoo's native interval + a sensible history range. */
interface YahooSpec {
  interval: string;
  range: string;
  /** Shorter range used for the live poll, to keep payloads tiny. */
  pollRange: string;
}

const YAHOO_SPECS: Record<IntervalId, YahooSpec> = {
  '1m': { interval: '1m', range: '1d', pollRange: '1d' },
  '5m': { interval: '5m', range: '5d', pollRange: '1d' },
  '15m': { interval: '15m', range: '1mo', pollRange: '1d' },
  '30m': { interval: '30m', range: '1mo', pollRange: '1d' },
  '1h': { interval: '60m', range: '3mo', pollRange: '5d' },
  '4h': { interval: '60m', range: '6mo', pollRange: '5d' }, // Yahoo lacks 4h
  '1d': { interval: '1d', range: '2y', pollRange: '5d' },
  '1w': { interval: '1wk', range: '10y', pollRange: '1mo' },
};

/** Equities stream live via polling; intraday faster than end-of-day bars. */
function pollIntervalMs(interval: IntervalId): number {
  switch (interval) {
    case '1m':
    case '5m':
      return 15_000;
    case '15m':
    case '30m':
    case '1h':
    case '4h':
      return 30_000;
    default:
      return 60_000;
  }
}

async function fetchEquityCandles(
  symbol: string,
  interval: IntervalId,
  range: string,
): Promise<Candle[]> {
  const yahoo = YAHOO_SPECS[interval];
  // Desktop fetches natively (daily only); browser uses the proxy with interval.
  if (isDesktop) return loadFromNative(symbol, 'yfinance');
  if (hasProxy) {
    return loadFromProxy(symbol, 'yfinance', {
      interval: yahoo.interval,
      range,
    });
  }
  throw new MarketDataError(
    'No equities data source. Run the desktop app or configure VITE_PROXY_URL.',
  );
}

/** A small set of liquid US / Singapore / India tickers for the picker. */
const EQUITY_SYMBOLS: readonly SymbolOption[] = [
  { symbol: 'AAPL', label: 'AAPL · Apple (US)' },
  { symbol: 'MSFT', label: 'MSFT · Microsoft (US)' },
  { symbol: 'NVDA', label: 'NVDA · NVIDIA (US)' },
  { symbol: 'TSLA', label: 'TSLA · Tesla (US)' },
  { symbol: 'D05.SI', label: 'D05 · DBS Group (SG)' },
  { symbol: 'O39.SI', label: 'O39 · OCBC (SG)' },
  { symbol: 'C6L.SI', label: 'C6L · Singapore Airlines (SG)' },
  { symbol: 'RELIANCE.NS', label: 'RELIANCE · Reliance (IN)' },
  { symbol: 'TCS.NS', label: 'TCS · Tata Consultancy (IN)' },
  { symbol: 'INFY.NS', label: 'INFY · Infosys (IN)' },
  { symbol: 'HDFCBANK.NS', label: 'HDFCBANK · HDFC Bank (IN)' },
];

/** The yfinance live-equities data source. */
export const yfinanceSource: MarketDataSource = {
  id: 'yfinance',
  label: 'yfinance (stocks)',
  assetClass: 'stocks',
  streaming: true,
  intervals: ['5m', '15m', '30m', '1h', '1d', '1w'],
  symbols: EQUITY_SYMBOLS,
  allowCustomSymbol: true,

  fetchCandles(symbol, interval) {
    const sym = symbol.trim().toUpperCase();
    return fetchEquityCandles(sym, interval, YAHOO_SPECS[interval].range);
  },

  subscribe(symbol, interval, onUpdate) {
    const sym = symbol.trim().toUpperCase();
    let active = true;
    let lastPrice: number | undefined;

    const poll = async () => {
      try {
        const candles = await fetchEquityCandles(
          sym,
          interval,
          YAHOO_SPECS[interval].pollRange,
        );
        if (!active || candles.length === 0) return;
        const last = candles[candles.length - 1];
        if (last.close === lastPrice) return; // only flash on real change
        lastPrice = last.close;
        onUpdate({
          symbol: sym,
          price: last.close,
          time: last.time,
          candle: last,
        });
      } catch {
        // Swallow transient poll failures; the chart keeps its last state.
      }
    };

    void poll();
    const timer = setInterval(poll, pollIntervalMs(interval));
    const unsubscribe: Unsubscribe = () => {
      active = false;
      clearInterval(timer);
    };
    return unsubscribe;
  },
};
