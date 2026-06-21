/**
 * Pluggable market-data layer — public surface.
 *
 * Dashboard code should import from here rather than reaching into individual
 * source modules, so providers can be added/swapped behind the registry.
 */

export * from './types';
export {
  DEFAULT_SOURCE_ID,
  getSource,
  listSources,
  registerSource,
  resolveSource,
} from './registry';
export { hyperliquidSource, hyperliquidStream } from './hyperliquid';
export { yfinanceSource } from './yfinance';
