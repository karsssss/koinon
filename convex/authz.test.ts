import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { errorCode, identity, setupGroup } from "../test/convexHarness";

describe("unauthenticated access", () => {
  it("every public query and mutation rejects a caller with no identity", async () => {
    const { t, ids } = await setupGroup(["ada", "bo"]);
    const calls: [string, () => Promise<unknown>][] = [
      ["members.session", () => t.query(api.members.session, {})],
      ["members.activate", () => t.mutation(api.members.activate, {})],
      ["members.list", () => t.query(api.members.list, {})],
      ["daily.checkIn", () => t.mutation(api.daily.checkIn, {})],
      ["wallet.summary", () => t.query(api.wallet.summary, {})],
      ["wallet.history", () => t.query(api.wallet.history, { paginationOpts: { numItems: 10, cursor: null } })],
      ["wallet.transfer", () => t.mutation(api.wallet.transfer, { toMemberId: ids.bo!, amount: 1, requestId: "req-00000001" })],
      ["feed.recent", () => t.query(api.feed.recent, {})],
      ["invites.create", () => t.mutation(api.invites.create, { email: "x@y.z", displayName: "X" })],
    ];
    for (const [name, call] of calls) expect([name, await errorCode(call())]).toEqual([name, "UNAUTHENTICATED"]);
  });
});

describe("group authorization", () => {
  it("a signed-in stranger cannot read or change group data", async () => {
    const { t, ids } = await setupGroup(["ada", "bo"]);
    const stranger = t.withIdentity(identity("mallory"));
    expect(await stranger.query(api.members.session, {})).toEqual({ status: "not_invited" });
    expect(await errorCode(stranger.mutation(api.members.activate, {}))).toBe("NOT_INVITED");
    expect(await errorCode(stranger.query(api.members.list, {}))).toBe("NOT_A_MEMBER");
    expect(await errorCode(stranger.query(api.wallet.summary, {}))).toBe("NOT_A_MEMBER");
    expect(await errorCode(stranger.query(api.wallet.history, { paginationOpts: { numItems: 5, cursor: null } }))).toBe("NOT_A_MEMBER");
    expect(await errorCode(stranger.query(api.feed.recent, {}))).toBe("NOT_A_MEMBER");
    expect(await errorCode(stranger.mutation(api.daily.checkIn, {}))).toBe("NOT_A_MEMBER");
    expect(await errorCode(stranger.mutation(api.wallet.transfer, { toMemberId: ids.bo!, amount: 1, requestId: "req-00000001" }))).toBe("NOT_A_MEMBER");
  });

  it("a frozen member loses access", async () => {
    const { t, ids, as } = await setupGroup(["ada", "bo"]);
    await t.run((ctx) => ctx.db.patch(ids.bo!, { status: "frozen" }));
    expect(await errorCode(as("bo").query(api.wallet.summary, {}))).toBe("NOT_A_MEMBER");
    expect(await as("bo").query(api.members.session, {})).toEqual({ status: "frozen" });
  });

  it("only admins can invite", async () => {
    const { as } = await setupGroup(["ada", "bo"]);
    expect(await errorCode(as("bo").mutation(api.invites.create, { email: "cy@test.invalid", displayName: "Cy" }))).toBe("FORBIDDEN");
    await as("ada").mutation(api.invites.create, { email: "cy@test.invalid", displayName: "Cy" });
  });

  it("other members never see emails or identities", async () => {
    const { as } = await setupGroup(["ada", "bo"]);
    const list = await as("bo").query(api.members.list, {});
    expect(Object.keys(list[0] ?? {}).sort()).toEqual(["_id", "avatar", "balance", "displayName", "role"]);
  });
});

describe("invite-only membership", () => {
  it("an invited, verified email activates once and gets exactly one genesis coin", async () => {
    const { t, as } = await setupGroup(["ada"]);
    await as("ada").mutation(api.invites.create, { email: "cy@test.invalid", displayName: "Cy" });
    const cy = t.withIdentity(identity("cy"));
    expect(await cy.query(api.members.session, {})).toEqual({ status: "invited" });
    const [a, b] = await Promise.all([cy.mutation(api.members.activate, {}), cy.mutation(api.members.activate, {})]);
    expect(a.memberId).toBe(b.memberId);
    expect([a.created, b.created].sort()).toEqual([false, true]);
    const summary = await cy.query(api.wallet.summary, {});
    expect(summary.balance).toBe(1);
    expect(summary.me.displayName).toBe("Cy");
    const genesis = await t.run(async (ctx) => (await ctx.db.query("transactions").collect()).filter((tx) => tx.kind === "GENESIS").length);
    expect(genesis).toBe(2);
  });

  it("an unverified email is treated as not invited", async () => {
    const { t, as } = await setupGroup(["ada"]);
    await as("ada").mutation(api.invites.create, { email: "cy@test.invalid", displayName: "Cy" });
    const unverified = t.withIdentity({ ...identity("cy"), emailVerified: false });
    expect(await errorCode(unverified.mutation(api.members.activate, {}))).toBe("NOT_INVITED");
  });

  it("enforces the seat cap", async () => {
    const { t, as } = await setupGroup(["ada", "bo"], { seatCap: 3 });
    await as("ada").mutation(api.invites.create, { email: "cy@test.invalid", displayName: "Cy" });
    expect(await errorCode(as("ada").mutation(api.invites.create, { email: "dee@test.invalid", displayName: "Dee" }))).toBe("SEAT_CAP_REACHED");
    // Even if an invite slipped in, activation re-checks the cap.
    await t.run((ctx) => ctx.db.insert("invites", { email: "dee@test.invalid", displayName: "Dee", status: "pending" }));
    await t.withIdentity(identity("cy")).mutation(api.members.activate, {});
    expect(await errorCode(t.withIdentity(identity("dee")).mutation(api.members.activate, {}))).toBe("SEAT_CAP_REACHED");
  });
});

describe("structural guards", () => {
  const dir = new URL(".", import.meta.url);
  const files = readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.startsWith("_generated"))
    .map((f) => ({ name: f.replaceAll("\\", "/"), text: readFileSync(new URL(f.replaceAll("\\", "/"), dir), "utf8") }));

  it("no public function bypasses the auth wrappers", () => {
    const offenders = files.filter((f) => f.name !== "lib/auth.ts" && /=\s*(query|mutation|action)\(/.test(f.text)).map((f) => f.name);
    expect(offenders).toEqual([]);
  });

  it("only the ledger module writes ledger tables (demo reset may only delete)", () => {
    const writes = /\.(insert|replace)\(\s*"(accounts|transactions|postings)"/;
    expect(files.filter((f) => writes.test(f.text) && f.name !== "ledger/post.ts").map((f) => f.name)).toEqual([]);
    const patchesBalance = files.filter((f) => /\.patch\([^;]*\bbalance\b/.test(f.text) && f.name !== "ledger/post.ts");
    expect(patchesBalance.map((f) => f.name)).toEqual([]);
  });
});
