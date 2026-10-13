import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { errorCode, expectLedgerSound, setupGroup } from "../test/convexHarness";

// 2026-10-13 12:00 UTC: group day 2026-10-13 with rollover 04:00 UTC.
const NOON = Date.parse("2026-10-13T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOON);
});
afterEach(() => {
  vi.useRealTimers();
});

async function balanceOf(as: ReturnType<Awaited<ReturnType<typeof setupGroup>>["as"]>) {
  return (await as.query(api.wallet.summary, {})).balance;
}

/** Gives a member n check-ins on n consecutive days (10 coins each). */
async function checkInDays(as: ReturnType<Awaited<ReturnType<typeof setupGroup>>["as"]>, n: number) {
  for (let i = 0; i < n; i++) {
    vi.setSystemTime(NOON + i * DAY);
    await as.mutation(api.daily.checkIn, {});
  }
  vi.setSystemTime(NOON);
}

describe("daily check-in", () => {
  it("credits +10 once per group day; repeats are not errors and mint nothing", async () => {
    const { t, as } = await setupGroup(["ada"]);
    expect(await as("ada").mutation(api.daily.checkIn, {})).toEqual({ status: "claimed", groupDay: "2026-10-13", amount: 10 });
    expect(await as("ada").mutation(api.daily.checkIn, {})).toEqual({ status: "already_claimed", groupDay: "2026-10-13" });
    expect(await balanceOf(as("ada"))).toBe(11);
    await expectLedgerSound(t);
  });

  it("concurrent claims from several devices mint once", async () => {
    const { t, as } = await setupGroup(["ada"]);
    const results = await Promise.all(Array.from({ length: 5 }, () => as("ada").mutation(api.daily.checkIn, {})));
    expect(results.filter((r) => r.status === "claimed")).toHaveLength(1);
    expect(await balanceOf(as("ada"))).toBe(11);
    await expectLedgerSound(t);
  });

  it("uses the server's group day: rollover at 04:00 in the group timezone", async () => {
    const { as } = await setupGroup(["ada"], { timezone: "America/New_York" });
    vi.setSystemTime(Date.parse("2026-10-14T07:59:00Z")); // 03:59 EDT, still the 13th
    expect((await as("ada").mutation(api.daily.checkIn, {})).groupDay).toBe("2026-10-13");
    expect((await as("ada").mutation(api.daily.checkIn, {})).status).toBe("already_claimed");
    vi.setSystemTime(Date.parse("2026-10-14T08:00:00Z")); // 04:00 EDT: a new day
    expect(await as("ada").mutation(api.daily.checkIn, {})).toMatchObject({ status: "claimed", groupDay: "2026-10-14" });
    expect(await balanceOf(as("ada"))).toBe(21);
    expect((await as("ada").query(api.wallet.summary, {})).lastCheckInDay).toBe("2026-10-14");
  });
});

describe("transfers", () => {
  it("moves coins, records history for both sides and emits one feed event", async () => {
    const { t, ids, as } = await setupGroup(["ada", "bo"]);
    await checkInDays(as("ada"), 2);
    await as("ada").mutation(api.wallet.transfer, { toMemberId: ids.bo!, amount: 15, note: " lunch ", requestId: "req-transfer-1" });
    expect(await balanceOf(as("ada"))).toBe(6);
    expect(await balanceOf(as("bo"))).toBe(16);

    const adaHistory = await as("ada").query(api.wallet.history, { paginationOpts: { numItems: 10, cursor: null } });
    expect(adaHistory.page[0]).toMatchObject({ kind: "TRANSFER", delta: -15, memo: "lunch", counterparty: { displayName: "bo" } });
    const boHistory = await as("bo").query(api.wallet.history, { paginationOpts: { numItems: 10, cursor: null } });
    expect(boHistory.page.map((e) => [e.kind, e.delta])).toEqual([["TRANSFER", 15], ["GENESIS", 1]]);
    expect(boHistory.page[0]?.counterparty?.displayName).toBe("ada");

    const feed = await as("bo").query(api.feed.recent, {});
    expect(feed.filter((e) => e.type === "transfer")).toEqual([expect.objectContaining({ amount: 15, actor: expect.objectContaining({ displayName: "ada" }), target: expect.objectContaining({ displayName: "bo" }) })]);
    expect(feed.filter((e) => e.type === "checkin")).toHaveLength(2);
    await expectLedgerSound(t);
  });

  it("duplicate requests (same request ID) apply once; a changed payload is rejected", async () => {
    const { t, ids, as } = await setupGroup(["ada", "bo"]);
    await checkInDays(as("ada"), 1);
    const args = { toMemberId: ids.bo!, amount: 5, requestId: "req-dup-0001" };
    const [first, second] = await Promise.all([as("ada").mutation(api.wallet.transfer, args), as("ada").mutation(api.wallet.transfer, args)]);
    expect(first.txId).toBe(second.txId);
    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
    expect(await as("ada").mutation(api.wallet.transfer, args)).toEqual({ txId: first.txId, replayed: true });
    expect(await balanceOf(as("ada"))).toBe(6);
    expect(await balanceOf(as("bo"))).toBe(6);
    expect((await as("bo").query(api.feed.recent, {})).filter((e) => e.type === "transfer")).toHaveLength(1);
    expect(await errorCode(as("ada").mutation(api.wallet.transfer, { ...args, amount: 6 }))).toBe("IDEMPOTENCY_CONFLICT");
    await expectLedgerSound(t);
  });

  it("insufficient funds leave every balance and the ledger untouched", async () => {
    const { t, ids, as } = await setupGroup(["ada", "bo"]);
    const before = await t.run(async (ctx) => (await ctx.db.query("transactions").collect()).length);
    expect(await errorCode(as("ada").mutation(api.wallet.transfer, { toMemberId: ids.bo!, amount: 2, requestId: "req-poor-0001" }))).toBe("INSUFFICIENT_FUNDS");
    expect(await balanceOf(as("ada"))).toBe(1);
    expect(await balanceOf(as("bo"))).toBe(1);
    expect(await t.run(async (ctx) => (await ctx.db.query("transactions").collect()).length)).toBe(before);
    expect((await as("ada").query(api.feed.recent, {})).some((e) => e.type === "transfer")).toBe(false);
    await expectLedgerSound(t);
  });

  it("concurrent transfers can never overdraw a wallet", async () => {
    const { t, ids, as } = await setupGroup(["ada", "bo", "cy"]);
    await checkInDays(as("ada"), 3); // 31 coins
    const outcomes = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        errorCode(as("ada").mutation(api.wallet.transfer, { toMemberId: i % 2 ? ids.bo! : ids.cy!, amount: 10, requestId: `req-race-000${i}` })),
      ),
    );
    expect(outcomes.filter((o) => o === "NO_ERROR")).toHaveLength(3);
    expect(outcomes.filter((o) => o === "INSUFFICIENT_FUNDS")).toHaveLength(3);
    expect(await balanceOf(as("ada"))).toBe(1);
    expect((await balanceOf(as("bo"))) + (await balanceOf(as("cy")))).toBe(2 + 30);
    await expectLedgerSound(t);
  });

  it("concurrent transfers in both directions conserve the total", async () => {
    const { t, ids, as } = await setupGroup(["ada", "bo"]);
    await checkInDays(as("ada"), 2);
    await checkInDays(as("bo"), 2);
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        i % 2
          ? as("ada").mutation(api.wallet.transfer, { toMemberId: ids.bo!, amount: 3, requestId: `req-ab-${i}-0000` })
          : as("bo").mutation(api.wallet.transfer, { toMemberId: ids.ada!, amount: 4, requestId: `req-ba-${i}-0000` }),
      ),
    );
    expect((await balanceOf(as("ada"))) + (await balanceOf(as("bo")))).toBe(42);
    expect(await balanceOf(as("ada"))).toBe(21 - 15 + 20);
    await expectLedgerSound(t);
  });

  it.each([
    ["zero", { amount: 0 }],
    ["fractional", { amount: 1.5 }],
    ["negative", { amount: -5 }],
    ["huge", { amount: 2_000_000 }],
    ["bad request id", { requestId: "x" }],
    ["long note", { note: "x".repeat(141) }],
  ])("rejects invalid input: %s", async (_, patch) => {
    const { t, ids, as } = await setupGroup(["ada", "bo"]);
    await checkInDays(as("ada"), 1);
    const args = { toMemberId: ids.bo!, amount: 1, requestId: "req-valid-001", ...patch };
    expect(await errorCode(as("ada").mutation(api.wallet.transfer, args))).toBe("INVALID_ARGUMENT");
    expect(await balanceOf(as("ada"))).toBe(11);
    await expectLedgerSound(t);
  });

  it("rejects sending to yourself or to a frozen member", async () => {
    const { t, ids, as } = await setupGroup(["ada", "bo"]);
    await checkInDays(as("ada"), 1);
    expect(await errorCode(as("ada").mutation(api.wallet.transfer, { toMemberId: ids.ada!, amount: 1, requestId: "req-self-0001" }))).toBe("INVALID_ARGUMENT");
    await t.run((ctx) => ctx.db.patch(ids.bo!, { status: "frozen" }));
    expect(await errorCode(as("ada").mutation(api.wallet.transfer, { toMemberId: ids.bo!, amount: 1, requestId: "req-frozen-01" }))).toBe("INVALID_ARGUMENT");
  });
});

describe("ledger audit", () => {
  it("reports a tampered cached balance", async () => {
    const { t, ids } = await setupGroup(["ada"]);
    await t.run(async (ctx) => {
      const account = await ctx.db.query("accounts").withIndex("by_key", (q) => q.eq("key", `wallet:${ids.ada}`)).unique();
      if (account) await ctx.db.patch(account._id, { balance: 500 });
    });
    const { internal } = await import("./_generated/api");
    const audit = await t.mutation(internal.ledger.audit.run, {});
    expect(audit.ok).toBe(false);
    expect(audit.violations.some((v) => v.startsWith("I5"))).toBe(true);
  });
});
