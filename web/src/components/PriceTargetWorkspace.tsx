/**
 * The Price Targets workspace: a sidebar to set a base price (manual entry or
 * resolved from a stock ticker), a ladder table of percentage-based price
 * targets (-100% … +500% in 5% steps), and a line chart visualising target
 * price vs. percentage change with a dashed 0% reference line.
 *
 * This is the first half of the "average down" tool: it establishes and
 * visualises the price tiers a position could move through.
 */

import { useMemo, useState } from 'react';
import { Panel, Button } from './ui';
import { PriceTargetChart } from './PriceTargetChart';
import { buildPriceTargets, DEFAULT_RANGE } from '../lib/priceTargets';
import { useStore } from '../store/useStore';
import { fetchLive, liveAvailable, loadSample } from '../lib/dataProvider';
import { cn } from '../lib/utils';

type BaseMode = 'manual' | 'ticker';

const priceFmt = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const formatPrice = (n: number) => priceFmt.format(n);

export function PriceTargetWorkspace() {
  const [mode, setMode] = useState<BaseMode>('manual');
  const [manualPrice, setManualPrice] = useState('100');
  const [ticker, setTicker] = useState('');
  const [basePrice, setBasePrice] = useState(100);
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const provider = useStore((s) => s.provider);
  const candlesBySymbol = useStore((s) => s.candlesBySymbol);

  const tiers = useMemo(() => buildPriceTargets(basePrice), [basePrice]);

  const applyManual = () => {
    const v = Number(manualPrice);
    if (Number.isFinite(v) && v > 0) {
      setBasePrice(v);
      setNote(null);
    } else {
      setNote('Enter a positive base price.');
    }
  };

  const resolveTicker = async () => {
    const sym = ticker.trim().toUpperCase();
    if (!sym) {
      setNote('Enter a ticker symbol.');
      return;
    }
    setResolving(true);
    setNote(null);
    try {
      // Prefer already-loaded candles; otherwise fetch live, falling back to
      // deterministic sample data so the tool works fully offline.
      let candles = candlesBySymbol[sym];
      if (!candles?.length) {
        if (liveAvailable) {
          try {
            candles = await fetchLive(sym, provider);
          } catch {
            candles = loadSample(sym);
            setNote(`Live fetch failed for ${sym}; using sample data.`);
          }
        } else {
          candles = loadSample(sym);
          setNote(`No live source; using sample data for ${sym}.`);
        }
      }
      const last = candles[candles.length - 1];
      if (last) {
        setBasePrice(last.close);
        setManualPrice(last.close.toFixed(2));
      } else {
        setNote(`No price found for ${sym}.`);
      }
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-[240px_1fr_300px] gap-2 p-2">
        {/* Left: base-price input */}
        <div className="flex min-h-0 flex-col gap-2">
          <Panel title="Base Price" className="shrink-0">
            <div className="flex flex-col gap-3">
              <div className="flex rounded-md border border-base-700 p-0.5">
                {(
                  [
                    ['manual', 'Manual'],
                    ['ticker', 'Ticker'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setMode(id)}
                    className={cn(
                      'flex-1 rounded px-2 py-1 text-xs font-medium transition-colors',
                      mode === id
                        ? 'bg-accent text-white'
                        : 'text-slate-300 hover:bg-base-700',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {mode === 'manual' ? (
                <form
                  className="flex flex-col gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    applyManual();
                  }}
                >
                  <label htmlFor="pt-base-price" className="text-[11px] text-slate-400">
                    Base price
                  </label>
                  <input
                    id="pt-base-price"
                    type="number"
                    min={0}
                    step="any"
                    value={manualPrice}
                    onChange={(e) => setManualPrice(e.target.value)}
                    className="w-full rounded-md border border-base-700 bg-base-900 px-2 py-1.5 text-right font-mono text-sm outline-none focus:border-accent"
                  />
                  <Button type="submit" variant="accent">
                    Set price
                  </Button>
                </form>
              ) : (
                <form
                  className="flex flex-col gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void resolveTicker();
                  }}
                >
                  <label htmlFor="pt-ticker" className="text-[11px] text-slate-400">
                    Stock ticker
                  </label>
                  <input
                    id="pt-ticker"
                    type="text"
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value)}
                    placeholder="AAPL"
                    className="w-full rounded-md border border-base-700 bg-base-900 px-2 py-1.5 font-mono text-sm uppercase outline-none focus:border-accent"
                  />
                  <Button type="submit" variant="accent" disabled={resolving}>
                    {resolving ? 'Resolving…' : 'Use last price'}
                  </Button>
                </form>
              )}

              <div className="rounded-md border border-base-700 bg-base-900/40 px-3 py-2">
                <div className="text-[11px] text-slate-400">Current price</div>
                <div className="font-mono text-lg text-slate-100">
                  {formatPrice(basePrice)}
                </div>
              </div>

              {note && (
                <p className="text-[11px] text-accent-down">{note}</p>
              )}

              <p className="text-[11px] leading-relaxed text-slate-500">
                Targets span {DEFAULT_RANGE.min}% to +{DEFAULT_RANGE.max}% in{' '}
                {DEFAULT_RANGE.step}% steps. Target ={' '}
                <span className="font-mono">price × (1 + %/100)</span>.
              </p>
            </div>
          </Panel>
        </div>

        {/* Center: chart */}
        <Panel title="Target Price vs. % Change" className="min-h-0">
          <PriceTargetChart tiers={tiers} formatPrice={formatPrice} />
        </Panel>

        {/* Right: ladder table */}
        <Panel title="Price Targets" className="min-h-0">
          <table className="w-full border-collapse text-right font-mono text-xs">
            <thead className="sticky top-0 bg-base-800/95">
              <tr className="text-slate-400">
                <th className="px-2 py-1 text-right font-medium">%</th>
                <th className="px-2 py-1 text-right font-medium">Target</th>
                <th className="px-2 py-1 text-right font-medium">Δ $</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((t) => {
                const isBase = t.percent === 0;
                const delta = t.price - basePrice;
                return (
                  <tr
                    key={t.percent}
                    className={cn(
                      'border-t border-base-700/60',
                      isBase && 'bg-accent/10 font-semibold text-slate-100',
                    )}
                  >
                    <td
                      className={cn(
                        'px-2 py-0.5',
                        !isBase &&
                          (t.percent > 0
                            ? 'text-accent-up'
                            : 'text-accent-down'),
                      )}
                    >
                      {t.percent > 0 ? `+${t.percent}` : t.percent}%
                    </td>
                    <td className="px-2 py-0.5 text-slate-200">
                      {formatPrice(t.price)}
                    </td>
                    <td
                      className={cn(
                        'px-2 py-0.5',
                        delta > 0
                          ? 'text-accent-up'
                          : delta < 0
                            ? 'text-accent-down'
                            : 'text-slate-400',
                      )}
                    >
                      {delta > 0 ? '+' : ''}
                      {formatPrice(delta)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}
