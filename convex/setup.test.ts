import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { errorCode, identity, setupGroup } from "../test/convexHarness";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("CLI invites (setup:invite)", () => {
  it("invites real members who can then activate, with the same validation and seat cap", async () => {
    const { t } = await setupGroup(["ada"], { seatCap: 3 });
    await t.mutation(internal.setup.invite, { invites: [{ email: " Sam@Example.com ", displayName: "Sam" }] });
    const sam = t.withIdentity(identity("sam", "sam@example.com"));
    expect(await sam.query(api.members.session, {})).toEqual({ status: "invited" });
    expect((await sam.mutation(api.members.activate, {})).created).toBe(true);

    expect(await errorCode(t.mutation(internal.setup.invite, { invites: [{ email: "sam@example.com", displayName: "Sam" }] }))).toBe("INVALID_ARGUMENT");
    await t.mutation(internal.setup.invite, { invites: [{ email: "kim@example.com", displayName: "Kim" }] });
    expect(await errorCode(t.mutation(internal.setup.invite, { invites: [{ email: "lee@example.com", displayName: "Lee" }] }))).toBe("SEAT_CAP_REACHED");
  });
});

describe("demo:reset safety", () => {
  it("refuses without DEMO_MODE and refuses to wipe a group with real members", async () => {
    const { t } = await setupGroup(["ada"]);
    vi.stubEnv("DEMO_MODE", "false");
    await expect(t.mutation(internal.demo.reset, {})).rejects.toThrow(/DEMO_MODE=true/);
    vi.stubEnv("DEMO_MODE", "true");
    await expect(t.mutation(internal.demo.reset, {})).rejects.toThrow(/non-demo member/);
    expect(await t.run(async (ctx) => (await ctx.db.query("members").collect()).length)).toBe(1);
  });

  it("resets a demo-only deployment to the 8 seeded profiles", async () => {
    const { t } = await setupGroup([]);
    vi.stubEnv("DEMO_MODE", "true");
    expect(await t.mutation(internal.demo.reset, {})).toEqual({ created: 8 });
    expect(await t.mutation(internal.demo.reset, {})).toEqual({ created: 8 });
    expect(await t.run(async (ctx) => (await ctx.db.query("members").collect()).length)).toBe(8);
  });
});
