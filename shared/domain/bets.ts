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
