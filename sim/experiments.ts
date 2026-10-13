// Scenario matrix, multi-seed aggregation and one-at-a-time sensitivity analysis.

import { createHash } from "node:crypto";
import { buildConfig, DEFAULT_ARCHETYPES, ENGAGEMENT_LEVELS, HORIZONS, type ConfigOverrides, type EngagementLevel } from "./config.ts";
import { runSimulation, type RunResult } from "./engine.ts";
import { mean, percentile } from "./metrics.ts";
import { hashLabels } from "./rng.ts";

export const DEFAULT_BASE_SEED = 20261013;
export const DEFAULT_SEEDS_PER_CELL = 200;

export function seedList(baseSeed: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => hashLabels(baseSeed, "run", i));
}

export interface Dist {
  readonly p10: number;
  readonly p50: number;
  readonly p90: number;
  readonly mean: number;
}

export function dist(xs: readonly number[]): Dist {
  return { p10: percentile(xs, 0.1), p50: percentile(xs, 0.5), p90: percentile(xs, 0.9), mean: mean(xs) };
}

export interface Metric {
  readonly key: string;
  readonly label: string;
  readonly kind: "coins" | "ratio" | "percent" | "count" | "days";
  readonly get: (r: RunResult) => number;
}

const share = (num: number, den: number) => (den === 0 ? 0 : num / den);

export const METRICS: readonly Metric[] = [
  { key: "supply", label: "Supply (minted − burned)", kind: "coins", get: (r) => r.summary.supply },
  { key: "medianWallet", label: "Median wallet", kind: "coins", get: (r) => r.summary.medianWallet },
  { key: "maxWallet", label: "Max wallet", kind: "coins", get: (r) => r.summary.maxWallet },
  { key: "gini", label: "Gini (wallets)", kind: "ratio", get: (r) => r.summary.gini },
  { key: "nearZeroShare", label: "Near-zero player-days (<10)", kind: "percent", get: (r) => r.summary.nearZeroPlayerDayShare },
  { key: "nearZeroAtEnd", label: "Near-zero wallets at end", kind: "count", get: (r) => r.summary.nearZeroAtEnd },
  { key: "walletMilestone", label: "Players ≥10,000 wallet", kind: "count", get: (r) => r.summary.walletMilestonePlayers },
  { key: "lifetimeMilestone", label: "Players ≥10,000 lifetime minted", kind: "count", get: (r) => r.summary.lifetimeMilestonePlayers },
  { key: "projectedDays", label: "Projected days to 10,000 lifetime (median player)", kind: "days", get: (r) => r.summary.medianProjectedDaysToLifetimeMilestone },
  { key: "dailyMintPerActiveDay", label: "Daily mint per active player-day", kind: "coins", get: (r) => r.summary.dailyMintPerActivePlayerDay },
  { key: "seasonCoinsPerParticipant", label: "Season coins per participant-season", kind: "coins", get: (r) => r.summary.seasonCoinsPerParticipant },
  { key: "mintedPerPlayer", label: "Total minted per player", kind: "coins", get: (r) => r.summary.mintedPerPlayer },
  { key: "srcCheckin", label: "Source: check-in", kind: "coins", get: (r) => r.sources.checkin },
  { key: "srcDigest", label: "Source: digest", kind: "coins", get: (r) => r.sources.digest },
  { key: "srcSeason", label: "Source: season rewards", kind: "coins", get: (r) => r.sources.season },
  { key: "srcGenesis", label: "Source: genesis", kind: "coins", get: (r) => r.sources.genesis },
  { key: "sinkPurchase", label: "Sink: purchases", kind: "coins", get: (r) => r.sinks.purchase },
  { key: "sinkRake", label: "Sink: rake", kind: "coins", get: (r) => r.sinks.rake },
  { key: "wagerVolume", label: "Matched wager volume", kind: "coins", get: (r) => r.flows.wagerVolume },
  { key: "betsMatched", label: "Bets matched", kind: "count", get: (r) => r.flows.offersAccepted },
  { key: "acceptRate", label: "Bets matched / bets proposed", kind: "percent", get: (r) => share(r.flows.offersAccepted, r.flows.offersMade) },
  { key: "expiredRate", label: "Bets expired / bets proposed", kind: "percent", get: (r) => share(r.flows.offersExpired, r.flows.offersMade) },
  { key: "blockedByCap", label: "Offers blocked by wager cap", kind: "count", get: (r) => r.flows.offersBlockedByCap },
  { key: "transferVolume", label: "Transfer volume", kind: "coins", get: (r) => r.flows.transferVolume },
  { key: "seasonsHeld", label: "Seasons held", kind: "count", get: (r) => r.seasons.held },
  { key: "seasonsSkipped", label: "Seasons skipped (<7 opt-ins)", kind: "count", get: (r) => r.seasons.skipped },
];

export function metric(key: string): Metric {
  const m = METRICS.find((x) => x.key === key);
  if (!m) throw new Error(`unknown metric ${key}`);
  return m;
}

export interface CellResult {
  readonly label: string;
  readonly engagement: EngagementLevel;
  readonly days: number;
  readonly runs: number;
  readonly metrics: Readonly<Record<string, Dist>>;
  readonly conservation: { transactions: number; postings: number; invariantChecks: number; identityHeldRuns: number };
}

export function runCell(label: string, engagement: EngagementLevel, days: number, seeds: readonly number[], overrides: readonly ConfigOverrides[] = []): CellResult {
  const results = seeds.map((seed) => runSimulation(buildConfig(...overrides, { seed, days, engagement })));
  const metrics: Record<string, Dist> = {};
  for (const m of METRICS) metrics[m.key] = dist(results.map(m.get));
  const conservation = { transactions: 0, postings: 0, invariantChecks: 0, identityHeldRuns: 0 };
  for (const r of results) {
    conservation.transactions += r.conservation.transactions;
    conservation.postings += r.conservation.postings;
    conservation.invariantChecks += r.conservation.invariantChecks;
    const held = r.players.reduce((s, p) => s + p.finalBalance, 0) + r.flows.escrowOutstanding;
    if (r.sources.total - r.sinks.total === r.summary.supply && r.summary.supply === held) conservation.identityHeldRuns++;
  }
  return { label, engagement, days, runs: results.length, metrics, conservation };
}

export interface Variant {
  readonly group: string;
  readonly label: string;
  readonly overrides: readonly ConfigOverrides[];
}

function archetypesWith(id: string, patch: Partial<(typeof DEFAULT_ARCHETYPES)[number]>) {
  return DEFAULT_ARCHETYPES.map((a) => (a.id === id ? { ...a, ...patch } : a));
}

/** One parameter changes at a time, around the medium-engagement baseline. */
export const SENSITIVITY: readonly Variant[] = [
  { group: "Baseline", label: "Spec defaults", overrides: [] },
  { group: "Issuance", label: "Digest 10 (vs 20)", overrides: [{ issuance: { digest: 10 } }] },
  { group: "Issuance", label: "Digest 30", overrides: [{ issuance: { digest: 30 } }] },
  { group: "Issuance", label: "Check-in 5 (vs 10)", overrides: [{ issuance: { checkin: 5 } }] },
  { group: "Participation", label: "Digest needs same-day verifier (no grace)", overrides: [{ digestGraceNextDay: false }] },
  { group: "Wagers", label: "No wagering", overrides: [{ wagers: { enabled: false } }] },
  { group: "Wagers", label: "Wager rate ×3", overrides: [{ engagementModel: { wagerScale: { medium: 3 } } }] },
  { group: "Wagers", label: "Acceptance window 30 min (vs 5)", overrides: [{ wagers: { acceptanceWindowMinutes: 30 } }] },
  { group: "Wagers", label: "Sharp edge +0.20 (vs +0.10)", overrides: [{ archetypes: archetypesWith("sharp", { skillEdge: 0.2 }) }] },
  { group: "Wealth cap", label: "Stake ≤ 50% of balance", overrides: [{ wagers: { cap: { maxStakeBps: 5000 } } }] },
  { group: "Wealth cap", label: "Stake ≤ 25% of balance", overrides: [{ wagers: { cap: { maxStakeBps: 2500 } } }] },
  { group: "Wealth cap", label: "Stake ≤ 25%, wager only if balance ≥ 20", overrides: [{ wagers: { cap: { maxStakeBps: 2500, minBalanceToWager: 20 } } }] },
  { group: "Seasons", label: "No seasons", overrides: [{ seasons: { enabled: false } }] },
  { group: "Seasons", label: "Season runs with ≥6 opt-ins (vs ≥7)", overrides: [{ seasons: { minParticipants: 6 } }] },
  { group: "Seasons", label: "Season budget 200 (vs 400)", overrides: [{ seasons: { budget: 200 } }] },
  { group: "Seasons", label: "Season budget 800, 10 coins/point", overrides: [{ seasons: { budget: 800, coinsPerPoint: 10 } }] },
  { group: "Sinks", label: "Shop on, 4% purchase chance per active day", overrides: [{ sinks: { enabled: true } }] },
  { group: "Sinks", label: "Shop on, 10%", overrides: [{ sinks: { enabled: true, pPurchasePerActiveDay: 0.1 } }] },
  { group: "Sinks", label: "Rake 5% of winning pots", overrides: [{ wagers: { rakeBps: 500 } }] },
];

export const SENSITIVITY_METRICS = ["supply", "medianWallet", "maxWallet", "gini", "nearZeroShare", "wagerVolume", "acceptRate", "seasonsHeld", "sinkPurchase", "sinkRake"] as const;

export interface FullReport {
  readonly baseSeed: number;
  readonly seedsPerCell: number;
  readonly matrix: readonly CellResult[];
  readonly sensitivityDays: number;
  readonly sensitivity: readonly (CellResult & { group: string })[];
}

export function runFullReport(baseSeed: number, seedsPerCell: number, sensitivityDays = 180): FullReport {
  const seeds = seedList(baseSeed, seedsPerCell);
  const matrix: CellResult[] = [];
  for (const engagement of ENGAGEMENT_LEVELS) {
    for (const days of HORIZONS) matrix.push(runCell(`${engagement} / ${days}d`, engagement, days, seeds));
  }
  const sensitivity = SENSITIVITY.map((v) => ({ group: v.group, ...runCell(v.label, "medium", sensitivityDays, seeds, v.overrides) }));
  return { baseSeed, seedsPerCell, matrix, sensitivityDays, sensitivity };
}

/** Canonical JSON (sorted keys) so the hash only depends on the results. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
