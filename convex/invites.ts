import { v } from "convex/values";
import { adminMutation, appError, getGroupConfig } from "./lib/auth";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Adds an email to the in-app allowlist. The person still needs a Clerk invitation
 * (Clerk dashboard, Invite-only mode) to be able to sign in. Pending invites count toward the seat cap.
 */
export const create = adminMutation({
  args: { email: v.string(), displayName: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const displayName = args.displayName.trim();
    if (!EMAIL.test(email)) throw appError("INVALID_ARGUMENT", "Enter a valid email.");
    if (displayName.length < 1 || displayName.length > 40) throw appError("INVALID_ARGUMENT", "Names are 1–40 characters.");
    const existing = await ctx.db.query("invites").withIndex("by_email", (q) => q.eq("email", email)).collect();
    if (existing.some((i) => i.status !== "revoked")) throw appError("INVALID_ARGUMENT", "That email is already invited.");

    const config = await getGroupConfig(ctx);
    const active = await ctx.db.query("members").withIndex("by_status", (q) => q.eq("status", "active")).collect();
    const pending = (await ctx.db.query("invites").collect()).filter((i) => i.status === "pending");
    if (active.length + pending.length >= config.seatCap) throw appError("SEAT_CAP_REACHED", "The group is full.");

    return ctx.db.insert("invites", { email, displayName, status: "pending", invitedBy: ctx.me._id });
  },
});
