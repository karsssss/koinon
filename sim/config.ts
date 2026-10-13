// Simulator configuration. Issuance, season and wager-limit values come from the specs.
// Every behavioural parameter (activity, betting, gifting, buying) is an ASSUMPTION chosen for
// exploration. None of them is measured player behaviour. See docs/SIMULATION.md §2.

import { SPEC_DEFAULT_WAGER_CAP, type WagerCapPolicy } from "../shared/domain/bets.ts";
import { MAFIA_POINTS_V0_1, type MafiaPointsTable } from "../shared/domain/season.ts";

export type EngagementLevel = "low" | "medium" | "high";
export const ENGAGEMENT_LEVELS: readonly EngagementLevel[] = ["low", "medium", "high"];
export const HORIZONS: readonly number[] = [30, 90, 180];

/** One seat. Probabilities are per group day. "Medium" engagement uses these values unchanged. */
export interface Archetype {
  readonly id: string;
  /** Chance the member opens the app (and checks in) on a given day. */
  readonly pActive: number;
  /** Chance they post a digest, given they are active. */
  readonly pDigestGivenActive: number;
  /** Mean bet offers made per active day (Poisson). */
  readonly offersPerActiveDay: number;
  /** Stake as a share of available balance, drawn uniformly from [lo, hi]. */
  readonly stakeShare: readonly [number, number];
  /** Added to the true win probability of their bets (+ = better forecaster). */
  readonly skillEdge: number;
  /** Chance they see and answer an offer within 5 minutes, given they are active that day. */
  readonly pRespondWithin5Min: number;
  readonly seasonOptIn: number;
  /** Weekly gift as basis points of balance, sent to the poorest other member. */
  readonly weeklyGiftBps: number;
  /** After this day the member mostly stops playing (null = never). */
  readonly churnAfterDay: number | null;
}

/** ECONOMY.md §9 archetype table (one per seat). */
export const DEFAULT_ARCHETYPES: readonly Archetype[] = [
  { id: "grinder", pActive: 0.98, pDigestGivenActive: 0.97, offersPerActiveDay: 0.2, stakeShare: [0.05, 0.1], skillEdge: 0, pRespondWithin5Min: 0.25, seasonOptIn: 0.95, weeklyGiftBps: 0, churnAfterDay: null },
  { id: "social", pActive: 0.9, pDigestGivenActive: 0.89, offersPerActiveDay: 1.0, stakeShare: [0.1, 0.2], skillEdge: 0, pRespondWithin5Min: 0.45, seasonOptIn: 0.95, weeklyGiftBps: 0, churnAfterDay: null },
  { id: "high-roller", pActive: 0.85, pDigestGivenActive: 0.71, offersPerActiveDay: 0.8, stakeShare: [0.3, 0.6], skillEdge: 0, pRespondWithin5Min: 0.35, seasonOptIn: 0.9, weeklyGiftBps: 0, churnAfterDay: null },
  { id: "sharp", pActive: 0.9, pDigestGivenActive: 0.89, offersPerActiveDay: 0.5, stakeShare: [0.1, 0.2], skillEdge: 0.1, pRespondWithin5Min: 0.35, seasonOptIn: 0.95, weeklyGiftBps: 0, churnAfterDay: null },
  { id: "casual", pActive: 0.65, pDigestGivenActive: 0.62, offersPerActiveDay: 0.3, stakeShare: [0.1, 0.1], skillEdge: 0, pRespondWithin5Min: 0.2, seasonOptIn: 0.8, weeklyGiftBps: 0, churnAfterDay: null },
  { id: "lurker", pActive: 0.35, pDigestGivenActive: 0.43, offersPerActiveDay: 0.05, stakeShare: [0.05, 0.05], skillEdge: 0, pRespondWithin5Min: 0.1, seasonOptIn: 0.5, weeklyGiftBps: 0, churnAfterDay: null },
  { id: "generous", pActive: 0.85, pDigestGivenActive: 0.82, offersPerActiveDay: 0.3, stakeShare: [0.1, 0.1], skillEdge: 0, pRespondWithin5Min: 0.3, seasonOptIn: 0.9, weeklyGiftBps: 1000, churnAfterDay: null },
  { id: "churner", pActive: 0.9, pDigestGivenActive: 0.89, offersPerActiveDay: 0.5, stakeShare: [0.15, 0.15], skillEdge: 0, pRespondWithin5Min: 0.35, seasonOptIn: 0.9, weeklyGiftBps: 0, churnAfterDay: 45 },
];

/**
 * How engagement levels transform the medium values (an assumption):
 * - low:  p' = p × lowScale (inactivity grows).
 * - high: p' = 1 − (1 − p) × highInactivityScale (inactivity shrinks).
 * Offer rates scale by wagerScale.
 */
export interface EngagementModel {
  readonly lowScale: number;
  readonly highInactivityScale: number;
  readonly wagerScale: Readonly<Record<EngagementLevel, number>>;
}

export interface SimConfig {
  readonly seed: number;
  readonly days: number;
  readonly engagement: EngagementLevel;
  readonly archetypes: readonly Archetype[];
  readonly engagementModel: EngagementModel;
  /** [HARD] H4/H5 values. */
  readonly issuance: { readonly genesis: number; readonly checkin: number; readonly digest: number };
  /** Digest verification (OD-1 default): another member is active the same day, or the next (grace). */
  readonly digestGraceNextDay: boolean;
  /** Chance a churned member is still active on a given day. */
  readonly churnedPActive: number;
  readonly wagers: {
    readonly enabled: boolean;
    /** [HARD] H7. Response chance scales as 1 − (1 − p5)^(window/5). */
    readonly acceptanceWindowMinutes: number;
    readonly openToAllShare: number;
    readonly pAccept: number;
    readonly pCounter: number;
    /** Chance the other side is still around to answer a counter-offer. */
    readonly pCounterSeen: number;
    readonly maxOffersPerChain: number;
    readonly maxOffersPerMemberPerDay: number;
    /** Maker's implied win probability for proposed odds, picked uniformly. */
    readonly impliedProbabilities: readonly number[];
    readonly resolveDaysMax: number;
    readonly pVoid: number;
    readonly pDispute: number;
    readonly pDisputeVoid: number;
    /** OD-7. Burned from each winning pot. */
    readonly rakeBps: number;
    readonly cap: WagerCapPolicy;
  };
  readonly transfers: {
    readonly enabled: boolean;
    /** Trades and payment requests: chance an active member sends a small amount to a random member. */
    readonly pTradePerActiveDay: number;
    readonly tradeMaxBps: number;
  };
  readonly seasons: {
    readonly enabled: boolean;
    readonly firstStartDay: number;
    readonly cycleDays: number;
    readonly lengthDays: number;
    /** OD-11. */
    readonly minParticipants: number;
    readonly mafiaCount: number;
    /** OD-8. */
    readonly budget: number;
    readonly coinsPerPoint: number;
    readonly points: MafiaPointsTable;
    readonly pTownWin: number;
    readonly pDraw: number;
    readonly pAliveAtEnd: number;
    /** Scaled by the share of season days the player was active. */
    readonly pMissionIfFullyActive: number;
  };
  readonly sinks: {
    readonly enabled: boolean;
    readonly pPurchasePerActiveDay: number;
    /** A purchase may use at most this share of the balance. */
    readonly maxSpendBps: number;
    readonly catalog: readonly { readonly id: string; readonly price: number }[];
  };
  readonly milestone: number;
  readonly nearZeroThreshold: number;
}

export const DEFAULT_CONFIG: SimConfig = {
  seed: 20261013,
  days: 90,
  engagement: "medium",
  archetypes: DEFAULT_ARCHETYPES,
  engagementModel: { lowScale: 0.55, highInactivityScale: 0.4, wagerScale: { low: 0.5, medium: 1, high: 1.6 } },
  issuance: { genesis: 1, checkin: 10, digest: 20 },
  digestGraceNextDay: true,
  churnedPActive: 0.1,
  wagers: {
    enabled: true,
    acceptanceWindowMinutes: 5,
    openToAllShare: 0.25,
    pAccept: 0.55,
    pCounter: 0.3,
    pCounterSeen: 0.6,
    maxOffersPerChain: 6,
    maxOffersPerMemberPerDay: 20,
    impliedProbabilities: [0.2, 1 / 3, 0.5, 0.5, 0.5, 2 / 3, 0.8],
    resolveDaysMax: 7,
    pVoid: 0.02,
    pDispute: 0.05,
    pDisputeVoid: 0.35,
    rakeBps: 0,
    cap: SPEC_DEFAULT_WAGER_CAP,
  },
  transfers: { enabled: true, pTradePerActiveDay: 0.05, tradeMaxBps: 1000 },
  seasons: {
    enabled: true,
    firstStartDay: 8,
    cycleDays: 14,
    lengthDays: 6,
    minParticipants: 7,
    mafiaCount: 2,
    budget: 400,
    coinsPerPoint: 5,
    points: MAFIA_POINTS_V0_1,
    pTownWin: 0.5,
    pDraw: 0.05,
    pAliveAtEnd: 0.4,
    pMissionIfFullyActive: 0.5,
  },
  sinks: {
    enabled: false,
    pPurchasePerActiveDay: 0.04,
    maxSpendBps: 5000,
    catalog: [
      { id: "pinned-message", price: 40 },
      { id: "custom-title", price: 150 },
      { id: "pick-next-game", price: 300 },
    ],
  },
  milestone: 10_000,
  nearZeroThreshold: 10,
};

type DeepPartial<T> = T extends readonly unknown[] ? T : T extends object ? { readonly [K in keyof T]?: DeepPartial<T[K]> } : T;
export type ConfigOverrides = DeepPartial<SimConfig>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function merge(base: unknown, patch: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch === undefined ? base : patch;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = merge(base[k], v);
  return out;
}

export function buildConfig(...overrides: readonly ConfigOverrides[]): SimConfig {
  return overrides.reduce<SimConfig>((cfg, o) => merge(cfg, o) as SimConfig, DEFAULT_CONFIG);
}

/** Applies `a.b.c=value` (value parsed as JSON when possible). Only existing paths are allowed. */
export function overrideFromPath(path: string, rawValue: string): ConfigOverrides {
  const keys = path.split(".");
  let probe: unknown = DEFAULT_CONFIG;
  for (const k of keys) {
    if (!isPlainObject(probe) || !(k in probe)) throw new Error(`Unknown config path: ${path}`);
    probe = probe[k];
  }
  let value: unknown;
  try {
    value = JSON.parse(rawValue);
  } catch {
    value = rawValue;
  }
  return keys.reduceRight<unknown>((acc, k) => ({ [k]: acc }), value) as ConfigOverrides;
}
