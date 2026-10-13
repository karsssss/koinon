import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { challengeTermsError, maxStake, settlementPostings, SPEC_DEFAULT_WAGER_CAP, stakeError, tallyJury, type BetOutcome, type MatchedBet } from "./bets.ts";
import { BURN_ACCOUNT, betEscrowAccount, walletAccount } from "./ledger.ts";

const bet: MatchedBet = { betId: "x", partyA: "a", partyB: "b", stakeA: 50, stakeB: 20 };

describe("stakeError", () => {
  it("enforces integer stakes and the 20:1 ratio", () => {
    expect(stakeError(50, 20)).toBeNull();
    expect(stakeError(20, 1)).toBeNull();
    expect(stakeError(21, 1)).toMatch(/ratio/);
    expect(stakeError(0, 5)).toMatch(/integers/);
    expect(stakeError(1.5, 5)).toMatch(/integers/);
  });
});

describe("maxStake", () => {
  it("defaults to the full available balance (spec OD-13)", () => {
    expect(maxStake(123, SPEC_DEFAULT_WAGER_CAP)).toBe(123);
    expect(maxStake(0, SPEC_DEFAULT_WAGER_CAP)).toBe(0);
  });
  it("applies share, floor and absolute caps", () => {
    const policy = { maxStakeBps: 2500, minBalanceToWager: 20, absoluteMaxStake: 100 };
    expect(maxStake(19, policy)).toBe(0);
    expect(maxStake(41, policy)).toBe(10);
    expect(maxStake(10_000, policy)).toBe(100);
  });
});

describe("settlementPostings", () => {
  it.each<BetOutcome>(["A_WINS", "B_WINS", "VOID"])("%s empties escrow and balances to zero (I1, I6)", (outcome) => {
    const { postings } = settlementPostings(bet, outcome);
    expect(postings.reduce((s, p) => s + p.delta, 0)).toBe(0);
    expect(postings.find((p) => p.account === betEscrowAccount("x"))?.delta).toBe(-70);
  });

  it("pays the whole pot to the winner without rake, and refunds own stakes on VOID", () => {
    expect(settlementPostings(bet, "B_WINS").postings).toContainEqual({ account: walletAccount("b"), delta: 70 });
    const v = settlementPostings(bet, "VOID");
    expect(v.kind).toBe("BET_REFUND");
    expect(v.postings).toContainEqual({ account: walletAccount("a"), delta: 50 });
    expect(v.postings).toContainEqual({ account: walletAccount("b"), delta: 20 });
  });

  it("property: with rake, winner + burn = pot and every amount is an integer", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10_000 }), fc.integer({ min: 1, max: 10_000 }), fc.integer({ min: 0, max: 2000 }), (a, b, rake) => {
        const { postings } = settlementPostings({ ...bet, stakeA: a, stakeB: b }, "A_WINS", rake);
        expect(postings.reduce((s, p) => s + p.delta, 0)).toBe(0);
        for (const p of postings) expect(Number.isInteger(p.delta)).toBe(true);
        const burned = postings.find((p) => p.account === BURN_ACCOUNT)?.delta ?? 0;
        expect(burned).toBe(Math.floor(((a + b) * rake) / 10_000));
      }),
      { seed: 7, numRuns: 300 },
    );
  });
});

describe("challengeTermsError", () => {
  const now = Date.parse("2026-10-13T12:00:00Z");
  const ok = { statement: "Bo finishes the marathon", stakeA: 50, stakeB: 20, resolveBy: now + 60 * 60 * 1000, now };
  it("accepts valid terms and rejects each bad field", () => {
    expect(challengeTermsError(ok)).toBeNull();
    expect(challengeTermsError({ ...ok, statement: "  x " })).toMatch(/statement/);
    expect(challengeTermsError({ ...ok, statement: "x".repeat(201) })).toMatch(/statement/);
    expect(challengeTermsError({ ...ok, stakeB: 2 })).toMatch(/ratio/);
    expect(challengeTermsError({ ...ok, stakeA: 0 })).toMatch(/stakes/);
    expect(challengeTermsError({ ...ok, resolveBy: now + 4 * 60 * 1000 })).toMatch(/Resolve-by/);
    expect(challengeTermsError({ ...ok, resolveBy: now + 31 * 24 * 60 * 60 * 1000 })).toMatch(/Resolve-by/);
    expect(challengeTermsError({ ...ok, resolveBy: Number.NaN })).toMatch(/Resolve-by/);
  });
});

describe("tallyJury", () => {
  it("needs a quorum of 3 and a strict majority; anything else is VOID", () => {
    expect(tallyJury(["A_WINS", "A_WINS"])).toBe("VOID");
    expect(tallyJury(["A_WINS", "A_WINS", "B_WINS"])).toBe("A_WINS");
    expect(tallyJury(["A_WINS", "B_WINS", "VOID"])).toBe("VOID");
    expect(tallyJury(["B_WINS", "B_WINS", "A_WINS", "A_WINS"])).toBe("VOID");
    expect(tallyJury(["VOID", "VOID", "A_WINS"])).toBe("VOID");
    expect(tallyJury(["B_WINS", "B_WINS", "B_WINS", "A_WINS", "A_WINS", "VOID"])).toBe("VOID");
    expect(tallyJury(["B_WINS", "B_WINS", "B_WINS", "B_WINS", "A_WINS", "VOID"])).toBe("B_WINS");
  });
});
