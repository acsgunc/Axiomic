/**
 * The "Average Down" view: groups the two halves of the position-repair tool
 * under a sub-navigation — **Price Tiers** (percentage target visualisation)
 * and **Position Repair** (the average-down ladder).
 */

import { useState } from 'react';
import { PriceTargetWorkspace } from './PriceTargetWorkspace';
import { PositionRepairPanel } from './PositionRepairPanel';
import { cn } from '../lib/utils';

type SubView = 'tiers' | 'repair';

export function AverageDownView() {
  const [tab, setTab] = useState<SubView>('tiers');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-base-700 px-3 py-2">
        <div className="flex rounded-md border border-base-700 p-0.5">
          {(
            [
              ['tiers', 'Price Tiers'],
              ['repair', 'Position Repair'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-pressed={tab === id}
              className={cn(
                'rounded px-3 py-1 text-xs font-medium transition-colors',
                tab === id
                  ? 'bg-accent text-white'
                  : 'text-slate-300 hover:bg-base-700',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'tiers' ? <PriceTargetWorkspace /> : <PositionRepairPanel />}
    </div>
  );
}
