import { GENESIS_AMOUNT } from "../../shared/domain/issuance";
import { groupDay } from "../../shared/domain/time";
import { MINT_ACCOUNT, walletAccount } from "../../shared/domain/ledger";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getGroupConfig } from "../lib/auth";
import { openWallet, postTransaction } from "../ledger/post";

export function walletKey(memberId: Id<"members">) {
  return walletAccount(memberId);
}

export async function walletBalance(ctx: QueryCtx, memberId: Id<"members">): Promise<number> {
  const account = await ctx.db.query("accounts").withIndex("by_key", (q) => q.eq("key", walletKey(memberId))).unique();
  return account?.balance ?? 0;
}

/** What other members may see about a member: never email or identity. */
export function publicMember(m: Doc<"members">) {
  return { _id: m._id, displayName: m.displayName, avatar: m.avatar, role: m.role };
}

/** Creates an active member with a wallet and the genesis coin, in the caller's transaction. */
export async function createMember(
  ctx: MutationCtx,
  input: { tokenIdentifier: string; email: string; displayName: string; avatar: string; role: "admin" | "member" },
): Promise<Id<"members">> {
  const config = await getGroupConfig(ctx);
  const now = Date.now();
  const memberId = await ctx.db.insert("members", { ...input, status: "active", joinedAt: now });
  await openWallet(ctx, memberId, walletKey(memberId));
  await postTransaction(ctx, {
    kind: "GENESIS",
    idempotencyKey: `genesis:${memberId}`,
    postings: [
      { account: MINT_ACCOUNT, delta: -GENESIS_AMOUNT },
      { account: walletKey(memberId), delta: GENESIS_AMOUNT },
    ],
    groupDay: groupDay(now, config.timezone, config.rolloverHour),
    actorId: memberId,
    toMemberId: memberId,
  });
  await ctx.db.insert("feedEvents", { type: "joined", actorId: memberId });
  return memberId;
}
