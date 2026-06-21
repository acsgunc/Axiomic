/**
 * Hyperliquid market-data source — live crypto prices.
 *
 * Two transport paths, both key-less and CORS-friendly (so they work directly
 * from the browser, even under cross-origin isolation):
 *  - **History:** `POST /info` with `{ type: 'candleSnapshot' }` for charting.
 *  - **Live:** a single shared WebSocket multiplexing `candle` subscriptions
 *    across every pane, with heartbeat + auto-reconnect.
 *
 * Docs: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api
 */

import type { Candle } from '../../types';
import {
  INTERVAL_SECONDS,
  MarketDataError,
  type IntervalId,
  type MarketDataSource,
  type PriceUpdate,
  type SymbolOption,
  type Unsubscribe,
} from './types';

const WS_URL = 'wss://api.hyperliquid.xyz/ws';
const INFO_URL = 'https://api.hyperliquid.xyz/info';

/** Number of historical bars requested for the initial chart render. */
const HISTORY_BARS = 500;
/** Heartbeat cadence — Hyperliquid drops idle sockets after ~60s. */
const PING_INTERVAL_MS = 30_000;
/** Reconnect backoff ceiling. */
const MAX_RECONNECT_MS = 30_000;

/** Raw candle shape returned by Hyperliquid (numeric fields are strings). */
interface HlCandle {
  t: number; // open time (ms)
  T: number; // close time (ms)
  s: string; // coin
  i: string; // interval
  o: string;
  c: string;
  h: string;
  l: string;
  v: string;
  n: number;
}

/** Converts a raw Hyperliquid candle into the app's normalised shape. */
export function parseHlCandle(raw: HlCandle): Candle {
  return {
    time: Math.floor(raw.t / 1000),
    open: Number(raw.o),
    high: Number(raw.h),
    low: Number(raw.l),
    close: Number(raw.c),
    volume: Number(raw.v),
  };
}

type CandleListener = (candle: Candle) => void;

interface Subscription {
  coin: string;
  interval: string;
  listeners: Set<CandleListener>;
}

/**
 * Singleton WebSocket multiplexer for Hyperliquid `candle` streams. One socket
 * serves every pane; subscriptions are ref-counted per `coin|interval` so the
 * socket is opened on first use and closed when the last pane unsubscribes.
 */
export class HyperliquidStream {
  private ws: WebSocket | null = null;
  private readonly subs = new Map<string, Subscription>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;

  /** Subscribes to a coin/interval candle stream; returns an unsubscribe fn. */
  subscribe(
    coin: string,
    interval: string,
    listener: CandleListener,
  ): Unsubscribe {
    const key = `${coin}|${interval}`;
    let sub = this.subs.get(key);
    if (!sub) {
      sub = { coin, interval, listeners: new Set() };
      this.subs.set(key, sub);
      this.ensureSocket();
      this.send({
        method: 'subscribe',
        subscription: { type: 'candle', coin, interval },
      });
    }
    sub.listeners.add(listener);

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const current = this.subs.get(key);
      if (!current) return;
      current.listeners.delete(listener);
      if (current.listeners.size === 0) {
        this.subs.delete(key);
        this.send({
          method: 'unsubscribe',
          subscription: { type: 'candle', coin, interval },
        });
        if (this.subs.size === 0) this.teardown();
      }
    };
  }

  private ensureSocket(): void {
    if (typeof WebSocket === 'undefined') return; // SSR / unsupported runtime
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    const ws = new WebSocket(WS_URL);
    this.ws = ws;
    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      // Re-arm every active subscription after a (re)connect.
      for (const sub of this.subs.values()) {
        this.send({
          method: 'subscribe',
          subscription: {
            type: 'candle',
            coin: sub.coin,
            interval: sub.interval,
          },
        });
      }
    };
    ws.onmessage = (event) => this.handleMessage(event.data);
    ws.onclose = () => {
      this.stopHeartbeat();
      if (this.ws === ws) this.ws = null;
      if (this.subs.size > 0) this.scheduleReconnect();
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        // ignore — onclose drives reconnection
      }
    };
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== 'string') return;
    let msg: { channel?: string; data?: HlCandle };
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (msg.channel !== 'candle' || !msg.data) return;
    const raw = msg.data;
    const key = `${raw.s}|${raw.i}`;
    const sub = this.subs.get(key);
    if (!sub) return;
    const candle = parseHlCandle(raw);
    for (const listener of sub.listeners) listener(candle);
  }

  private send(payload: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingTimer = setInterval(
      () => this.send({ method: 'ping' }),
      PING_INTERVAL_MS,
    );
  }

  private stopHeartbeat(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(
      MAX_RECONNECT_MS,
      1_000 * 2 ** this.reconnectAttempts,
    );
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.subs.size > 0) this.ensureSocket();
    }, delay);
  }

  private teardown(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      ws.onopen = null;
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
  }
}

/** Process-wide shared stream instance. */
export const hyperliquidStream = new HyperliquidStream();

/** Fetches historical candles via the REST `candleSnapshot` endpoint. */
export async function fetchHyperliquidCandles(
  coin: string,
  interval: IntervalId,
): Promise<Candle[]> {
  const seconds = INTERVAL_SECONDS[interval];
  const endTime = Date.now();
  const startTime = endTime - HISTORY_BARS * seconds * 1_000;

  let res: Response;
  try {
    res = await fetch(INFO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'candleSnapshot',
        req: { coin, interval, startTime, endTime },
      }),
    });
  } catch {
    throw new MarketDataError('Network error contacting Hyperliquid.');
  }
  if (!res.ok) {
    throw new MarketDataError(`Hyperliquid returned ${res.status}.`);
  }
  const raw = (await res.json()) as HlCandle[] | null;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new MarketDataError(`No Hyperliquid data for ${coin}.`);
  }
  return raw
    .map(parseHlCandle)
    .filter((c) => Number.isFinite(c.close))
    .sort((a, b) => a.time - b.time);
}

/** Curated set of liquid Hyperliquid perp symbols. */
const HL_SYMBOLS: readonly SymbolOption[] = [
  { symbol: 'BTC', label: 'BTC · Bitcoin' },
  { symbol: 'ETH', label: 'ETH · Ethereum' },
  { symbol: 'SOL', label: 'SOL · Solana' },
  { symbol: 'HYPE', label: 'HYPE · Hyperliquid' },
  { symbol: 'BNB', label: 'BNB · BNB' },
  { symbol: 'XRP', label: 'XRP · XRP' },
  { symbol: 'DOGE', label: 'DOGE · Dogecoin' },
  { symbol: 'AVAX', label: 'AVAX · Avalanche' },
  { symbol: 'LINK', label: 'LINK · Chainlink' },
  { symbol: 'ARB', label: 'ARB · Arbitrum' },
  { symbol: 'SUI', label: 'SUI · Sui' },
  { symbol: 'LTC', label: 'LTC · Litecoin' },
];

/** The Hyperliquid live-crypto data source. */
export const hyperliquidSource: MarketDataSource = {
  id: 'hyperliquid',
  label: 'Hyperliquid (crypto)',
  assetClass: 'crypto',
  streaming: true,
  intervals: ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'],
  symbols: HL_SYMBOLS,
  allowCustomSymbol: true,

  fetchCandles(symbol, interval) {
    return fetchHyperliquidCandles(symbol.toUpperCase(), interval);
  },

  subscribe(symbol, interval, onUpdate) {
    const coin = symbol.toUpperCase();
    return hyperliquidStream.subscribe(coin, interval, (candle) => {
      const update: PriceUpdate = {
        symbol: coin,
        price: candle.close,
        time: candle.time,
        candle,
      };
      onUpdate(update);
    });
  },
};
