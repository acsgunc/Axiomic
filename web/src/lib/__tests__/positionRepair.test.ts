import { describe, it, expect } from 'vitest';
import {
  unitsToAverageDown,
  buildRepairTargets,
  buildRepairLadder,
  repairIsPossible,
  niceStep,
  type RepairInputs,
} from '../positionRepair';

const EXAMPLE: RepairInputs = {
  entryPrice: 300,
  quantity: 2,
  marketPrice: 50,
};

describe('repairIsPossible', () => {
  it('requires a positive market price strictly below the entry price', () => {
    expect(repairIsPossible(300, 50)).toBe(true);
    expect(repairIsPossible(300, 300)).toBe(false); // equal → no averaging down
    expect(repairIsPossible(300, 350)).toBe(false); // higher → averages up
    expect(repairIsPossible(0, 50)).toBe(false);
    expect(repairIsPossible(300, 0)).toBe(false);
    expect(repairIsPossible(NaN, 50)).toBe(false);
  });
});

describe('unitsToAverageDown (DCA formula)', () => {
  it('matches the worked example for several targets', () => {
    // x = qty·(target−entry)/(market−target)
    expect(unitsToAverageDown(EXAMPLE, 250)).toBeCloseTo(0.5);
    expect(unitsToAverageDown(EXAMPLE, 200)).toBeCloseTo(4 / 3);
    expect(unitsToAverageDown(EXAMPLE, 100)).toBeCloseTo(8);
    expect(unitsToAverageDown(EXAMPLE, 75)).toBeCloseTo(18);
  });

  it('actually produces the target average when applied', () => {
    const target = 120;
    const x = unitsToAverageDown(EXAMPLE, target)!;
    const newAvg =
      (EXAMPLE.quantity * EXAMPLE.entryPrice + x * EXAMPLE.marketPrice) /
      (EXAMPLE.quantity + x);
    expect(newAvg).toBeCloseTo(target);
  });

  it('returns null for targets outside (market, entry)', () => {
    expect(unitsToAverageDown(EXAMPLE, 50)).toBeNull(); // at market
    expect(unitsToAverageDown(EXAMPLE, 40)).toBeNull(); // below market
    expect(unitsToAverageDown(EXAMPLE, 300)).toBeNull(); // at entry
    expect(unitsToAverageDown(EXAMPLE, 350)).toBeNull(); // above entry
  });

  it('returns null for invalid positions', () => {
    expect(unitsToAverageDown({ ...EXAMPLE, quantity: 0 }, 100)).toBeNull();
    expect(
      unitsToAverageDown({ ...EXAMPLE, marketPrice: 400 }, 350),
    ).toBeNull();
  });
});

describe('niceStep', () => {
  it('picks a readable round increment near range/steps', () => {
    expect(niceStep(250, 6)).toBe(50); // 250/6 ≈ 41.7 → 50
    expect(niceStep(10, 5)).toBe(2); // 10/5 = 2
    expect(niceStep(100, 4)).toBe(25); // 100/4 = 25
  });
});

describe('buildRepairTargets', () => {
  it('generates descending round targets strictly inside (market, entry)', () => {
    const targets = buildRepairTargets(300, 50);
    expect(targets).toEqual([250, 200, 150, 100]);
    expect(Math.max(...targets)).toBeLessThan(300);
    expect(Math.min(...targets)).toBeGreaterThan(50);
  });

  it('honours an explicit targets override, filtering invalid ones', () => {
    const targets = buildRepairTargets(300, 50, {
      targets: [250, 200, 150, 100, 75, 40, 320],
    });
    // 40 (≤ market) and 320 (≥ entry) are dropped.
    expect(targets).toEqual([250, 200, 150, 100, 75]);
  });

  it('falls back to evenly spaced interior points for a narrow gap', () => {
    const targets = buildRepairTargets(10, 9.5, { steps: 4 });
    expect(targets.length).toBeGreaterThanOrEqual(2);
    for (const t of targets) {
      expect(t).toBeGreaterThan(9.5);
      expect(t).toBeLessThan(10);
    }
  });

  it('returns an empty list when averaging down is impossible', () => {
    expect(buildRepairTargets(50, 300)).toEqual([]);
  });
});

describe('buildRepairLadder', () => {
  it('computes units, cost and new position value per target', () => {
    const rows = buildRepairLadder(EXAMPLE);
    expect(rows.map((r) => r.targetAvg)).toEqual([250, 200, 150, 100]);

    const at100 = rows.find((r) => r.targetAvg === 100)!;
    expect(at100.unitsToBuy).toBeCloseTo(8);
    expect(at100.costToBuy).toBeCloseTo(400); // 8 × 50
    expect(at100.newQuantity).toBeCloseTo(10); // 2 + 8
    expect(at100.newPositionValue).toBeCloseTo(1000); // 10 × 100

    // New position value always equals original cost + new cost.
    const originalCost = EXAMPLE.quantity * EXAMPLE.entryPrice;
    for (const r of rows) {
      expect(r.newPositionValue).toBeCloseTo(originalCost + r.costToBuy);
    }
  });

  it('returns an empty ladder for an un-repairable position', () => {
    expect(buildRepairLadder({ ...EXAMPLE, marketPrice: 400 })).toEqual([]);
    expect(buildRepairLadder({ ...EXAMPLE, quantity: 0 })).toEqual([]);
  });
});
