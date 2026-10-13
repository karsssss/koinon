import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { errorCode, expectLedgerSound, grant, identity, setupGroup, type TestConvex } from "../test/convexHarness";

const NOON = Date.parse("2026-10-13T12:00:00Z");
const MIN = 60_000;
const HOUR = 60 * MIN;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
});
afterEach(() => {
  vi.useRealTimers();
});

type As = ReturnType<Awaited<ReturnType<typeof setupGroup>>["as"]>;
const balance = async (as: As) => (await as.query(api.wallet.summary, {})).balance;
const escrowed = async (as: As) => (await as.query(api.wallet.summary, {})).escrowed;
const escrowAccount = (t: TestConvex, betId: Id<"bets">) =>
  t.run(async (ctx) => (await ctx.db.query("accounts").withIndex("by_key", (q) => q.eq("key", `escrow:bet:${betId}`)).unique())?.balance ?? 0);

/** Runs every due scheduled job (offer expiry, auto-confirm, jury close). */
async function runScheduled(t: TestConvex) {
  vi.runAllTimers();
  await t.finishInProgressScheduledFunctions();
}

let seq = 0;
const terms = (counterpartyId: Id<"members">, myStake = 50, theirStake = 20) => ({
  counterpartyId,
  statement: "Bo finishes the marathon under 4h",
  myStake,
  theirStake,
  resolveBy: NOON + 24 * HOUR,
  requestId: `bet-request-${++seq}`,
});

async function group(names = ["ada", "bo", "cy", "dee", "eli", "fen"]) {
  const g = await setupGroup(names);
  for (const n of names) await grant(g.t, g.ids[n]!, 99); // everyone holds 100
  return g;
}

describe("offer lifecycle", () => {
  it("create escrows the maker's stake; accept escrows the taker's and activates the bet", async () => {
    const { t, ids, as } = await group();
    const { betId } = await as("ada").mutation(api.bets.create, terms(ids.bo!));
    expect(await balance(as("ada"))).toBe(50);
    expect(await escrowed(as("ada"))).toBe(50);
    expect(await escrowAccount(t, betId)).toBe(50);

    const bet = await as("bo").query(api.bets.get, { betId });
    expect(bet).toMatchObject({ status: "offered", stakeA: 50, stakeB: 20, needsMe: true, can: { accept: true, counter: true, decline: true, withdraw: false } });
    expect(bet?.offer.expiresAt).toBe(NOON + 5 * MIN);

    await as("bo").mutation(api.bets.accept, { betId });
    expect(await balance(as("bo"))).toBe(80);
    expect(await escrowAccount(t, betId)).toBe(70);
    expect(await as("ada").query(api.bets.get, { betId })).toMatchObject({ status: "active", can: { report: true } });
    const feed = await as("cy").query(api.feed.recent, {});
    expect(feed.slice(0, 2).map((e) => e.type)).toEqual(["bet_accepted", "bet_offered"]);
    await expectLedgerSound(t);
  });

  it("an offer can't be accepted after 5 minutes, even before the expiry job runs; the job then refunds", async () => {
    const { t, ids, as } = await group();
    const { betId } = await as("ada").mutation(api.bets.create, terms(ids.bo!));
    vi.setSystemTime(NOON + 5 * MIN); // exactly at expiresAt
    expect(await errorCode(as("bo").mutation(api.bets.accept, { betId }))).toBe("OFFER_EXPIRED");
    expect(await balance(as("bo"))).toBe(100);

    await runScheduled(t);
    expect(await as("ada").query(api.bets.get, { betId })).toMatchObject({ status: "closed", offer: { status: "expired" } });
    expect(await balance(as("ada"))).toBe(100);
    expect(await escrowAccount(t, betId)).toBe(0);
    await expectLedgerSound(t);
  });

  it("accepting at 4:59 wins the race; the later expiry job does nothing", async () => {
    const { t, ids, as } = await group();
    const { betId } = await as("ada").mutation(api.bets.create, terms(ids.bo!));
    vi.setSystemTime(NOON + 5 * MIN - 1000);
    await as("bo").mutation(api.bets.accept, { betId });
    vi.setSystemTime(NOON + 6 * MIN);
    await runScheduled(t);
    expect(await as("ada").query(api.bets.get, { betId })).toMatchObject({ status: "active" });
    expect(await escrowAccount(t, betId)).toBe(70);
    await expectLedgerSound(t);
  });

  it("counter-offers swap the maker, re-escrow, restart the window and are capped at 6 offers", async () => {
    const { t, ids, as } = await group();
    const { betId } = await as("ada").mutation(api.bets.create, terms(ids.bo!, 50, 20));
    vi.setSystemTime(NOON + 4 * MIN);
    await as("bo").mutation(api.bets.counter, { betId, stakeA: 50, stakeB: 30 }); // Bo now risks 30
    expect(await balance(as("ada"))).toBe(100);
    expect(await balance(as("bo"))).toBe(70);
    let bet = await as("ada").query(api.bets.get, { betId });
    expect(bet).toMatchObject({ stakeA: 50, stakeB: 30, offerCount: 2, offer: { seq: 2, makerId: ids.bo, expiresAt: NOON + 9 * MIN }, can: { accept: true } });

    // Ada counters back, then they alternate up to the 6-offer cap.
    await as("ada").mutation(api.bets.counter, { betId, stakeA: 40, stakeB: 30 });
    await as("bo").mutation(api.bets.counter, { betId, stakeA: 45, stakeB: 30 });
    await as("ada").mutation(api.bets.counter, { betId, stakeA: 45, stakeB: 25 });
    await as("bo").mutation(api.bets.counter, { betId, stakeA: 45, stakeB: 28 });
    expect(await errorCode(as("ada").mutation(api.bets.counter, { betId, stakeA: 44, stakeB: 28 }))).toBe("LIMIT_REACHED");
    expect((await as("ada").query(api.bets.get, { betId }))?.can.counter).toBe(false);

    await as("ada").mutation(api.bets.accept, { betId });
    bet = await as("ada").query(api.bets.get, { betId });
    expect(bet).toMatchObject({ status: "active", stakeA: 45, stakeB: 28 });
    expect(await escrowAccount(t, betId)).toBe(73);
    expect(await balance(as("ada"))).toBe(55);
    expect(await balance(as("bo"))).toBe(72);
    await expectLedgerSound(t);
  });

  it("decline and withdraw refund the maker and close the bet; repeats are harmless", async () => {
    const { t, ids, as } = await group();
    const a = await as("ada").mutation(api.bets.create, terms(ids.bo!));
    await as("bo").mutation(api.bets.decline, { betId: a.betId });
    await as("bo").mutation(api.bets.decline, { betId: a.betId });
    const b = await as("ada").mutation(api.bets.create, terms(ids.bo!));
    await as("ada").mutation(api.bets.withdraw, { betId: b.betId });
    await as("ada").mutation(api.bets.withdraw, { betId: b.betId });
    expect(await balance(as("ada"))).toBe(100);
    expect(await escrowed(as("ada"))).toBe(0);
    expect((await as("ada").query(api.bets.get, { betId: b.betId }))?.status).toBe("closed");
    await expectLedgerSound(t);
  });
});

describe("permissions and limits", () => {
  it("only the addressed member can respond, only the maker can withdraw, strangers see nothing", async () => {
    const { t, ids, as } = await group();
    const { betId } = await as("ada").mutation(api.bets.create, terms(ids.bo!));
    expect(await errorCode(as("cy").mutation(api.bets.accept, { betId }))).toBe("FORBIDDEN");
    expect(await errorCode(as("ada").mutation(api.bets.accept, { betId }))).toBe("FORBIDDEN");
    expect(await errorCode(as("cy").mutation(api.bets.counter, { betId, stakeA: 1, stakeB: 1 }))).toBe("FORBIDDEN");
    expect(await errorCode(as("bo").mutation(api.bets.withdraw, { betId }))).toBe("FORBIDDEN");
    expect(await errorCode(as("cy").mutation(api.bets.adminVoid, { betId, reason: "nope" }))).toBe("FORBIDDEN");
    const stranger = t.withIdentity(identity("mallory"));
    expect(await errorCode(stranger.query(api.bets.list, {}))).toBe("NOT_A_MEMBER");
    expect(await errorCode(stranger.mutation(api.bets.accept, { betId }))).toBe("NOT_A_MEMBER");
    expect(await errorCode(t.query(api.bets.get, { betId }))).toBe("UNAUTHENTICATED");
  });

  it("rejects invalid terms, self-challenges and more than 3 open offers", async () => {
    const { t, ids, as } = await group();
    expect(await errorCode(as("ada").mutation(api.bets.create, terms(ids.ada!)))).toBe("INVALID_ARGUMENT");
    expect(await errorCode(as("ada").mutation(api.bets.create, terms(ids.bo!, 50, 2)))).toBe("INVALID_ARGUMENT");
    expect(await errorCode(as("ada").mutation(api.bets.create, { ...terms(ids.bo!), resolveBy: NOON + MIN }))).toBe("INVALID_ARGUMENT");
    expect(await errorCode(as("ada").mutation(api.bets.create, { ...terms(ids.bo!), statement: "x" }))).toBe("INVALID_ARGUMENT");
    for (const who of ["bo", "cy", "dee"]) await as("ada").mutation(api.bets.create, terms(ids[who]!, 10, 10));
    expect(await errorCode(as("ada").mutation(api.bets.create, terms(ids.eli!, 10, 10)))).toBe("LIMIT_REACHED");
    expect(await balance(as("ada"))).toBe(70);
    await expectLedgerSound(t);
  });

  it("insufficient funds for a stake change nothing", async () => {
    const { t, ids, as } = await group();
    expect(await errorCode(as("ada").mutation(api.bets.create, terms(ids.bo!, 101, 20)))).toBe("INSUFFICIENT_FUNDS");
    expect(await as("ada").query(api.bets.list, {})).toEqual([]);
    const { betId } = await as("ada").mutation(api.bets.create, terms(ids.bo!, 100, 100));
    await as("bo").mutation(api.wallet.transfer, { toMemberId: ids.cy!, amount: 10, requestId: "req-drain-001" });
    expect(await errorCode(as("bo").mutation(api.bets.accept, { betId }))).toBe("INSUFFICIENT_FUNDS");
    expect(await as("bo").query(api.bets.get, { betId })).toMatchObject({ status: "offered", offer: { status: "open" } });
    expect(await escrowAccount(t, betId)).toBe(100);
    await expectLedgerSound(t);
  });
});

describe("idempotency and concurrency", () => {
  it("a repeated create request makes one bet; concurrent accepts escrow once", async () => {
    const { t, ids, as } = await group();
    const args = terms(ids.bo!);
    const [x, y] = await Promise.all([as("ada").mutation(api.bets.create, args), as("ada").mutation(api.bets.create, args)]);
    expect(x.betId).toBe(y.betId);
    expect(await balance(as("ada"))).toBe(50);
    const results = await Promise.all(Array.from({ length: 4 }, () => as("bo").mutation(api.bets.accept, { betId: x.betId })));
    expect(results.every((r) => r.status === "active")).toBe(true);
    expect(await balance(as("bo"))).toBe(80);
    expect(await escrowAccount(t, x.betId)).toBe(70);
    await expectLedgerSound(t);
  });

  it("accept racing withdraw: exactly one wins and escrow matches the result", async () => {
    const { t, ids, as } = await group();
    const { betId } = await as("ada").mutation(api.bets.create, terms(ids.bo!));
    const [acc, wd] = await Promise.all([errorCode(as("bo").mutation(api.bets.accept, { betId })), errorCode(as("ada").mutation(api.bets.withdraw, { betId }))]);
    expect([acc, wd].filter((r) => r === "NO_ERROR")).toHaveLength(1);
    const status = (await as("ada").query(api.bets.get, { betId }))?.status;
    expect(await escrowAccount(t, betId)).toBe(status === "active" ? 70 : 0);
    await expectLedgerSound(t);
  });
});

describe("resolution", () => {
  async function activeBet() {
    const g = await group();
    const { betId } = await g.as("ada").mutation(api.bets.create, terms(g.ids.bo!, 50, 20));
    await g.as("bo").mutation(api.bets.accept, { betId });
    return { ...g, betId };
  }

  it("report + confirm pays the whole pot to the winner", async () => {
    const { t, as, betId } = await activeBet();
    expect(await errorCode(as("cy").mutation(api.bets.report, { betId, outcome: "A_WINS" }))).toBe("FORBIDDEN");
    await as("bo").mutation(api.bets.report, { betId, outcome: "A_WINS" });
    expect(await errorCode(as("bo").mutation(api.bets.confirm, { betId }))).toBe("FORBIDDEN");
    await as("ada").mutation(api.bets.confirm, { betId });
    await as("ada").mutation(api.bets.confirm, { betId }); // repeat is harmless
    expect(await balance(as("ada"))).toBe(120);
    expect(await balance(as("bo"))).toBe(80);
    expect(await escrowAccount(t, betId)).toBe(0);
    const feed = await as("cy").query(api.feed.recent, {});
    expect(feed[0]).toMatchObject({ type: "bet_settled", amount: 70, actor: { displayName: "ada" }, target: { displayName: "bo" } });
    await expectLedgerSound(t);
  });

  it("a confirmed VOID refunds both stakes", async () => {
    const { t, as, betId } = await activeBet();
    await as("ada").mutation(api.bets.report, { betId, outcome: "VOID" });
    await as("bo").mutation(api.bets.confirm, { betId });
    expect([await balance(as("ada")), await balance(as("bo"))]).toEqual([100, 100]);
    expect((await as("ada").query(api.bets.get, { betId }))?.status).toBe("void");
    await expectLedgerSound(t);
  });

  it("an unanswered report auto-confirms after 48 hours", async () => {
    const { t, as, betId } = await activeBet();
    await as("ada").mutation(api.bets.report, { betId, outcome: "B_WINS" });
    vi.setSystemTime(NOON + 47 * HOUR);
    await t.finishInProgressScheduledFunctions();
    expect((await as("ada").query(api.bets.get, { betId }))?.status).toBe("reported");
    vi.setSystemTime(NOON + 48 * HOUR);
    await runScheduled(t);
    expect((await as("ada").query(api.bets.get, { betId }))?.status).toBe("settled");
    expect(await balance(as("bo"))).toBe(150);
    await expectLedgerSound(t);
  });

  it("a dispute goes to the jury; a strict majority of ≥3 votes decides, revealed after closing", async () => {
    const { t, as, betId } = await activeBet();
    await as("ada").mutation(api.bets.report, { betId, outcome: "A_WINS" });
    await as("bo").mutation(api.bets.dispute, { betId });
    expect(await errorCode(as("ada").mutation(api.bets.vote, { betId, choice: "A_WINS" }))).toBe("FORBIDDEN");
    await as("cy").mutation(api.bets.vote, { betId, choice: "B_WINS" });
    expect(await errorCode(as("cy").mutation(api.bets.vote, { betId, choice: "A_WINS" }))).toBe("INVALID_STATE");
    await as("dee").mutation(api.bets.vote, { betId, choice: "B_WINS" });
    expect((await as("eli").query(api.bets.get, { betId }))?.jury).toEqual({ eligible: 4, cast: 2, votes: null });
    await as("eli").mutation(api.bets.vote, { betId, choice: "A_WINS" });
    vi.setSystemTime(NOON + 24 * HOUR);
    await runScheduled(t);
    const bet = await as("ada").query(api.bets.get, { betId });
    expect(bet).toMatchObject({ status: "settled", outcome: "B_WINS", jury: { cast: 3 } });
    expect(bet?.jury?.votes).toHaveLength(3);
    expect(await balance(as("bo"))).toBe(150);
    await expectLedgerSound(t);
  });

  it("the jury closes early when everyone eligible has voted; without a quorum the bet is VOID", async () => {
    const small = await group(["ada", "bo", "cy", "dee"]); // only 2 eligible jurors → quorum impossible
    const { betId } = await small.as("ada").mutation(api.bets.create, terms(small.ids.bo!, 50, 20));
    await small.as("bo").mutation(api.bets.accept, { betId });
    await small.as("ada").mutation(api.bets.report, { betId, outcome: "A_WINS" });
    await small.as("bo").mutation(api.bets.dispute, { betId });
    await small.as("cy").mutation(api.bets.vote, { betId, choice: "A_WINS" });
    expect(await small.as("dee").mutation(api.bets.vote, { betId, choice: "A_WINS" })).toEqual({ status: "closed" });
    expect(await small.as("ada").query(api.bets.get, { betId })).toMatchObject({ status: "void", outcome: "VOID" });
    expect([await balance(small.as("ada")), await balance(small.as("bo"))]).toEqual([100, 100]);
    await expectLedgerSound(small.t);
  });

  it("an admin can void an unfinished bet with a reason; escrow is refunded", async () => {
    const { t, ids, as } = await group();
    const offered = await as("bo").mutation(api.bets.create, terms(ids.cy!, 30, 30));
    await as("ada").mutation(api.bets.adminVoid, { betId: offered.betId, reason: "Created by mistake" });
    const { betId } = await as("bo").mutation(api.bets.create, terms(ids.cy!, 30, 30));
    await as("cy").mutation(api.bets.accept, { betId });
    await as("ada").mutation(api.bets.adminVoid, { betId, reason: "Event was cancelled" });
    expect(await as("bo").query(api.bets.get, { betId })).toMatchObject({ status: "void", voidReason: "Event was cancelled" });
    expect([await balance(as("bo")), await balance(as("cy"))]).toEqual([100, 100]);
    expect(await errorCode(as("ada").mutation(api.bets.adminVoid, { betId, reason: "again" }))).toBe("INVALID_STATE");
    await expectLedgerSound(t);
  });

  it("wallet history names the challenge behind each escrow and payout", async () => {
    const { as, betId } = await activeBet();
    await as("ada").mutation(api.bets.report, { betId, outcome: "A_WINS" });
    await as("bo").mutation(api.bets.confirm, { betId });
    const history = await as("ada").query(api.wallet.history, { paginationOpts: { numItems: 3, cursor: null } });
    expect(history.page.slice(0, 2).map((e) => [e.kind, e.delta, e.bet?.statement])).toEqual([
      ["BET_PAYOUT", 70, "Bo finishes the marathon under 4h"],
      ["BET_ESCROW", -50, "Bo finishes the marathon under 4h"],
    ]);
  });
});
