import { CHECKIN_AMOUNT } from "../shared/domain/issuance";
import { MINT_ACCOUNT } from "../shared/domain/ledger";
import { groupDay } from "../shared/domain/time";
import { getGroupConfig, memberMutation } from "./lib/auth";
import { postTransaction } from "./ledger/post";
import { walletKey } from "./model/members";

/** Daily check-in (+10, once per member per group day). The group day is computed here, never by the client. */
export const checkIn = memberMutation({
  args: {},
  handler: async (ctx) => {
    const config = await getGroupConfig(ctx);
    const day = groupDay(Date.now(), config.timezone, config.rolloverHour);
    const claimed = await ctx.db
      .query("dailyClaims")
      .withIndex("by_member_kind_day", (q) => q.eq("memberId", ctx.me._id).eq("kind", "CHECKIN").eq("groupDay", day))
      .unique();
    if (claimed !== null) return { status: "already_claimed" as const, groupDay: day };

    const { txId } = await postTransaction(ctx, {
      kind: "CHECKIN",
      idempotencyKey: `checkin:${ctx.me._id}:${day}`,
      postings: [
        { account: MINT_ACCOUNT, delta: -CHECKIN_AMOUNT },
        { account: walletKey(ctx.me._id), delta: CHECKIN_AMOUNT },
      ],
      groupDay: day,
      actorId: ctx.me._id,
      toMemberId: ctx.me._id,
    });
    await ctx.db.insert("dailyClaims", { memberId: ctx.me._id, groupDay: day, kind: "CHECKIN", txId });
    await ctx.db.insert("feedEvents", { type: "checkin", actorId: ctx.me._id, amount: CHECKIN_AMOUNT, txId });
    return { status: "claimed" as const, groupDay: day, amount: CHECKIN_AMOUNT };
  },
});
