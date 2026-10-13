import { appError, authedMutation, authedQuery, getGroupConfig, memberQuery } from "./lib/auth";
import { createMember, publicMember, walletBalance } from "./model/members";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { UserIdentity } from "convex/server";

function normalizeEmail(email: string | undefined): string | null {
  return email ? email.trim().toLowerCase() : null;
}

function isBootstrapAdmin(email: string | null): boolean {
  const admin = normalizeEmail(process.env.ADMIN_EMAIL);
  return admin !== null && email === admin;
}

async function pendingInvite(ctx: QueryCtx | MutationCtx, email: string | null) {
  if (email === null) return null;
  const invites = await ctx.db.query("invites").withIndex("by_email", (q) => q.eq("email", email)).collect();
  return invites.find((i) => i.status === "pending") ?? null;
}

async function memberFor(ctx: QueryCtx | MutationCtx, identity: UserIdentity) {
  return ctx.db
    .query("members")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
}

/** Onboarding state for the signed-in identity. Signed in, but not necessarily a member. */
export const session = authedQuery({
  args: {},
  handler: async (ctx) => {
    const me = await memberFor(ctx, ctx.identity);
    if (me !== null) {
      return me.status === "active" ? { status: "member" as const, member: publicMember(me) } : { status: "frozen" as const };
    }
    const email = ctx.identity.emailVerified === false ? null : normalizeEmail(ctx.identity.email);
    if ((await pendingInvite(ctx, email)) !== null || isBootstrapAdmin(email)) return { status: "invited" as const };
    return { status: "not_invited" as const };
  },
});

/** Turns an invited identity into a member (idempotent). Mints the genesis coin exactly once. */
export const activate = authedMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await memberFor(ctx, ctx.identity);
    if (existing !== null) return { memberId: existing._id, created: false };

    const email = ctx.identity.emailVerified === false ? null : normalizeEmail(ctx.identity.email);
    const invite = await pendingInvite(ctx, email);
    const admin = isBootstrapAdmin(email);
    if (email === null || (invite === null && !admin)) throw appError("NOT_INVITED", "This is a private group.");

    const config = await getGroupConfig(ctx);
    const active = await ctx.db.query("members").withIndex("by_status", (q) => q.eq("status", "active")).collect();
    if (active.length >= config.seatCap) throw appError("SEAT_CAP_REACHED", "The group is full.");
    if (active.some((m) => m.email === email)) throw appError("NOT_INVITED", "This email already belongs to a member.");

    const memberId = await createMember(ctx, {
      tokenIdentifier: ctx.identity.tokenIdentifier,
      email,
      displayName: invite?.displayName ?? ctx.identity.name ?? email.split("@")[0] ?? "Member",
      avatar: "🙂",
      role: admin ? "admin" : "member",
    });
    if (invite) await ctx.db.patch(invite._id, { status: "accepted" });
    return { memberId, created: true };
  },
});

/** Group members with balances, richest first (OD-4 default: balances are visible to the group). */
export const list = memberQuery({
  args: {},
  handler: async (ctx) => {
    const members = await ctx.db.query("members").withIndex("by_status", (q) => q.eq("status", "active")).collect();
    const rows = await Promise.all(members.map(async (m) => ({ ...publicMember(m), balance: await walletBalance(ctx, m._id) })));
    return rows.sort((a, b) => b.balance - a.balance || a.displayName.localeCompare(b.displayName));
  },
});
