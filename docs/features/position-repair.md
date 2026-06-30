# Position Repair (Average Down / Up)

## Summary

The actionable half of the averaging tool. Enter a position — your original
average entry price, the units you hold, and the current market price — and get
a **dynamic table** showing how many units to buy now to move your blended
average to a series of target averages, with the cash required and the resulting
total position value. It works in **both directions**: average **down** when the
market price is below your entry (repair a loser), or average **up** when it is
above your entry (lift the cost basis of a winner).

## Status

- **Added** — 2026-07-01
- **Changed** — 2026-07-01 — added a **Custom** target-averages mode (enter your
  own target prices instead of the auto-generated round ladder).
- **Changed** — 2026-07-01 — added **averaging up** (market price above entry);
  the tool auto-detects the direction and labels it.

## How to use

1. Run the app (`pnpm --dir web dev`) and open the **Average Down** view, then
   the **Position Repair** sub-tab.
2. Enter your position:
   - **Entry price (avg paid)** — e.g. `300`
   - **Current quantity** — e.g. `2`
   - **Current market price** — e.g. `50`
3. The table updates live with one row per target average (generated as round
   values strictly between the market and entry price, e.g. `250 / 200 / 150 /
   100` averaging down, ascending when averaging up):
   - **Target Avg** — the average price the position would reach.
   - **Units to Buy** — extra units to buy now (DCA formula).
   - **Cost to Buy** — `units × market price`.
   - **New Position Value** — total invested afterwards (`new qty × target avg`),
     with the new total unit count shown alongside.
4. The panel auto-detects whether you are **averaging down** (market below
   entry) or **averaging up** (market above entry) and labels it; the table
   title switches between **Average Down** and **Average Up** accordingly.
5. **Target averages** can be **Auto** (round values generated for you) or
   **Custom** — switch to Custom and type your own comma- or space-separated
   target prices (e.g. `250, 200, 150, 100, 75`). Only values strictly between
   the market price and your entry price are reachable; any outside that range
   are skipped with a note.

The DCA formula used for each row is:

$$\text{units} = \text{qty} \times \frac{\text{target} - \text{entry}}{\text{market} - \text{target}}$$

The same formula serves both directions; a target is only reachable when it sits
strictly between the market price and the entry price. When the market price
equals your entry there is nothing to average toward, and the panel says so.

### Worked example — averaging down (entry 300, qty 2, market 50)

| Target Avg | Units to Buy | Cost to Buy | New Position Value |
| ---------- | ------------ | ----------- | ------------------ |
| 250        | 0.5          | 25.00       | 625.00 (2.5u)      |
| 200        | 1.3333       | 66.67       | 666.67 (3.3333u)   |
| 150        | 3            | 150.00      | 750.00 (5u)        |
| 100        | 8            | 400.00      | 1,000.00 (10u)     |

### Worked example — averaging up (entry 100, qty 2, market 200)

| Target Avg | Units to Buy | Cost to Buy | New Position Value |
| ---------- | ------------ | ----------- | ------------------ |
| 120        | 0.5          | 100.00      | 300.00 (2.5u)      |
| 150        | 2            | 400.00      | 600.00 (4u)        |
| 180        | 8            | 1,600.00    | 1,800.00 (10u)     |

## Source

- [web/src/lib/positionRepair.ts](../../web/src/lib/positionRepair.ts) — pure DCA
  math (`unitsToTargetAverage`, `averageDirection`, `buildRepairTargets`,
  `buildRepairLadder`, `repairIsPossible`, `niceStep`).
- [web/src/components/PositionRepairPanel.tsx](../../web/src/components/PositionRepairPanel.tsx)
  — inputs + dynamic repair table.
- [web/src/components/AverageDownView.tsx](../../web/src/components/AverageDownView.tsx)
  — sub-tab nav grouping **Price Tiers** + **Position Repair**.
- [web/src/App.tsx](../../web/src/App.tsx) — the **Average Down** top-nav view.

## Notes / caveats

- Units are kept fractional (suitable for crypto/contracts); for whole-share
  instruments round up to guarantee the target average is met.
- The same DCA math drives both directions — the only difference is whether the
  reachable target interval sits below your entry (down) or above it (up).
- Target averages are generated dynamically from your inputs; pass an explicit
  `targets` array to `buildRepairLadder` to override them. In the UI this is the
  **Custom** target-averages mode, where you type your own prices.
- **New Position Value** is the total cost basis (capital deployed), which
  always equals your original cost plus the new **Cost to Buy**.
- Pairs with [Price Targets](./price-targets.md) (the **Price Tiers** sub-tab),
  which visualises the percentage moves a position can travel through.
