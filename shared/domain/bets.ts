// Bet stake, escrow and settlement rules (ECONOMY.md §6). Odds are two integer stakes (ADR-004).

import { BURN_ACCOUNT, betEscrowAccount, walletAccount, type Posting, type TxKind } from "./ledger.ts";
import { applyBps, isCoinAmount } from "./money.ts";

export const MAX_ODDS_RATIO = 20;

export type BetOutcome = "A_WINS" | "B_WINS" | "VOID";

export interface MatchedBet {
  readonly betId: string;
  readonly partyA: string;
  readonly partyB: string;
  readonly stakeA: number;
  readonly stakeB: number;
}

/** Returns null when the stake pair is valid, otherwise a reason. */
export function stakeError(stakeA: number, stakeB: number): string | null {
  if (!isCoinAmount(stakeA) || !isCoinAmount(stakeB)) return "stakes must be positive integers";
  if (Math.max(stakeA, stakeB) > MAX_ODDS_RATIO * Math.min(stakeA, stakeB)) return `odds ratio exceeds ${MAX_ODDS_RATIO}:1`;
  return null;
}

/** The win probability at which a stake pair has zero expected value for A. */
export function fairWinProbabilityA(stakeA: number, stakeB: number): number {
  return stakeA / (stakeA + stakeB);
}

/**
 * Wealth-dependent wager limit. This is a candidate rule (OD-13). The current spec default is
 * "stake ≤ available balance", which corresponds to maxStakeBps = 10_000, minBalanceToWager = 1,
 * absoluteMaxStake = null.
 */
export interface WagerCapPolicy {
  readonly maxStakeBps: number;
  readonly minBalanceToWager: number;
  readonly absoluteMaxStake: number | null;
}

export const SPEC_DEFAULT_WAGER_CAP: WagerCapPolicy = { maxStakeBps: 10_000, minBalanceToWager: 1, absoluteMaxStake: null };

/** The largest stake allowed for a given available balance. 0 means the member may not wager. */
export function maxStake(availableBalance: number, policy: WagerCapPolicy): number {
  if (availableBalance < policy.minBalanceToWager) return 0;
  const byShare = applyBps(availableBalance, policy.maxStakeBps);
  return policy.absoluteMaxStake === null ? byShare : Math.min(byShare, policy.absoluteMaxStake);
}

export function escrowPostings(memberId: string, betId: string, stake: number): Posting[] {
  return [
    { account: walletAccount(memberId), delta: -stake },
    { account: betEscrowAccount(betId), delta: stake },
  ];
}

export function refundPostings(memberId: string, betId: string, stake: number): Posting[] {
  return [
    { account: betEscrowAccount(betId), delta: -stake },
    { account: walletAccount(memberId), delta: stake },
  ];
}

/**
 * Settlement empties the escrow (I6). A winner gets the pot minus an optional rake, which is
 * burned (OD-7; the MVP default is 0). VOID refunds each side's own stake.
 */
export function settlementPostings(bet: MatchedBet, outcome: BetOutcome, rakeBps = 0): { kind: TxKind; postings: Posting[] } {
  const escrow = betEscrowAccount(bet.betId);
  const pot = bet.stakeA + bet.stakeB;
  if (outcome === "VOID") {
    return {
      kind: "BET_REFUND",
      postings: [
        { account: escrow, delta: -pot },
        { account: walletAccount(bet.partyA), delta: bet.stakeA },
        { account: walletAccount(bet.partyB), delta: bet.stakeB },
      ],
    };
  }
  const winner = outcome === "A_WINS" ? bet.partyA : bet.partyB;
  const rake = applyBps(pot, rakeBps);
  const postings: Posting[] = [
    { account: escrow, delta: -pot },
    { account: walletAccount(winner), delta: pot - rake },
  ];
  if (rake > 0) postings.push({ account: BURN_ACCOUNT, delta: rake });
  return { kind: "BET_PAYOUT", postings };
}

// ---- Challenge lifecycle rules (ECONOMY.md §6.2–6.4) ----

/** [HARD] H7: an offer can be accepted for 5 minutes. */
export const OFFER_WINDOW_MS = 5 * 60 * 1000;
export const MAX_OFFERS_PER_CHAIN = 6;
export const MAX_OPEN_OFFERS_PER_MAKER = 3;
export const RESOLVE_BY_MIN_MS = 5 * 60 * 1000;
export const RESOLVE_BY_MAX_MS = 30 * 24 * 60 * 60 * 1000;
/** OD-5 default: a report with no response settles after 48 h. */
export const AUTO_CONFIRM_MS = 48 * 60 * 60 * 1000;
/** OD-5 default: a jury votes for 24 h; at least 3 votes and a strict majority, otherwise VOID. */
export const JURY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const JURY_QUORUM = 3;
export const STATEMENT_MIN = 3;
export const STATEMENT_MAX = 200;

/** Returns null when the challenge terms are valid, otherwise a user-facing reason. */
export function challengeTermsError(input: { statement: string; stakeA: number; stakeB: number; resolveBy: number; now: number }): string | null {
  const statement = input.statement.trim();
  if (statement.length < STATEMENT_MIN || statement.length > STATEMENT_MAX) return `The statement must be ${STATEMENT_MIN}–${STATEMENT_MAX} characters.`;
  const stakes = stakeError(input.stakeA, input.stakeB);
  if (stakes) return `Invalid stakes: ${stakes}.`;
  const lead = input.resolveBy - input.now;
  if (!Number.isFinite(lead) || lead < RESOLVE_BY_MIN_MS || lead > RESOLVE_BY_MAX_MS) return "Resolve-by must be between 5 minutes and 30 days from now.";
  return null;
}

/** Jury result: the option with a strict majority of votes cast, with at least JURY_QUORUM votes; otherwise VOID. */
export function tallyJury(votes: readonly BetOutcome[]): BetOutcome {
  if (votes.length < JURY_QUORUM) return "VOID";
  const counts = new Map<BetOutcome, number>();
  for (const v of votes) counts.set(v, (counts.get(v) ?? 0) + 1);
  for (const [outcome, n] of counts) if (n * 2 > votes.length) return outcome;
  return "VOID";
}
