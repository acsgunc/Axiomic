import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SOURCE_ID,
  getSource,
  listSources,
  registerSource,
  resolveSource,
} from '../registry';
import type { MarketDataSource } from '../types';

describe('market-data registry', () => {
  it('exposes the built-in crypto + stocks sources', () => {
    const ids = listSources().map((s) => s.id);
    expect(ids).toContain('hyperliquid');
    expect(ids).toContain('yfinance');
  });

  it('defaults to the live crypto source (zero setup)', () => {
    expect(DEFAULT_SOURCE_ID).toBe('hyperliquid');
    expect(resolveSource(undefined).id).toBe('hyperliquid');
  });

  it('resolves unknown ids to the default source', () => {
    expect(resolveSource('does-not-exist').id).toBe(DEFAULT_SOURCE_ID);
    expect(getSource('does-not-exist')).toBeUndefined();
  });

  it('allows registering a custom broker (pluggable)', () => {
    const fake: MarketDataSource = {
      id: 'fake-broker',
      label: 'Fake',
      assetClass: 'crypto',
      streaming: false,
      intervals: ['1h'],
      symbols: [{ symbol: 'X', label: 'X' }],
      allowCustomSymbol: true,
      fetchCandles: async () => [],
      subscribe: () => () => {},
    };
    registerSource(fake);
    expect(getSource('fake-broker')).toBe(fake);
    expect(resolveSource('fake-broker').label).toBe('Fake');
  });
});
