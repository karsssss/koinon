import { memberQuery } from "./lib/auth";
import { publicMember } from "./model/members";
import type { Id } from "./_generated/dataModel";

/** The latest group events. Only public economy events exist in this slice. */
export const recent = memberQuery({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query("feedEvents").order("desc").take(20);
    const cache = new Map<Id<"members">, ReturnType<typeof publicMember> | null>();
    const who = async (id: Id<"members"> | undefined) => {
      if (id === undefined) return null;
      if (!cache.has(id)) {
        const m = await ctx.db.get(id);
        cache.set(id, m ? publicMember(m) : null);
      }
      return cache.get(id) ?? null;
    };
    const betSummary = async (id: Id<"bets">) => {
      const b = await ctx.db.get(id);
      return b ? { _id: b._id, statement: b.statement } : null;
    };
    return Promise.all(
      events.map(async (e) => ({
        _id: e._id,
        type: e.type,
        at: e._creationTime,
        amount: e.amount ?? null,
        actor: await who(e.actorId),
        target: await who(e.targetId),
        bet: e.betId ? await betSummary(e.betId) : null,
      })),
    );
  },
});
