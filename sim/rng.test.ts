import { describe, expect, it } from "vitest";
import { gini, median, percentile } from "./metrics.ts";
import { Rng, stream } from "./rng.ts";

describe("Rng", () => {
  it("is deterministic per seed and differs across seeds and labels", () => {
    const seq = (r: Rng) => Array.from({ length: 5 }, () => r.nextU32());
    expect(seq(new Rng(1))).toEqual(seq(new Rng(1)));
    expect(seq(new Rng(1))).not.toEqual(seq(new Rng(2)));
    expect(seq(stream(1, "activity", 0))).not.toEqual(seq(stream(1, "activity", 1)));
  });

  it("produces plausible uniform, bernoulli and poisson statistics", () => {
    const r = new Rng(123);
    const n = 20_000;
    let sum = 0;
    let hits = 0;
    let pois = 0;
    for (let i = 0; i < n; i++) {
      const u = r.next();
      expect(u >= 0 && u < 1).toBe(true);
      sum += u;
      if (r.bernoulli(0.3)) hits++;
      pois += r.poisson(0.8);
    }
    expect(sum / n).toBeCloseTo(0.5, 1);
    expect(hits / n).toBeCloseTo(0.3, 1);
    expect(pois / n).toBeCloseTo(0.8, 1);
  });

  it("int stays in range and shuffled is a permutation", () => {
    const r = new Rng(9);
    for (let i = 0; i < 1000; i++) {
      const k = r.intBetween(3, 5);
      expect(k >= 3 && k <= 5).toBe(true);
    }
    expect(r.shuffled([1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("metrics", () => {
  it("computes Gini on known distributions", () => {
    expect(gini([5, 5, 5, 5])).toBe(0);
    expect(gini([0, 0, 0, 1])).toBeCloseTo(0.75);
    expect(gini([0, 0, 0, 0, 0, 0, 0, 100])).toBeCloseTo(0.875);
    expect(gini([0, 0])).toBe(0);
  });

  it("computes median and percentiles, including infinities", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(percentile([1, 2, 3, 4, 5], 0.9)).toBeCloseTo(4.6);
    expect(median([1, Infinity, Infinity])).toBe(Infinity);
  });
});
