/**
 * Pure helpers for the **Position Repair** (average-down) tool.
 *
 * Given a losing position — `quantity` units bought at an `entryPrice` average,
 * now trading at a lower `marketPrice` — these functions compute how many extra
 * units to buy at the current price to pull the blended average down to a
 * series of target averages, and the cost/value of doing so.
 *
 * Kept free of React/DOM so the dollar-cost-averaging math is unit-testable.
 */

/** The current losing position to repair. */
export interface RepairInputs {
  /** Original average price paid per unit. */
  entryPrice: number;
  /** Units currently held. */
  quantity: number;
  /** Price you can buy more units at right now. */
  marketPrice: number;
}

/** One row of the repair ladder for a single target average price. */
export interface RepairRow {
  /** The average price the position would reach after buying. */
  targetAvg: number;
  /** Additional units to buy now (DCA formula); fractional allowed. */
  unitsToBuy: number;
  /** Cash needed for those units: `unitsToBuy × marketPrice`. */
  costToBuy: number;
  /** Total units held afterwards: `quantity + unitsToBuy`. */
  newQuantity: number;
  /** Total invested / cost basis afterwards: `newQuantity × targetAvg`. */
  newPositionValue: number;
}

/** Whether averaging down is even possible for these inputs. */
export function repairIsPossible(entryPrice: number, marketPrice: number): boolean {
  return (
    Number.isFinite(entryPrice) &&
    Number.isFinite(marketPrice) &&
    entryPrice > 0 &&
    marketPrice > 0 &&
    marketPrice < entryPrice
  );
}

/**
 * Units to buy at `marketPrice` to move the blended average from `entryPrice`
 * (over `quantity` units) down to `targetAvg`.
 *
 * Derived from `(quantity·entryPrice + x·marketPrice) / (quantity + x) = targetAvg`:
 *
 *   x = quantity · (targetAvg − entryPrice) / (marketPrice − targetAvg)
 *
 * Returns `null` when the target is unreachable — i.e. `targetAvg` is not
 * strictly between `marketPrice` and `entryPrice` (you cannot average below the
 * price you buy at, nor "down" to at/above your current average).
 */
export function unitsToAverageDown(
  inputs: RepairInputs,
  targetAvg: number,
): number | null {
  const { entryPrice, quantity, marketPrice } = inputs;
  if (!repairIsPossible(entryPrice, marketPrice)) return null;
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (!Number.isFinite(targetAvg)) return null;
  // Target must sit strictly inside (marketPrice, entryPrice).
  if (targetAvg <= marketPrice || targetAvg >= entryPrice) return null;

  const units = (quantity * (targetAvg - entryPrice)) / (marketPrice - targetAvg);
  return units > 0 ? units : null;
}

/** Range/step options for the target-average ladder. */
export interface RepairTargetOptions {
  /** Explicit target averages (high→low); overrides the generated ladder. */
  targets?: number[];
  /** Approximate number of generated steps. Default 6. */
  steps?: number;
}

/**
 * Picks a "nice" round increment (1, 2, 2.5, 5, 10, …) close to `range / steps`,
 * so generated target prices land on readable values.
 */
export function niceStep(range: number, steps = 6): number {
  if (!(range > 0) || !(steps > 0)) return 1;
  const raw = range / steps;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag; // 1 ≤ norm < 10
  let nice: number;
  if (norm <= 1) nice = 1;
  else if (norm <= 2) nice = 2;
  else if (norm <= 2.5) nice = 2.5;
  else if (norm <= 5) nice = 5;
  else nice = 10;
  return nice * mag;
}

/**
 * Builds a descending list of target average prices strictly between
 * `marketPrice` and `entryPrice`. Prefers round numbers via {@link niceStep};
 * falls back to evenly spaced interior values when the round grid is too sparse.
 */
export function buildRepairTargets(
  entryPrice: number,
  marketPrice: number,
  opts: RepairTargetOptions = {},
): number[] {
  if (opts.targets) {
    return opts.targets.filter((t) => t > marketPrice && t < entryPrice);
  }
  if (!repairIsPossible(entryPrice, marketPrice)) return [];

  const steps = opts.steps ?? 6;
  const range = entryPrice - marketPrice;
  const step = niceStep(range, steps);

  const targets: number[] = [];
  // Start at the highest round multiple strictly below the entry price.
  let t = Math.floor((entryPrice - 1e-9) / step) * step;
  if (t >= entryPrice) t -= step;
  while (t > marketPrice + 1e-9) {
    targets.push(Math.round(t * 1e6) / 1e6);
    t -= step;
  }

  // Too sparse (e.g. a narrow gap) → evenly spaced interior points instead.
  if (targets.length < 2) {
    const n = Math.max(2, steps - 1);
    const even: number[] = [];
    for (let i = 1; i <= n; i++) {
      const v = entryPrice - (range * i) / (n + 1);
      even.push(Math.round(v * 1e6) / 1e6);
    }
    return even;
  }
  return targets;
}

/**
 * Computes the full repair ladder: for each target average price, how many
 * units to buy, the cash required, and the resulting total position size/value.
 * Targets that are unreachable are skipped. Returns an empty array when the
 * position cannot be averaged down at all.
 */
export function buildRepairLadder(
  inputs: RepairInputs,
  opts: RepairTargetOptions = {},
): RepairRow[] {
  const { entryPrice, quantity, marketPrice } = inputs;
  if (!repairIsPossible(entryPrice, marketPrice)) return [];
  if (!Number.isFinite(quantity) || quantity <= 0) return [];

  const targets = buildRepairTargets(entryPrice, marketPrice, opts);
  const rows: RepairRow[] = [];
  for (const targetAvg of targets) {
    const unitsToBuy = unitsToAverageDown(inputs, targetAvg);
    if (unitsToBuy == null) continue;
    const newQuantity = quantity + unitsToBuy;
    rows.push({
      targetAvg,
      unitsToBuy,
      costToBuy: unitsToBuy * marketPrice,
      newQuantity,
      newPositionValue: newQuantity * targetAvg,
    });
  }
  return rows;
}
