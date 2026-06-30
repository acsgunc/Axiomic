/**
 * Pure helpers for the **Position Repair / Average** tool.
 *
 * Given a position — `quantity` units bought at an `entryPrice` average, now
 * trading at a different `marketPrice` — these functions compute how many extra
 * units to buy at the current price to move the blended average to a series of
 * target averages, and the cost/value of doing so. They work in **both**
 * directions:
 *  - **Averaging down** (`marketPrice < entryPrice`): pull a losing position's
 *    average down toward the lower market price.
 *  - **Averaging up** (`marketPrice > entryPrice`): raise a winning position's
 *    average up toward the higher market price (e.g. to lift the cost basis).
 *
 * The same DCA identity governs both:
 *   (quantity·entryPrice + x·marketPrice) / (quantity + x) = targetAvg
 *   ⇒ x = quantity · (targetAvg − entryPrice) / (marketPrice − targetAvg)
 * which is only reachable when `targetAvg` lies strictly between `marketPrice`
 * and `entryPrice`.
 *
 * Kept free of React/DOM so the dollar-cost-averaging math is unit-testable.
 */

/** The current position to adjust. */
export interface RepairInputs {
  /** Original average price paid per unit. */
  entryPrice: number;
  /** Units currently held. */
  quantity: number;
  /** Price you can buy more units at right now. */
  marketPrice: number;
}

/** Which way buying more at the market price moves the average. */
export type AverageDirection = 'down' | 'up';

/** One row of the ladder for a single target average price. */
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

/**
 * The direction buying more at `marketPrice` would move the average, or `null`
 * when averaging is impossible (non-positive prices, or market == entry so
 * there is nothing to move toward).
 */
export function averageDirection(
  entryPrice: number,
  marketPrice: number,
): AverageDirection | null {
  if (
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(marketPrice) ||
    entryPrice <= 0 ||
    marketPrice <= 0 ||
    marketPrice === entryPrice
  ) {
    return null;
  }
  return marketPrice < entryPrice ? 'down' : 'up';
}

/** Whether the position can be averaged at all (in either direction). */
export function repairIsPossible(entryPrice: number, marketPrice: number): boolean {
  return averageDirection(entryPrice, marketPrice) !== null;
}

/**
 * Units to buy at `marketPrice` to move the blended average from `entryPrice`
 * (over `quantity` units) to `targetAvg`, in whichever direction applies.
 *
 *   x = quantity · (targetAvg − entryPrice) / (marketPrice − targetAvg)
 *
 * Returns `null` when the target is unreachable — i.e. `targetAvg` is not
 * strictly between `marketPrice` and `entryPrice` (you cannot move the average
 * past the price you buy at, nor to/beyond your current average).
 */
export function unitsToTargetAverage(
  inputs: RepairInputs,
  targetAvg: number,
): number | null {
  const { entryPrice, quantity, marketPrice } = inputs;
  if (!repairIsPossible(entryPrice, marketPrice)) return null;
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (!Number.isFinite(targetAvg)) return null;

  // Target must sit strictly inside the open interval (market, entry).
  const lo = Math.min(marketPrice, entryPrice);
  const hi = Math.max(marketPrice, entryPrice);
  if (targetAvg <= lo || targetAvg >= hi) return null;

  const units = (quantity * (targetAvg - entryPrice)) / (marketPrice - targetAvg);
  return units > 0 ? units : null;
}

/** Range/step options for the target-average ladder. */
export interface RepairTargetOptions {
  /** Explicit target averages; overrides the generated ladder. */
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
 * Builds a list of target average prices strictly between `marketPrice` and
 * `entryPrice`, ordered from nearest the entry price outward toward the market
 * price (descending when averaging down, ascending when averaging up). Prefers
 * round numbers via {@link niceStep}; falls back to evenly spaced interior
 * values when the round grid is too sparse.
 */
export function buildRepairTargets(
  entryPrice: number,
  marketPrice: number,
  opts: RepairTargetOptions = {},
): number[] {
  const dir = averageDirection(entryPrice, marketPrice);
  const lo = Math.min(marketPrice, entryPrice);
  const hi = Math.max(marketPrice, entryPrice);

  // Down → descending toward the lower market price; up → ascending toward the
  // higher market price. Either way: ordered by increasing distance from entry.
  const order = (xs: number[]) =>
    dir === 'up' ? xs.sort((a, b) => a - b) : xs.sort((a, b) => b - a);

  if (opts.targets) {
    return order(opts.targets.filter((t) => t > lo && t < hi));
  }
  if (!dir) return [];

  const steps = opts.steps ?? 6;
  const range = hi - lo;
  const step = niceStep(range, steps);

  const targets: number[] = [];
  // Collect every round multiple strictly inside (lo, hi).
  let t = Math.ceil((lo + 1e-9) / step) * step;
  while (t < hi - 1e-9) {
    targets.push(Math.round(t * 1e6) / 1e6);
    t += step;
  }

  // Too sparse (e.g. a narrow gap) → evenly spaced interior points instead.
  if (targets.length < 2) {
    const n = Math.max(2, steps - 1);
    const even: number[] = [];
    for (let i = 1; i <= n; i++) {
      const v = lo + (range * i) / (n + 1);
      even.push(Math.round(v * 1e6) / 1e6);
    }
    return order(even);
  }
  return order(targets);
}

/**
 * Computes the full averaging ladder: for each target average price, how many
 * units to buy, the cash required, and the resulting total position size/value.
 * Targets that are unreachable are skipped. Returns an empty array when the
 * position cannot be averaged at all.
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
    const unitsToBuy = unitsToTargetAverage(inputs, targetAvg);
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
