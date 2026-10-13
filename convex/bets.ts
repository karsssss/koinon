// Peer-to-peer challenges (ECONOMY.md §6). Every transition is one serializable mutation; money only
// moves through postTransaction. Scheduled jobs (offer expiry, auto-confirm, jury close) re-check state
// and do nothing if the bet has already moved on.
//
// Not in this slice: open-to-all offers, judges, comments/reactions, push notifications.

import { v } from "convex/values";
import {
  AUTO_CONFIRM_MS,
  JURY_WINDOW_MS,
  MAX_OFFERS_PER_CHAIN,
  MAX_OPEN_OFFERS_PER_MAKER,
  OFFER_WINDOW_MS,
  challengeTermsError,
  escrowPostings,
  refundPostings,
  settlementPostings,
  stakeError,
  tallyJury,
  type BetOutcome,
} from "../shared/domain/bets";
import { groupDay } from "../shared/domain/time";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { postTransaction } from "./ledger/post";
import { adminMutation, appError, getGroupConfig, memberMutation, memberQuery } from "./lib/auth";
import { publicMember } from "./model/members";
import { betOutcome } from "./schema";

const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;
const TERMINAL = new Set<Doc<"bets">["status"]>(["settled", "void", "closed"]);

// ---------- helpers ----------

async function today(ctx: MutationCtx): Promise<string> {
  const config = await getGroupConfig(ctx);
  return groupDay(Date.now(), config.timezone, config.rolloverHour);
}

async function loadBet(ctx: QueryCtx, betId: Id<"bets">): Promise<Doc<"bets">> {
  const bet = await ctx.db.get(betId);
  if (bet === null) throw appError("INVALID_ARGUMENT", "That challenge doesn't exist.");
  return bet;
}

async function latestOffer(ctx: QueryCtx, betId: Id<"bets">): Promise<Doc<"betOffers">> {
  const offer = await ctx.db.query("betOffers").withIndex("by_bet", (q) => q.eq("betId", betId)).order("desc").first();
  if (offer === null) throw new Error(`bet ${betId} has no offers`);
  return offer;
}

const makerStake = (o: Doc<"betOffers">, bet: Doc<"bets">) => (o.makerId === bet.proposerId ? o.stakeA : o.stakeB);
const takerStake = (o: Doc<"betOffers">, bet: Doc<"bets">) => (o.makerId === bet.proposerId ? o.stakeB : o.stakeA);
const isParticipant = (bet: Doc<"bets">, id: Id<"members">) => bet.proposerId === id || bet.counterpartyId === id;

async function assertOpenOfferLimit(ctx: MutationCtx, makerId: Id<"members">) {
  const open = await ctx.db.query("betOffers").withIndex("by_maker_status", (q) => q.eq("makerId", makerId).eq("status", "open")).collect();
  if (open.length >= MAX_OPEN_OFFERS_PER_MAKER) {
    throw appError("LIMIT_REACHED", `You can have at most ${MAX_OPEN_OFFERS_PER_MAKER} open challenges at once.`);
  }
}

async function openOffer(ctx: MutationCtx, bet: Doc<"bets">, seq: number, makerId: Id<"members">, stakeA: number, stakeB: number) {
  const takerId = makerId === bet.proposerId ? bet.counterpartyId : bet.proposerId;
  const offerId = await ctx.db.insert("betOffers", { betId: bet._id, seq, makerId, takerId, stakeA, stakeB, status: "open", expiresAt: Date.now() + OFFER_WINDOW_MS });
  const offer = (await ctx.db.get(offerId)) as Doc<"betOffers">;
  await postTransaction(ctx, {
    kind: "BET_ESCROW",
    idempotencyKey: `bet:${bet._id}:offer:${seq}:escrow`,
    postings: escrowPostings(makerId, bet._id, makerStake(offer, bet)),
    groupDay: await today(ctx),
    actorId: makerId,
    betId: bet._id,
  });
  await ctx.scheduler.runAt(offer.expiresAt, internal.bets.expireOffer, { offerId });
  return offer;
}

async function refundMaker(ctx: MutationCtx, bet: Doc<"bets">, offer: Doc<"betOffers">) {
  await postTransaction(ctx, {
    kind: "BET_REFUND",
    idempotencyKey: `bet:${bet._id}:offer:${offer.seq}:refund`,
    postings: refundPostings(offer.makerId, bet._id, makerStake(offer, bet)),
    groupDay: await today(ctx),
    actorId: offer.makerId,
    betId: bet._id,
  });
}

/** Ends a negotiation with no deal: the open offer gets `status`, the maker is refunded, the bet closes. */
async function closeOffer(ctx: MutationCtx, bet: Doc<"bets">, offer: Doc<"betOffers">, status: "declined" | "withdrawn" | "expired") {
  await ctx.db.patch(offer._id, { status });
  await refundMaker(ctx, bet, offer);
  await ctx.db.patch(bet._id, { status: "closed", closedAt: Date.now() });
}

/** Pays out (or refunds on VOID) the escrow of an agreed bet, and records the result. */
async function settle(ctx: MutationCtx, bet: Doc<"bets">, outcome: BetOutcome, voidReason?: string) {
  if (bet.stakeA === undefined || bet.stakeB === undefined) throw new Error(`bet ${bet._id} has no agreed stakes`);
  const { kind, postings } = settlementPostings(
    { betId: bet._id, partyA: bet.proposerId, partyB: bet.counterpartyId, stakeA: bet.stakeA, stakeB: bet.stakeB },
    outcome,
  );
  const { txId } = await postTransaction(ctx, { kind, idempotencyKey: `bet:${bet._id}:settle`, postings, groupDay: await today(ctx), betId: bet._id });
  await ctx.db.patch(bet._id, { status: outcome === "VOID" ? "void" : "settled", outcome, closedAt: Date.now(), ...(voidReason && { voidReason }) });
  if (outcome === "VOID") {
    await ctx.db.insert("feedEvents", { type: "bet_void", actorId: bet.proposerId, targetId: bet.counterpartyId, betId: bet._id, txId });
  } else {
    const [winner, loser] = outcome === "A_WINS" ? [bet.proposerId, bet.counterpartyId] : [bet.counterpartyId, bet.proposerId];
    await ctx.db.insert("feedEvents", { type: "bet_settled", actorId: winner, targetId: loser, amount: bet.stakeA + bet.stakeB, betId: bet._id, txId });
  }
}

async function eligibleJurors(ctx: QueryCtx, bet: Doc<"bets">): Promise<Doc<"members">[]> {
  const active = await ctx.db.query("members").withIndex("by_status", (q) => q.eq("status", "active")).collect();
  return active.filter((m) => !isParticipant(bet, m._id));
}

// ---------- negotiation ----------

/** Proposes a challenge: escrows your stake and gives the other member 5 minutes to respond. */
export const create = memberMutation({
  args: { counterpartyId: v.id("members"), statement: v.string(), myStake: v.number(), theirStake: v.number(), resolveBy: v.number(), requestId: v.string() },
  handler: async (ctx, args) => {
    if (!REQUEST_ID.test(args.requestId)) throw appError("INVALID_ARGUMENT", "Invalid request ID.");
    const requestKey = `${ctx.me._id}:${args.requestId}`;
    const existing = await ctx.db.query("bets").withIndex("by_request", (q) => q.eq("requestKey", requestKey)).unique();
    if (existing !== null) return { betId: existing._id, replayed: true };

    const terms = challengeTermsError({ statement: args.statement, stakeA: args.myStake, stakeB: args.theirStake, resolveBy: args.resolveBy, now: Date.now() });
    if (terms) throw appError("INVALID_ARGUMENT", terms);
    if (args.counterpartyId === ctx.me._id) throw appError("INVALID_ARGUMENT", "You can't challenge yourself.");
    const other = await ctx.db.get(args.counterpartyId);
    if (other === null || other.status !== "active") throw appError("INVALID_ARGUMENT", "That member can't be challenged.");
    await assertOpenOfferLimit(ctx, ctx.me._id);

    const betId = await ctx.db.insert("bets", {
      proposerId: ctx.me._id,
      counterpartyId: other._id,
      statement: args.statement.trim(),
      resolveBy: args.resolveBy,
      requestKey,
      status: "offered",
      offerCount: 1,
    });
    const bet = (await ctx.db.get(betId)) as Doc<"bets">;
    await openOffer(ctx, bet, 1, ctx.me._id, args.myStake, args.theirStake); // throws INSUFFICIENT_FUNDS → nothing is saved
    await ctx.db.insert("feedEvents", { type: "bet_offered", actorId: ctx.me._id, targetId: other._id, amount: args.myStake, betId });
    return { betId, replayed: false };
  },
});

/** Accepts the open offer: escrows the taker's stake and activates the bet. Repeating it is harmless. */
export const accept = memberMutation({
  args: { betId: v.id("bets") },
  handler: async (ctx, { betId }) => {
    const bet = await loadBet(ctx, betId);
    const offer = await latestOffer(ctx, betId);
    if (offer.status === "accepted" && offer.takerId === ctx.me._id) return { status: "active" as const };
    if (offer.takerId !== ctx.me._id) throw appError("FORBIDDEN", "This offer isn't addressed to you.");
    if (bet.status !== "offered" || offer.status !== "open") throw appError("INVALID_STATE", "This offer is no longer open.");
    if (Date.now() >= offer.expiresAt) throw appError("OFFER_EXPIRED", "The 5-minute window has passed.");

    await postTransaction(ctx, {
      kind: "BET_ESCROW",
      idempotencyKey: `bet:${betId}:offer:${offer.seq}:accept`,
      postings: escrowPostings(ctx.me._id, betId, takerStake(offer, bet)),
      groupDay: await today(ctx),
      actorId: ctx.me._id,
      betId,
    });
    await ctx.db.patch(offer._id, { status: "accepted" });
    await ctx.db.patch(betId, { status: "active", stakeA: offer.stakeA, stakeB: offer.stakeB });
    await ctx.db.insert("feedEvents", { type: "bet_accepted", actorId: ctx.me._id, targetId: offer.makerId, amount: offer.stakeA + offer.stakeB, betId });
    return { status: "active" as const };
  },
});

/** Replaces the open offer with new stakes. The counterer becomes the maker; a fresh 5-minute window starts. */
export const counter = memberMutation({
  args: { betId: v.id("bets"), stakeA: v.number(), stakeB: v.number() },
  handler: async (ctx, args) => {
    const bet = await loadBet(ctx, args.betId);
    const offer = await latestOffer(ctx, args.betId);
    if (offer.takerId !== ctx.me._id) throw appError("FORBIDDEN", "This offer isn't addressed to you.");
    if (bet.status !== "offered" || offer.status !== "open") throw appError("INVALID_STATE", "This offer is no longer open.");
    if (Date.now() >= offer.expiresAt) throw appError("OFFER_EXPIRED", "The 5-minute window has passed.");
    if (bet.offerCount >= MAX_OFFERS_PER_CHAIN) throw appError("LIMIT_REACHED", `After ${MAX_OFFERS_PER_CHAIN} offers you can only accept or decline.`);
    const stakes = stakeError(args.stakeA, args.stakeB);
    if (stakes) throw appError("INVALID_ARGUMENT", `Invalid stakes: ${stakes}.`);
    await assertOpenOfferLimit(ctx, ctx.me._id);

    await ctx.db.patch(offer._id, { status: "countered" });
    await refundMaker(ctx, bet, offer);
    await ctx.db.patch(bet._id, { offerCount: bet.offerCount + 1 });
    await openOffer(ctx, bet, offer.seq + 1, ctx.me._id, args.stakeA, args.stakeB);
    return { status: "offered" as const };
  },
});

export const decline = memberMutation({
  args: { betId: v.id("bets") },
  handler: async (ctx, { betId }) => {
    const bet = await loadBet(ctx, betId);
    const offer = await latestOffer(ctx, betId);
    if (offer.takerId !== ctx.me._id) throw appError("FORBIDDEN", "This offer isn't addressed to you.");
    if (offer.status === "declined") return { status: "closed" as const };
    if (bet.status !== "offered" || offer.status !== "open") throw appError("INVALID_STATE", "This offer is no longer open.");
    await closeOffer(ctx, bet, offer, "declined");
    return { status: "closed" as const };
  },
});

export const withdraw = memberMutation({
  args: { betId: v.id("bets") },
  handler: async (ctx, { betId }) => {
    const bet = await loadBet(ctx, betId);
    const offer = await latestOffer(ctx, betId);
    if (offer.makerId !== ctx.me._id) throw appError("FORBIDDEN", "Only the member who made this offer can withdraw it.");
    if (offer.status === "withdrawn") return { status: "closed" as const };
    if (bet.status !== "offered" || offer.status !== "open") throw appError("INVALID_STATE", "This offer is no longer open.");
    await closeOffer(ctx, bet, offer, "withdrawn");
    return { status: "closed" as const };
  },
});

/** Scheduled at the offer's expiresAt. No-op if the offer was already answered. */
export const expireOffer = internalMutation({
  args: { offerId: v.id("betOffers") },
  handler: async (ctx, { offerId }) => {
    const offer = await ctx.db.get(offerId);
    if (offer === null || offer.status !== "open" || Date.now() < offer.expiresAt) return { expired: false };
    const bet = await loadBet(ctx, offer.betId);
    await closeOffer(ctx, bet, offer, "expired");
    return { expired: true };
  },
});

// ---------- resolution ----------

/** Either participant reports the outcome; the other confirms or disputes. */
export const report = memberMutation({
  args: { betId: v.id("bets"), outcome: betOutcome },
  handler: async (ctx, { betId, outcome }) => {
    const bet = await loadBet(ctx, betId);
    if (!isParticipant(bet, ctx.me._id)) throw appError("FORBIDDEN", "Only the two participants can report.");
    if (bet.status === "reported" && bet.reportedBy === ctx.me._id && bet.reportedOutcome === outcome) return { status: "reported" as const };
    if (bet.status !== "active") throw appError("INVALID_STATE", "This challenge isn't waiting for a result.");
    const reportedAt = Date.now();
    await ctx.db.patch(betId, { status: "reported", reportedBy: ctx.me._id, reportedOutcome: outcome, reportedAt });
    await ctx.scheduler.runAt(reportedAt + AUTO_CONFIRM_MS, internal.bets.autoConfirm, { betId, reportedAt });
    return { status: "reported" as const };
  },
});

function assertResponder(bet: Doc<"bets">, me: Id<"members">) {
  if (!isParticipant(bet, me)) throw appError("FORBIDDEN", "Only the two participants can respond.");
  if (bet.status !== "reported") throw appError("INVALID_STATE", "There is no reported result to respond to.");
  if (bet.reportedBy === me) throw appError("FORBIDDEN", "The other participant has to confirm your report.");
}

export const confirm = memberMutation({
  args: { betId: v.id("bets") },
  handler: async (ctx, { betId }) => {
    const bet = await loadBet(ctx, betId);
    if ((bet.status === "settled" || bet.status === "void") && isParticipant(bet, ctx.me._id)) return { status: bet.status };
    assertResponder(bet, ctx.me._id);
    if (bet.reportedOutcome === undefined) throw new Error("reported bet without outcome");
    await settle(ctx, bet, bet.reportedOutcome);
    return { status: bet.reportedOutcome === "VOID" ? ("void" as const) : ("settled" as const) };
  },
});

/** Sends the bet to a jury of the other members for 24 hours. */
export const dispute = memberMutation({
  args: { betId: v.id("bets") },
  handler: async (ctx, { betId }) => {
    const bet = await loadBet(ctx, betId);
    if (bet.status === "disputed" && isParticipant(bet, ctx.me._id)) return { status: "disputed" as const };
    assertResponder(bet, ctx.me._id);
    const juryClosesAt = Date.now() + JURY_WINDOW_MS;
    await ctx.db.patch(betId, { status: "disputed", juryClosesAt });
    await ctx.scheduler.runAt(juryClosesAt, internal.bets.closeJury, { betId });
    return { status: "disputed" as const };
  },
});

/** One final vote per eligible juror. The jury closes early once everyone eligible has voted. */
export const vote = memberMutation({
  args: { betId: v.id("bets"), choice: betOutcome },
  handler: async (ctx, { betId, choice }) => {
    const bet = await loadBet(ctx, betId);
    if (isParticipant(bet, ctx.me._id)) throw appError("FORBIDDEN", "Participants can't vote on their own challenge.");
    if (bet.status !== "disputed") throw appError("INVALID_STATE", "This challenge isn't being judged.");
    const mine = await ctx.db.query("juryVotes").withIndex("by_bet_voter", (q) => q.eq("betId", betId).eq("voterId", ctx.me._id)).unique();
    if (mine !== null) {
      if (mine.choice === choice) return { status: "disputed" as const };
      throw appError("INVALID_STATE", "You already voted.");
    }
    await ctx.db.insert("juryVotes", { betId, voterId: ctx.me._id, choice });
    const votes = await ctx.db.query("juryVotes").withIndex("by_bet_voter", (q) => q.eq("betId", betId)).collect();
    if (votes.length >= (await eligibleJurors(ctx, bet)).length) {
      await settle(ctx, bet, tallyJury(votes.map((v) => v.choice)));
      return { status: "closed" as const };
    }
    return { status: "disputed" as const };
  },
});

export const autoConfirm = internalMutation({
  args: { betId: v.id("bets"), reportedAt: v.number() },
  handler: async (ctx, { betId, reportedAt }) => {
    const bet = await ctx.db.get(betId);
    if (bet === null || bet.status !== "reported" || bet.reportedAt !== reportedAt || bet.reportedOutcome === undefined) return { settled: false };
    await settle(ctx, bet, bet.reportedOutcome);
    return { settled: true };
  },
});

export const closeJury = internalMutation({
  args: { betId: v.id("bets") },
  handler: async (ctx, { betId }) => {
    const bet = await ctx.db.get(betId);
    if (bet === null || bet.status !== "disputed") return { settled: false };
    const votes = await ctx.db.query("juryVotes").withIndex("by_bet_voter", (q) => q.eq("betId", betId)).collect();
    await settle(ctx, bet, tallyJury(votes.map((v) => v.choice)));
    return { settled: true };
  },
});

/** Admin safety valve: voids any unfinished challenge and refunds all escrow. Visible in the feed. */
export const adminVoid = adminMutation({
  args: { betId: v.id("bets"), reason: v.string() },
  handler: async (ctx, { betId, reason }) => {
    const text = reason.trim();
    if (text.length < 3 || text.length > 200) throw appError("INVALID_ARGUMENT", "Give a reason (3–200 characters).");
    const bet = await loadBet(ctx, betId);
    if (TERMINAL.has(bet.status)) throw appError("INVALID_STATE", "This challenge is already finished.");
    if (bet.status === "offered") {
      const offer = await latestOffer(ctx, betId);
      await ctx.db.patch(offer._id, { status: "cancelled" });
      await refundMaker(ctx, bet, offer);
      await ctx.db.patch(betId, { status: "void", outcome: "VOID", closedAt: Date.now(), voidReason: text });
      await ctx.db.insert("feedEvents", { type: "bet_void", actorId: bet.proposerId, targetId: bet.counterpartyId, betId });
    } else {
      await settle(ctx, bet, "VOID", text);
    }
    return { status: "void" as const };
  },
});

// ---------- queries ----------

async function view(ctx: QueryCtx, bet: Doc<"bets">, me: Doc<"members">) {
  const [proposer, counterparty, offer] = await Promise.all([ctx.db.get(bet.proposerId), ctx.db.get(bet.counterpartyId), latestOffer(ctx, bet._id)]);
  const participant = isParticipant(bet, me._id);
  const open = bet.status === "offered" && offer.status === "open";
  const myVote = bet.status === "disputed" ? await ctx.db.query("juryVotes").withIndex("by_bet_voter", (q) => q.eq("betId", bet._id).eq("voterId", me._id)).unique() : null;
  const can = {
    accept: open && offer.takerId === me._id,
    counter: open && offer.takerId === me._id && bet.offerCount < MAX_OFFERS_PER_CHAIN,
    decline: open && offer.takerId === me._id,
    withdraw: open && offer.makerId === me._id,
    report: bet.status === "active" && participant,
    confirm: bet.status === "reported" && participant && bet.reportedBy !== me._id,
    dispute: bet.status === "reported" && participant && bet.reportedBy !== me._id,
    vote: bet.status === "disputed" && !participant && myVote === null,
    adminVoid: me.role === "admin" && !TERMINAL.has(bet.status),
  };
  return {
    _id: bet._id,
    createdAt: bet._creationTime,
    statement: bet.statement,
    status: bet.status,
    resolveBy: bet.resolveBy,
    proposer: proposer && publicMember(proposer),
    counterparty: counterparty && publicMember(counterparty),
    /** Current terms: the open offer while negotiating, the agreed stakes afterwards. */
    stakeA: bet.stakeA ?? offer.stakeA,
    stakeB: bet.stakeB ?? offer.stakeB,
    offer: { seq: offer.seq, makerId: offer.makerId, takerId: offer.takerId, status: offer.status, expiresAt: offer.expiresAt },
    offerCount: bet.offerCount,
    reportedBy: bet.reportedBy ?? null,
    reportedOutcome: bet.reportedOutcome ?? null,
    reportedAt: bet.reportedAt ?? null,
    juryClosesAt: bet.juryClosesAt ?? null,
    outcome: bet.outcome ?? null,
    voidReason: bet.voidReason ?? null,
    myRole: bet.proposerId === me._id ? ("A" as const) : bet.counterpartyId === me._id ? ("B" as const) : null,
    can,
    needsMe: can.accept || can.confirm || can.vote,
  };
}

/** Recent challenges across the group, newest first (OD-4: the economy is transparent). */
export const list = memberQuery({
  args: {},
  handler: async (ctx) => {
    const bets = await ctx.db.query("bets").order("desc").take(50);
    return Promise.all(bets.map((b) => view(ctx, b, ctx.me)));
  },
});

export const get = memberQuery({
  args: { betId: v.id("bets") },
  handler: async (ctx, { betId }) => {
    const bet = await ctx.db.get(betId);
    if (bet === null) return null;
    const base = await view(ctx, bet, ctx.me);
    const offers = await ctx.db.query("betOffers").withIndex("by_bet", (q) => q.eq("betId", betId)).collect();
    const votes = await ctx.db.query("juryVotes").withIndex("by_bet_voter", (q) => q.eq("betId", betId)).collect();
    const closed = TERMINAL.has(bet.status);
    const names = new Map((await Promise.all(votes.map((v) => ctx.db.get(v.voterId)))).flatMap((m) => (m ? [[m._id, m.displayName] as const] : [])));
    return {
      ...base,
      offers: offers.map((o) => ({ seq: o.seq, makerId: o.makerId, stakeA: o.stakeA, stakeB: o.stakeB, status: o.status })),
      jury:
        bet.juryClosesAt === undefined
          ? null
          : {
              eligible: (await eligibleJurors(ctx, bet)).length,
              cast: votes.length,
              // Individual votes are revealed only after the challenge closes (ECONOMY.md §6.4).
              votes: closed ? votes.map((v) => ({ voter: names.get(v.voterId) ?? "Former member", choice: v.choice })) : null,
            },
    };
  },
});
