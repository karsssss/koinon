// Authorization wrappers. Every public function must be built from one of these:
// - authedQuery/authedMutation: signed in (used only for onboarding: session, activate).
// - memberQuery/memberMutation: signed in AND an active group member. ctx.me is the member.
// - adminMutation: an active member with role "admin".

import { customCtx, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "NOT_A_MEMBER"
  | "FORBIDDEN"
  | "NOT_INVITED"
  | "SEAT_CAP_REACHED"
  | "INVALID_ARGUMENT"
  | "INSUFFICIENT_FUNDS"
  | "IDEMPOTENCY_CONFLICT"
  | "NOT_CONFIGURED"
  | "OFFER_EXPIRED"
  | "INVALID_STATE"
  | "LIMIT_REACHED";

export function appError(code: ErrorCode, message: string): ConvexError<{ code: ErrorCode; message: string }> {
  return new ConvexError({ code, message });
}

export async function requireIdentity(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) throw appError("UNAUTHENTICATED", "Sign in first.");
  return identity;
}

export async function requireMember(ctx: QueryCtx | MutationCtx): Promise<Doc<"members">> {
  const identity = await requireIdentity(ctx);
  const me = await ctx.db
    .query("members")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (me === null || me.status !== "active") throw appError("NOT_A_MEMBER", "This is a private group.");
  return me;
}

export const authedQuery = customQuery(query, customCtx(async (ctx) => ({ identity: await requireIdentity(ctx) })));
export const authedMutation = customMutation(mutation, customCtx(async (ctx) => ({ identity: await requireIdentity(ctx) })));
export const memberQuery = customQuery(query, customCtx(async (ctx) => ({ me: await requireMember(ctx) })));
export const memberMutation = customMutation(mutation, customCtx(async (ctx) => ({ me: await requireMember(ctx) })));
export const adminMutation = customMutation(
  mutation,
  customCtx(async (ctx) => {
    const me = await requireMember(ctx);
    if (me.role !== "admin") throw appError("FORBIDDEN", "Admins only.");
    return { me };
  }),
);

export async function getGroupConfig(ctx: QueryCtx | MutationCtx): Promise<Doc<"groupConfig">> {
  const config = await ctx.db.query("groupConfig").first();
  if (config === null) throw appError("NOT_CONFIGURED", "The group has not been set up yet.");
  return config;
}
