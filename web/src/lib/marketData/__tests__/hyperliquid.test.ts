import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  HyperliquidStream,
  parseHlCandle,
  hyperliquidSource,
} from '../hyperliquid';

describe('parseHlCandle', () => {
  it('normalises string OHLCV fields and ms timestamps to the app shape', () => {
    const candle = parseHlCandle({
      t: 1_700_000_000_000,
      T: 1_700_000_059_999,
      s: 'BTC',
      i: '1m',
      o: '42000.5',
      c: '42010.25',
      h: '42050',
      l: '41990',
      v: '12.5',
      n: 130,
    });
    expect(candle).toEqual({
      time: 1_700_000_000,
      open: 42000.5,
      high: 42050,
      low: 41990,
      close: 42010.25,
      volume: 12.5,
    });
  });
});

describe('hyperliquidSource metadata', () => {
  it('is a streaming crypto source with the expected id and intervals', () => {
    expect(hyperliquidSource.id).toBe('hyperliquid');
    expect(hyperliquidSource.assetClass).toBe('crypto');
    expect(hyperliquidSource.streaming).toBe(true);
    expect(hyperliquidSource.intervals).toContain('1h');
    expect(hyperliquidSource.allowCustomSymbol).toBe(true);
  });
});

// --- Fake WebSocket so the multiplexer can be tested without a network. ---

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  /** Test helper: transition to OPEN and fire onopen. */
  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  /** Test helper: deliver a server message. */
  emit(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

describe('HyperliquidStream multiplexer', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens one socket and sends a candle subscribe on connect', () => {
    const stream = new HyperliquidStream();
    stream.subscribe('BTC', '1m', () => {});
    expect(FakeWebSocket.instances).toHaveLength(1);

    const ws = FakeWebSocket.instances[0];
    ws.open();
    const subscribed = ws.sent.map((s) => JSON.parse(s));
    expect(subscribed).toContainEqual({
      method: 'subscribe',
      subscription: { type: 'candle', coin: 'BTC', interval: '1m' },
    });
  });

  it('routes parsed candles to the matching listener only', () => {
    const stream = new HyperliquidStream();
    const btc = vi.fn();
    const eth = vi.fn();
    stream.subscribe('BTC', '1m', btc);
    stream.subscribe('ETH', '1m', eth);
    const ws = FakeWebSocket.instances[0];
    ws.open();

    ws.emit({
      channel: 'candle',
      data: {
        t: 1_700_000_000_000,
        T: 0,
        s: 'BTC',
        i: '1m',
        o: '1',
        c: '2',
        h: '3',
        l: '0.5',
        v: '10',
        n: 1,
      },
    });

    expect(btc).toHaveBeenCalledTimes(1);
    expect(btc.mock.calls[0][0]).toMatchObject({ close: 2, time: 1_700_000_000 });
    expect(eth).not.toHaveBeenCalled();
  });

  it('ref-counts subscriptions and closes the socket on the last unsubscribe', () => {
    const stream = new HyperliquidStream();
    const off1 = stream.subscribe('BTC', '1m', () => {});
    const off2 = stream.subscribe('BTC', '1m', () => {});
    const ws = FakeWebSocket.instances[0];
    ws.open();

    off1();
    // Still one active listener — must not unsubscribe upstream yet.
    expect(ws.sent.map((s) => JSON.parse(s))).not.toContainEqual({
      method: 'unsubscribe',
      subscription: { type: 'candle', coin: 'BTC', interval: '1m' },
    });

    off2();
    expect(ws.sent.map((s) => JSON.parse(s))).toContainEqual({
      method: 'unsubscribe',
      subscription: { type: 'candle', coin: 'BTC', interval: '1m' },
    });
    expect(ws.readyState).toBe(FakeWebSocket.CLOSED);
  });
});
