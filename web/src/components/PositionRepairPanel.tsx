/**
 * The Position Repair (average-down) workspace: enter a losing position (entry
 * price, quantity, current market price) and see a dynamic table of how many
 * units to buy now to pull the average down to a series of target averages,
 * with the cash required and the resulting total position value.
 *
 * This is Feature Set 2 of the average-down tool — the actionable counterpart
 * to the price-tier visualisation.
 */

import { useMemo, useState } from 'react';
import { Panel } from './ui';
import {
  buildRepairLadder,
  repairIsPossible,
  type RepairInputs,
} from '../lib/positionRepair';
import { cn } from '../lib/utils';

const money = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const formatMoney = (n: number) => money.format(n);

const units = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
});
const formatUnits = (n: number) => units.format(n);

/** Parses an input string to a finite number, or NaN. */
function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

export function PositionRepairPanel() {
  // Defaults mirror the worked example: 2 units @ 300, now trading at 50.
  const [entry, setEntry] = useState('300');
  const [quantity, setQuantity] = useState('2');
  const [market, setMarket] = useState('50');

  // Target averages: auto-generated round values, or a user-supplied list.
  const [targetMode, setTargetMode] = useState<'auto' | 'custom'>('auto');
  const [customTargets, setCustomTargets] = useState('250, 200, 150, 100, 75');

  const inputs: RepairInputs = useMemo(
    () => ({
      entryPrice: num(entry),
      quantity: num(quantity),
      marketPrice: num(market),
    }),
    [entry, quantity, market],
  );

  // Parse the comma/space-separated custom averages into a descending list.
  const parsedTargets = useMemo(() => {
    const values = customTargets
      .split(/[\s,]+/)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n > 0);
    return Array.from(new Set(values)).sort((a, b) => b - a);
  }, [customTargets]);

  const rows = useMemo(
    () =>
      buildRepairLadder(
        inputs,
        targetMode === 'custom' ? { targets: parsedTargets } : {},
      ),
    [inputs, targetMode, parsedTargets],
  );

  const possible = repairIsPossible(inputs.entryPrice, inputs.marketPrice);
  const positionValid =
    possible && Number.isFinite(inputs.quantity) && inputs.quantity > 0;

  const currentCost = positionValid
    ? inputs.quantity * inputs.entryPrice
    : NaN;
  const currentValue = positionValid
    ? inputs.quantity * inputs.marketPrice
    : NaN;
  const drawdownPct = positionValid
    ? (inputs.marketPrice / inputs.entryPrice - 1) * 100
    : NaN;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-[260px_1fr] gap-2 p-2">
        {/* Left: position inputs */}
        <div className="flex min-h-0 flex-col gap-2 overflow-auto">
          <Panel title="Your Position" className="shrink-0">
            <div className="flex flex-col gap-3">
              <Field
                id="pr-entry"
                label="Entry price (avg paid)"
                value={entry}
                onChange={setEntry}
              />
              <Field
                id="pr-qty"
                label="Current quantity"
                value={quantity}
                onChange={setQuantity}
              />
              <Field
                id="pr-market"
                label="Current market price"
                value={market}
                onChange={setMarket}
              />

              {positionValid ? (
                <div className="flex flex-col gap-1 rounded-md border border-base-700 bg-base-900/40 px-3 py-2 text-xs">
                  <Row label="Cost basis" value={formatMoney(currentCost)} />
                  <Row
                    label="Market value"
                    value={formatMoney(currentValue)}
                  />
                  <Row
                    label="Unrealised"
                    value={`${drawdownPct > 0 ? '+' : ''}${drawdownPct.toFixed(1)}%`}
                    valueClass={
                      drawdownPct < 0 ? 'text-accent-down' : 'text-accent-up'
                    }
                  />
                </div>
              ) : (
                <p className="text-[11px] leading-relaxed text-accent-down">
                  {inputs.marketPrice >= inputs.entryPrice &&
                  inputs.marketPrice > 0 &&
                  inputs.entryPrice > 0
                    ? 'Market price must be below the entry price to average down.'
                    : 'Enter a positive entry price, quantity, and market price.'}
                </p>
              )}

              <p className="text-[11px] leading-relaxed text-slate-500">
                Units to buy ={' '}
                <span className="font-mono">
                  qty × (target − entry) / (market − target)
                </span>
                .
              </p>
            </div>
          </Panel>

          <Panel title="Target Averages" className="shrink-0">
            <div className="flex flex-col gap-3">
              <div className="flex rounded-md border border-base-700 p-0.5">
                {(
                  [
                    ['auto', 'Auto'],
                    ['custom', 'Custom'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setTargetMode(id)}
                    aria-pressed={targetMode === id}
                    className={cn(
                      'flex-1 rounded px-2 py-1 text-xs font-medium transition-colors',
                      targetMode === id
                        ? 'bg-accent text-white'
                        : 'text-slate-300 hover:bg-base-700',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {targetMode === 'custom' ? (
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="pr-custom-targets"
                    className="text-[11px] text-slate-400"
                  >
                    Your target averages
                  </label>
                  <textarea
                    id="pr-custom-targets"
                    rows={2}
                    value={customTargets}
                    onChange={(e) => setCustomTargets(e.target.value)}
                    placeholder="e.g. 250, 200, 150, 100, 75"
                    className="w-full resize-none rounded-md border border-base-700 bg-base-900 px-2 py-1.5 font-mono text-xs outline-none focus:border-accent"
                  />
                  <p className="text-[11px] leading-relaxed text-slate-500">
                    Comma- or space-separated prices. Only values between the
                    market price and your entry price can be reached.
                  </p>
                  {positionValid &&
                    parsedTargets.length > 0 &&
                    rows.length < parsedTargets.length && (
                      <p className="text-[11px] leading-relaxed text-accent-down">
                        {parsedTargets.length - rows.length} target
                        {parsedTargets.length - rows.length === 1
                          ? ''
                          : 's'}{' '}
                        skipped — outside ({formatMoney(inputs.marketPrice)},{' '}
                        {formatMoney(inputs.entryPrice)}).
                      </p>
                    )}
                </div>
              ) : (
                <p className="text-[11px] leading-relaxed text-slate-500">
                  Round target averages are generated automatically between the
                  market price and your entry price. Switch to{' '}
                  <span className="text-slate-300">Custom</span> to enter your
                  own.
                </p>
              )}
            </div>
          </Panel>
        </div>

        {/* Right: dynamic repair ladder */}
        <Panel title="Position Repair · Average Down" className="min-h-0">
          {rows.length ? (
            <table className="w-full border-collapse text-right text-xs">
              <thead className="sticky top-0 bg-base-800/95 text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-right font-medium">
                    Target Avg
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Units to Buy
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Cost to Buy
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    New Position Value
                  </th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {rows.map((r) => (
                  <tr
                    key={r.targetAvg}
                    className="border-t border-base-700/60"
                  >
                    <td className="px-3 py-1.5 text-slate-100">
                      {formatMoney(r.targetAvg)}
                    </td>
                    <td className="px-3 py-1.5 text-accent">
                      {formatUnits(r.unitsToBuy)}
                    </td>
                    <td className="px-3 py-1.5 text-slate-200">
                      {formatMoney(r.costToBuy)}
                    </td>
                    <td className="px-3 py-1.5 text-slate-200">
                      {formatMoney(r.newPositionValue)}
                      <span className="ml-1 text-[10px] text-slate-500">
                        ({formatUnits(r.newQuantity)}u)
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Enter a position with a market price below your entry to see the
              repair ladder.
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[11px] text-slate-400">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={0}
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-base-700 bg-base-900 px-2 py-1.5 text-right font-mono text-sm outline-none focus:border-accent"
      />
    </div>
  );
}

function Row({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400">{label}</span>
      <span className={cn('font-mono text-slate-200', valueClass)}>
        {value}
      </span>
    </div>
  );
}
