/**
 * Registry of available market-data sources.
 *
 * The dashboard reads exclusively from this registry, so enabling a new broker
 * (Alpaca, Binance, Zerodha, Polygon, …) is a one-liner: implement
 * {@link MarketDataSource} and call {@link registerSource} (or add it to the
 * built-in list below).
 */

import type { MarketDataSource } from './types';
import { hyperliquidSource } from './hyperliquid';
import { yfinanceSource } from './yfinance';

/** Built-in sources, in display order. Crypto first (works with zero setup). */
const builtInSources: MarketDataSource[] = [hyperliquidSource, yfinanceSource];

const registry = new Map<string, MarketDataSource>(
  builtInSources.map((s) => [s.id, s]),
);

/** Registers (or replaces) a market-data source at runtime. */
export function registerSource(source: MarketDataSource): void {
  registry.set(source.id, source);
}

/** All registered sources, in insertion order. */
export function listSources(): MarketDataSource[] {
  return Array.from(registry.values());
}

/** Looks up a source by id. */
export function getSource(id: string): MarketDataSource | undefined {
  return registry.get(id);
}

/** Default source id for new panes (live crypto, no setup required). */
export const DEFAULT_SOURCE_ID = hyperliquidSource.id;

/** Resolves a source by id, falling back to the default when unknown. */
export function resolveSource(id: string | undefined): MarketDataSource {
  return (id && registry.get(id)) || registry.get(DEFAULT_SOURCE_ID)!;
}
