import { v } from "convex/values";
import { isValidTimeZone } from "../shared/domain/time";
import { internalMutation } from "./_generated/server";
import { addInvite } from "./invites";

/**
 * One-time group setup for a real deployment (run from the CLI, not callable by clients):
 *   npx convex run setup:initGroup '{"name":"Koinon","timezone":"<IANA zone>","rolloverHour":4,"seatCap":8}'
 */
export const initGroup = internalMutation({
  args: { name: v.string(), timezone: v.string(), rolloverHour: v.number(), seatCap: v.number() },
  handler: async (ctx, args) => {
    if (!isValidTimeZone(args.timezone)) throw new Error(`Unknown timezone ${args.timezone}`);
    if (!Number.isInteger(args.rolloverHour) || args.rolloverHour < 0 || args.rolloverHour > 23) throw new Error("rolloverHour must be 0–23");
    if (!Number.isInteger(args.seatCap) || args.seatCap < 1) throw new Error("seatCap must be a positive integer");
    const existing = await ctx.db.query("groupConfig").first();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return ctx.db.insert("groupConfig", args);
  },
});

/**
 * Invites members from the CLI (there is no invite UI yet), with the same validation and seat cap as the
 * admin mutation:
 *   npx convex run setup:invite '{"invites":[{"email":"friend@example.com","displayName":"Sam"}]}'
 * Each person also needs a Clerk invitation (Clerk dashboard) to be able to sign in.
 */
export const invite = internalMutation({
  args: { invites: v.array(v.object({ email: v.string(), displayName: v.string() })) },
  handler: async (ctx, args) => {
    const ids = [];
    for (const i of args.invites) ids.push(await addInvite(ctx, i));
    return ids;
  },
});
