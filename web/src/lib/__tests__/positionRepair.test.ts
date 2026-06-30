import { describe, it, expect } from 'vitest';
import {
  unitsToTargetAverage,
  buildRepairTargets,
  buildRepairLadder,
  repairIsPossible,
  averageDirection,
  niceStep,
  type RepairInputs,
} from '../positionRepair';

const EXAMPLE: RepairInputs = {
  entryPrice: 300,
  quantity: 2,
  marketPrice: 50,
};

// A winning position, used to exercise the averaging-up direction.
const UP_EXAMPLE: RepairInputs = {
  entryPrice: 100,
  quantity: 2,
  marketPrice: 200,
};

describe('averageDirection', () => {
  it('detects down, up, and the impossible cases', () => {
    expect(averageDirection(300, 50)).toBe('down'); // market below entry
    expect(averageDirection(100, 200)).toBe('up'); // market above entry
    expect(averageDirection(100, 100)).toBeNull(); // equal → nothing to do
    expect(averageDirection(0, 50)).toBeNull();
    expect(averageDirection(300, 0)).toBeNull();
    expect(averageDirection(NaN, 50)).toBeNull();
  });
});

describe('repairIsPossible', () => {
  it('is true whenever the market price differs from a positive entry', () => {
    expect(repairIsPossible(300, 50)).toBe(true); // average down
    expect(repairIsPossible(100, 200)).toBe(true); // average up
    expect(repairIsPossible(300, 300)).toBe(false); // equal
    expect(repairIsPossible(0, 50)).toBe(false);
    expect(repairIsPossible(300, 0)).toBe(false);
    expect(repairIsPossible(NaN, 50)).toBe(false);
  });
});

describe('unitsToTargetAverage (DCA formula)', () => {
  it('matches the worked example when averaging down', () => {
    // x = qty·(target−entry)/(market−target)
    expect(unitsToTargetAverage(EXAMPLE, 250)).toBeCloseTo(0.5);
    expect(unitsToTargetAverage(EXAMPLE, 200)).toBeCloseTo(4 / 3);
    expect(unitsToTargetAverage(EXAMPLE, 100)).toBeCloseTo(8);
    expect(unitsToTargetAverage(EXAMPLE, 75)).toBeCloseTo(18);
  });

  it('also works when averaging up (market above entry)', () => {
    // entry 100, qty 2, market 200, target 120 → x = 2·20/80 = 0.5
    expect(unitsToTargetAverage(UP_EXAMPLE, 120)).toBeCloseTo(0.5);
    // target 150 → x = 2·50/50 = 2
    const x = unitsToTargetAverage(UP_EXAMPLE, 150)!;
    expect(x).toBeCloseTo(2);
    const newAvg =
      (UP_EXAMPLE.quantity * UP_EXAMPLE.entryPrice +
        x * UP_EXAMPLE.marketPrice) /
      (UP_EXAMPLE.quantity + x);
    expect(newAvg).toBeCloseTo(150);
  });

  it('actually produces the target average when applied', () => {
    const target = 120;
    const x = unitsToTargetAverage(EXAMPLE, target)!;
    const newAvg =
      (EXAMPLE.quantity * EXAMPLE.entryPrice + x * EXAMPLE.marketPrice) /
      (EXAMPLE.quantity + x);
    expect(newAvg).toBeCloseTo(target);
  });

  it('returns null for targets outside (market, entry) in either direction', () => {
    expect(unitsToTargetAverage(EXAMPLE, 50)).toBeNull(); // at market
    expect(unitsToTargetAverage(EXAMPLE, 40)).toBeNull(); // below market
    expect(unitsToTargetAverage(EXAMPLE, 300)).toBeNull(); // at entry
    expect(unitsToTargetAverage(EXAMPLE, 350)).toBeNull(); // above entry
    expect(unitsToTargetAverage(UP_EXAMPLE, 100)).toBeNull(); // at entry
    expect(unitsToTargetAverage(UP_EXAMPLE, 250)).toBeNull(); // above market
  });

  it('returns null for invalid positions', () => {
    expect(unitsToTargetAverage({ ...EXAMPLE, quantity: 0 }, 100)).toBeNull();
    expect(
      unitsToTargetAverage({ ...EXAMPLE, marketPrice: 300 }, 250),
    ).toBeNull(); // market == entry
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

  it('generates ascending round targets when averaging up', () => {
    const targets = buildRepairTargets(100, 200);
    // Strictly inside (100, 200), ascending toward the higher market price.
    expect(targets).toEqual([120, 140, 160, 180]);
    for (const t of targets) {
      expect(t).toBeGreaterThan(100);
      expect(t).toBeLessThan(200);
    }
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

  it('returns an empty list when averaging is impossible (market == entry)', () => {
    expect(buildRepairTargets(100, 100)).toEqual([]);
  });
});

describe('buildRepairLadder', () => {
  it('computes units, cost and new position value per target (down)', () => {
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

  it('computes an ascending ladder when averaging up', () => {
    const rows = buildRepairLadder(UP_EXAMPLE);
    const targets = rows.map((r) => r.targetAvg);
    expect(targets).toEqual([...targets].sort((a, b) => a - b)); // ascending
    expect(targets.every((t) => t > 100 && t < 200)).toBe(true);

    // Cost-basis identity still holds when averaging up.
    const originalCost = UP_EXAMPLE.quantity * UP_EXAMPLE.entryPrice;
    for (const r of rows) {
      expect(r.newPositionValue).toBeCloseTo(originalCost + r.costToBuy);
    }
  });

  it('returns an empty ladder for an un-averageable position', () => {
    expect(buildRepairLadder({ ...EXAMPLE, marketPrice: 300 })).toEqual([]); // market == entry
    expect(buildRepairLadder({ ...EXAMPLE, quantity: 0 })).toEqual([]);
  });
});
