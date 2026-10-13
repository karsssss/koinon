import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { TRANSFER_NOTE_MAX } from "../shared/domain/issuance";
import { isCoinAmount } from "../shared/domain/money";
import { groupDay } from "../shared/domain/time";
import { appError, getGroupConfig, memberMutation, memberQuery } from "./lib/auth";
import { postTransaction } from "./ledger/post";
import { publicMember, walletBalance, walletKey } from "./model/members";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

/** Balance plus what the client needs to show today's claim state. The client derives "today" for display only. */
export const summary = memberQuery({
  args: {},
  handler: async (ctx) => {
    const config = await getGroupConfig(ctx);
    const lastCheckIn = await ctx.db
      .query("dailyClaims")
      .withIndex("by_member_kind_day", (q) => q.eq("memberId", ctx.me._id).eq("kind", "CHECKIN"))
      .order("desc")
      .first();
    return {
      me: publicMember(ctx.me),
      balance: await walletBalance(ctx, ctx.me._id),
      lastCheckInDay: lastCheckIn?.groupDay ?? null,
      timezone: config.timezone,
      rolloverHour: config.rolloverHour,
    };
  },
});

async function memberName(ctx: QueryCtx, id: Id<"members"> | undefined) {
  if (id === undefined) return null;
  const m = await ctx.db.get(id);
  return m ? { displayName: m.displayName, avatar: m.avatar } : null;
}

/** The caller's own wallet history, newest first. Each line says why the balance changed. */
export const history = memberQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const page = await ctx.db
      .query("postings")
      .withIndex("by_account", (q) => q.eq("accountKey", walletKey(ctx.me._id)))
      .order("desc")
      .paginate(paginationOpts);
    const entries = await Promise.all(
      page.page.map(async (p) => {
        const tx = await ctx.db.get(p.txId);
        if (tx === null) throw new Error(`posting ${p._id} has no transaction`);
        const counterpartyId = tx.kind === "TRANSFER" ? (p.delta < 0 ? tx.toMemberId : tx.fromMemberId) : undefined;
        return {
          _id: p._id,
          kind: tx.kind,
          delta: p.delta,
          groupDay: tx.groupDay,
          at: tx._creationTime,
          memo: tx.memo ?? null,
          counterparty: await memberName(ctx, counterpartyId),
        };
      }),
    );
    return { ...page, page: entries };
  },
});

/**
 * Sends coins to another member. `requestId` is generated once per user intent; retrying with
 * the same ID returns the original result instead of sending twice.
 */
export const transfer = memberMutation({
  args: { toMemberId: v.id("members"), amount: v.number(), note: v.optional(v.string()), requestId: v.string() },
  handler: async (ctx, args) => {
    if (!REQUEST_ID.test(args.requestId)) throw appError("INVALID_ARGUMENT", "Invalid request ID.");
    if (!isCoinAmount(args.amount)) throw appError("INVALID_ARGUMENT", "Amount must be a whole number of coins, at least 1.");
    const note = args.note?.trim() ?? "";
    if (note.length > TRANSFER_NOTE_MAX) throw appError("INVALID_ARGUMENT", `Notes are at most ${TRANSFER_NOTE_MAX} characters.`);
    if (args.toMemberId === ctx.me._id) throw appError("INVALID_ARGUMENT", "You can't send coins to yourself.");
    const recipient = await ctx.db.get(args.toMemberId);
    if (recipient === null || recipient.status !== "active") throw appError("INVALID_ARGUMENT", "That member can't receive coins.");

    const config = await getGroupConfig(ctx);
    const { txId, replayed } = await postTransaction(ctx, {
      kind: "TRANSFER",
      idempotencyKey: `transfer:${ctx.me._id}:${args.requestId}`,
      postings: [
        { account: walletKey(ctx.me._id), delta: -args.amount },
        { account: walletKey(recipient._id), delta: args.amount },
      ],
      groupDay: groupDay(Date.now(), config.timezone, config.rolloverHour),
      actorId: ctx.me._id,
      fromMemberId: ctx.me._id,
      toMemberId: recipient._id,
      ...(note && { memo: note }),
    });
    if (!replayed) {
      await ctx.db.insert("feedEvents", { type: "transfer", actorId: ctx.me._id, targetId: recipient._id, amount: args.amount, txId });
    }
    return { txId, replayed };
  },
});
