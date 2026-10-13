// NON-PRODUCTION demo data. Internal functions only (callable from the CLI, never from clients),
// and they refuse to run unless the deployment has DEMO_MODE=true.

import { DEMO_PROFILES, demoTokenIdentifier } from "../shared/demo";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { createMember } from "./model/members";

const TABLES = ["feedEvents", "dailyClaims", "postings", "transactions", "accounts", "invites", "members", "ledgerAudits", "groupConfig"] as const;

function assertDemoMode(): void {
  if (process.env.DEMO_MODE !== "true") {
    throw new Error("Demo data is only available on deployments with DEMO_MODE=true (never production).");
  }
}

async function seedProfiles(ctx: MutationCtx) {
  if ((await ctx.db.query("groupConfig").first()) === null) {
    // OD-2 (group timezone) is still open: DEMO_TIMEZONE or UTC is a placeholder for demos only.
    await ctx.db.insert("groupConfig", { name: "Koinon demo", timezone: process.env.DEMO_TIMEZONE ?? "UTC", rolloverHour: 4, seatCap: 8 });
  }
  let created = 0;
  for (const p of DEMO_PROFILES) {
    const tokenIdentifier = demoTokenIdentifier(p.subject);
    const existing = await ctx.db.query("members").withIndex("by_token", (q) => q.eq("tokenIdentifier", tokenIdentifier)).unique();
    if (existing !== null) continue;
    await ctx.db.insert("invites", { email: p.email, displayName: p.displayName, status: "accepted" });
    await createMember(ctx, { tokenIdentifier, email: p.email, displayName: p.displayName, avatar: p.avatar, role: p.role });
    created++;
  }
  return { created };
}

/** Adds any missing demo profiles (idempotent). */
export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    assertDemoMode();
    return seedProfiles(ctx);
  },
});

/** Wipes every table and reseeds. Used before each E2E run. */
export const reset = internalMutation({
  args: {},
  handler: async (ctx) => {
    assertDemoMode();
    for (const table of TABLES) {
      for (const doc of await ctx.db.query(table).collect()) await ctx.db.delete(doc._id);
    }
    return seedProfiles(ctx);
  },
});
