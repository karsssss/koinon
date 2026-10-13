import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { allocateSeasonRewards, mafiaSeasonPoints, type MafiaPlayerResult } from "./season.ts";

const base: MafiaPlayerResult = { memberId: "a", team: "town", faded: false, aliveAtEnd: false, missionCompleted: false };

describe("mafiaSeasonPoints (GAMES.md §4.1)", () => {
  it("scores win, draw, survival and mission; faded players get 0", () => {
    expect(mafiaSeasonPoints(base, "town")).toBe(2 + 6);
    expect(mafiaSeasonPoints(base, "mafia")).toBe(2);
    expect(mafiaSeasonPoints({ ...base, aliveAtEnd: true, missionCompleted: true }, "draw")).toBe(2 + 3 + 1 + 2);
    expect(mafiaSeasonPoints({ ...base, team: "mafia", aliveAtEnd: true, missionCompleted: true }, "mafia")).toBe(11);
    expect(mafiaSeasonPoints({ ...base, faded: true, missionCompleted: true }, "town")).toBe(0);
  });
});

describe("allocateSeasonRewards (I8)", () => {
  it("pays points × rate when under budget", () => {
    expect(allocateSeasonRewards([{ memberId: "a", points: 8 }], 5, 400)).toEqual([{ memberId: "a", coins: 40 }]);
  });

  it("scales down with floor when over budget and never exceeds it", () => {
    const lines = allocateSeasonRewards([{ memberId: "a", points: 11 }, { memberId: "b", points: 11 }, { memberId: "c", points: 1 }], 10, 100);
    expect(lines.map((l) => l.coins)).toEqual([47, 47, 4]);
  });

  it("property: integers, non-negative, total ≤ budget, monotone in points", () => {
    fc.assert(
      fc.property(fc.array(fc.nat(11), { minLength: 1, maxLength: 8 }), fc.integer({ min: 0, max: 20 }), fc.integer({ min: 0, max: 2000 }), (pts, rate, budget) => {
        const lines = allocateSeasonRewards(pts.map((p, i) => ({ memberId: String(i), points: p })), rate, budget);
        const total = lines.reduce((s, l) => s + l.coins, 0);
        expect(total).toBeLessThanOrEqual(Math.max(budget, 0));
        lines.forEach((l, i) => {
          expect(Number.isInteger(l.coins) && l.coins >= 0).toBe(true);
          lines.forEach((m, j) => {
            if ((pts[i] ?? 0) > (pts[j] ?? 0)) expect(l.coins).toBeGreaterThanOrEqual(m.coins);
          });
        });
      }),
      { seed: 11, numRuns: 300 },
    );
  });
});
