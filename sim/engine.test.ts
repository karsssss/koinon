import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MINT_ACCOUNT, walletAccount, type TransactionSpec } from "../shared/domain/ledger.ts";
import { buildConfig, DEFAULT_ARCHETYPES, overrideFromPath, type ConfigOverrides } from "./config.ts";
import { runSimulation, type RunResult } from "./engine.ts";
import { canonicalJson, runCell, runFullReport, seedList } from "./experiments.ts";
import { SimLedger } from "./ledger.ts";
import { renderReport } from "./report.ts";

const perfect = DEFAULT_ARCHETYPES.map((a) => ({ ...a, pActive: 1, pDigestGivenActive: 1, churnAfterDay: null }));
const quiet: ConfigOverrides = { wagers: { enabled: false }, transfers: { enabled: false }, seasons: { enabled: false } };

/** The supply identity every run must satisfy: sources − sinks = supply = Σ wallets + escrow. */
function expectConserved(r: RunResult): void {
  const held = r.players.reduce((s, p) => s + p.finalBalance, 0) + r.flows.escrowOutstanding;
  expect(r.sources.total - r.sinks.total).toBe(r.summary.supply);
  expect(r.summary.supply).toBe(held);
  for (const p of r.players) {
    expect(Number.isSafeInteger(p.finalBalance)).toBe(true);
    expect(p.finalBalance).toBeGreaterThanOrEqual(0);
  }
}

describe("determinism", () => {
  it("same config gives byte-identical results; another seed differs", () => {
    const cfg = buildConfig({ seed: 99, days: 60, engagement: "high" });
    expect(canonicalJson(runSimulation(cfg))).toBe(canonicalJson(runSimulation(cfg)));
    expect(canonicalJson(runSimulation({ ...cfg, seed: 100 }))).not.toBe(canonicalJson(runSimulation(cfg)));
  });

  it("the full report renders identically on rerun", () => {
    const a = renderReport(runFullReport(5, 2, 30));
    expect(renderReport(runFullReport(5, 2, 30))).toBe(a);
    expect(renderReport(runFullReport(6, 2, 30))).not.toBe(a);
  });
});

describe("issuance accounting", () => {
  it("with everyone always active, supply is exactly 8 × (1 + 30 × days)", () => {
    for (const days of [1, 30, 90]) {
      const r = runSimulation(buildConfig(quiet, { archetypes: perfect, days }));
      expect(r.summary.supply).toBe(8 * (1 + 30 * days));
      expect(r.players.every((p) => p.finalBalance === 1 + 30 * days)).toBe(true);
      expect(r.sources).toEqual({ genesis: 8, checkin: 80 * days, digest: 160 * days, season: 0, total: 8 * (1 + 30 * days) });
    }
  });

  it("daily mints follow the configured issuance values", () => {
    const r = runSimulation(buildConfig(quiet, { archetypes: perfect, days: 10, issuance: { checkin: 7, digest: 13 } }));
    expect(r.summary.supply).toBe(8 * (1 + 20 * 10));
  });

  it("digests are never minted without a verifier", () => {
    const solo = DEFAULT_ARCHETYPES.map((a, i) => ({ ...a, pActive: i === 0 ? 1 : 0, pDigestGivenActive: 1, churnAfterDay: null }));
    const r = runSimulation(buildConfig(quiet, { archetypes: solo, days: 20 }));
    expect(r.activity.digestsPosted).toBe(20);
    expect(r.sources.digest).toBe(0);
  });
});

describe("zero-sum flows and sinks", () => {
  it("wagers and transfers move coins but never change supply", () => {
    const base = buildConfig({ seed: 3, days: 120, seasons: { enabled: false } });
    const withFlows = runSimulation(base);
    const without = runSimulation(buildConfig({ seed: 3, days: 120 }, quiet));
    expect(withFlows.flows.wagerVolume).toBeGreaterThan(0);
    expect(withFlows.flows.transferVolume).toBeGreaterThan(0);
    expect(withFlows.summary.supply).toBe(without.summary.supply);
    expectConserved(withFlows);
  });

  it("purchases and rake reduce supply by exactly what they burn", () => {
    const off = runSimulation(buildConfig({ seed: 4, days: 120 }));
    const on = runSimulation(buildConfig({ seed: 4, days: 120, sinks: { enabled: true, pPurchasePerActiveDay: 0.1 }, wagers: { rakeBps: 500 } }));
    expect(on.sinks.purchase).toBeGreaterThan(0);
    expect(on.sinks.rake).toBeGreaterThan(0);
    expect(on.sources.total).toBe(off.sources.total);
    expect(on.summary.supply).toBe(on.sources.total - on.sinks.total);
    expectConserved(on);
  });
});

describe("constraints", () => {
  it("never stakes more than the wealth cap allows", () => {
    for (const bps of [2500, 5000]) {
      const r = runSimulation(buildConfig({ seed: 8, days: 180, engagement: "high", wagers: { cap: { maxStakeBps: bps } } }));
      expect(r.flows.offersAccepted).toBeGreaterThan(0);
      expect(r.flows.maxStakeShareObserved).toBeLessThanOrEqual(bps / 10_000);
    }
  });

  it("season mints never exceed the budget (I8)", () => {
    const r = runSimulation(buildConfig({ seed: 2, days: 180, archetypes: perfect, seasons: { budget: 50, coinsPerPoint: 10 } }));
    expect(r.seasons.held).toBeGreaterThan(0);
    expect(r.seasons.maxSeasonMint).toBeLessThanOrEqual(50);
  });

  it("skips seasons below the opt-in minimum", () => {
    const r = runSimulation(buildConfig({ seed: 2, days: 90, seasons: { minParticipants: 9 } }));
    expect(r.seasons.held).toBe(0);
    expect(r.sources.season).toBe(0);
  });
});

describe("SimLedger", () => {
  const spec: TransactionSpec = { kind: "CHECKIN", idempotencyKey: "checkin:a:1", postings: [{ account: MINT_ACCOUNT, delta: -10 }, { account: walletAccount("a"), delta: 10 }] };

  it("replays an idempotency key without double-crediting and rejects conflicting payloads", () => {
    const l = new SimLedger();
    expect(l.post(spec).replayed).toBe(false);
    expect(l.post(spec).replayed).toBe(true);
    expect(l.balance(walletAccount("a"))).toBe(10);
    expect(() => l.post({ ...spec, postings: [{ account: MINT_ACCOUNT, delta: -20 }, { account: walletAccount("a"), delta: 20 }] })).toThrow(/IDEMPOTENCY_CONFLICT/);
  });

  it("detects a tampered cached balance in the full audit", () => {
    const l = new SimLedger();
    l.post(spec);
    l.assertInvariants(true);
    l.corruptBalanceForTest(walletAccount("a"), 11);
    expect(() => l.assertInvariants(true)).toThrow(/I5/);
  });
});

describe("property: random configurations conserve coins", () => {
  it("never throws, keeps the supply identity, and keeps every wallet a non-negative integer", () => {
    const arbConfig = fc.record({
      seed: fc.nat(),
      days: fc.integer({ min: 1, max: 60 }),
      engagement: fc.constantFrom("low" as const, "medium" as const, "high" as const),
      checkin: fc.integer({ min: 0, max: 50 }),
      digest: fc.integer({ min: 0, max: 50 }),
      window: fc.integer({ min: 1, max: 60 }),
      rate: fc.double({ min: 0, max: 5, noNaN: true }),
      capBps: fc.integer({ min: 0, max: 10_000 }),
      minBal: fc.integer({ min: 0, max: 100 }),
      rakeBps: fc.integer({ min: 0, max: 2000 }),
      sinks: fc.boolean(),
      budget: fc.integer({ min: 0, max: 2000 }),
    });
    fc.assert(
      fc.property(arbConfig, (c) => {
        const r = runSimulation(
          buildConfig({
            seed: c.seed,
            days: c.days,
            engagement: c.engagement,
            issuance: { checkin: c.checkin, digest: c.digest },
            engagementModel: { wagerScale: { [c.engagement]: c.rate } },
            wagers: { acceptanceWindowMinutes: c.window, rakeBps: c.rakeBps, cap: { maxStakeBps: c.capBps, minBalanceToWager: c.minBal } },
            sinks: { enabled: c.sinks },
            seasons: { budget: c.budget, firstStartDay: 1, minParticipants: 4 },
          }),
        );
        expectConserved(r);
        expect(r.seasons.maxSeasonMint).toBeLessThanOrEqual(c.budget);
      }),
      { seed: 2026, numRuns: 80 },
    );
  });
});

describe("sanity of scenarios", () => {
  it("supply increases with engagement", () => {
    const seeds = seedList(1, 20);
    const s = (e: "low" | "medium" | "high") => runCell(e, e, 90, seeds).metrics.supply?.p50 ?? 0;
    expect(s("low")).toBeLessThan(s("medium"));
    expect(s("medium")).toBeLessThan(s("high"));
  });

  it("--set overrides only accept known paths", () => {
    expect(overrideFromPath("wagers.rakeBps", "500")).toEqual({ wagers: { rakeBps: 500 } });
    expect(() => overrideFromPath("wagers.nope", "1")).toThrow(/Unknown config path/);
  });
});
