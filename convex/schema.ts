import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const txKind = v.union(
  v.literal("GENESIS"),
  v.literal("CHECKIN"),
  v.literal("DIGEST"),
  v.literal("TRANSFER"),
  v.literal("BET_ESCROW"),
  v.literal("BET_REFUND"),
  v.literal("BET_PAYOUT"),
  v.literal("SEASON_REWARD"),
  v.literal("PURCHASE"),
  v.literal("ADJUSTMENT"),
);

export const betOutcome = v.union(v.literal("A_WINS"), v.literal("B_WINS"), v.literal("VOID"));

export default defineSchema({
  /** Singleton (ECONOMY.md §5.1). Timezone is OD-2; the demo seed uses a placeholder. */
  groupConfig: defineTable({
    name: v.string(),
    timezone: v.string(),
    rolloverHour: v.number(),
    seatCap: v.number(),
  }),

  members: defineTable({
    tokenIdentifier: v.string(),
    email: v.string(),
    displayName: v.string(),
    avatar: v.string(),
    role: v.union(v.literal("admin"), v.literal("member")),
    status: v.union(v.literal("active"), v.literal("frozen")),
    joinedAt: v.number(),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_email", ["email"])
    .index("by_status", ["status"]),

  invites: defineTable({
    email: v.string(),
    displayName: v.string(),
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("revoked")),
    invitedBy: v.optional(v.id("members")),
  }).index("by_email", ["email"]),

  /** Cached balances. Written only by convex/ledger/post.ts. */
  accounts: defineTable({
    key: v.string(),
    kind: v.union(v.literal("wallet"), v.literal("mint"), v.literal("burn"), v.literal("escrow"), v.literal("pool")),
    memberId: v.optional(v.id("members")),
    balance: v.number(),
  }).index("by_key", ["key"]),

  /** Append-only journal. Written only by convex/ledger/post.ts. */
  transactions: defineTable({
    kind: txKind,
    idempotencyKey: v.string(),
    fingerprint: v.string(),
    actorId: v.optional(v.id("members")),
    groupDay: v.string(),
    fromMemberId: v.optional(v.id("members")),
    toMemberId: v.optional(v.id("members")),
    memo: v.optional(v.string()),
    betId: v.optional(v.id("bets")),
  }).index("by_key", ["idempotencyKey"]),

  postings: defineTable({
    txId: v.id("transactions"),
    accountKey: v.string(),
    delta: v.number(),
  }).index("by_account", ["accountKey"]),

  dailyClaims: defineTable({
    memberId: v.id("members"),
    groupDay: v.string(),
    kind: v.literal("CHECKIN"),
    txId: v.id("transactions"),
  }).index("by_member_kind_day", ["memberId", "kind", "groupDay"]),

  feedEvents: defineTable({
    type: v.union(
      v.literal("joined"),
      v.literal("checkin"),
      v.literal("transfer"),
      v.literal("bet_offered"),
      v.literal("bet_accepted"),
      v.literal("bet_settled"),
      v.literal("bet_void"),
    ),
    actorId: v.id("members"),
    targetId: v.optional(v.id("members")),
    amount: v.optional(v.number()),
    txId: v.optional(v.id("transactions")),
    betId: v.optional(v.id("bets")),
  }),

  /**
   * A directed challenge (ECONOMY.md §6). A = proposer, B = counterparty; the labels never swap.
   * offered → active → reported → (disputed →) settled | void, or offered → closed (no deal).
   */
  bets: defineTable({
    proposerId: v.id("members"),
    counterpartyId: v.id("members"),
    statement: v.string(),
    resolveBy: v.number(),
    requestKey: v.string(),
    status: v.union(
      v.literal("offered"),
      v.literal("active"),
      v.literal("reported"),
      v.literal("disputed"),
      v.literal("settled"),
      v.literal("void"),
      v.literal("closed"),
    ),
    offerCount: v.number(),
    /** Agreed stakes, set when an offer is accepted. */
    stakeA: v.optional(v.number()),
    stakeB: v.optional(v.number()),
    reportedBy: v.optional(v.id("members")),
    reportedOutcome: v.optional(betOutcome),
    reportedAt: v.optional(v.number()),
    juryClosesAt: v.optional(v.number()),
    outcome: v.optional(betOutcome),
    closedAt: v.optional(v.number()),
    voidReason: v.optional(v.string()),
  })
    .index("by_request", ["requestKey"])
    .index("by_proposer_status", ["proposerId", "status"])
    .index("by_counterparty_status", ["counterpartyId", "status"]),

  /** One set of terms in a bet's negotiation. At most one is OPEN per bet. */
  betOffers: defineTable({
    betId: v.id("bets"),
    seq: v.number(),
    makerId: v.id("members"),
    takerId: v.id("members"),
    stakeA: v.number(),
    stakeB: v.number(),
    status: v.union(
      v.literal("open"),
      v.literal("accepted"),
      v.literal("countered"),
      v.literal("declined"),
      v.literal("withdrawn"),
      v.literal("expired"),
      v.literal("cancelled"),
    ),
    expiresAt: v.number(),
  })
    .index("by_bet", ["betId", "seq"])
    .index("by_maker_status", ["makerId", "status"]),

  juryVotes: defineTable({
    betId: v.id("bets"),
    voterId: v.id("members"),
    choice: betOutcome,
  }).index("by_bet_voter", ["betId", "voterId"]),

  ledgerAudits: defineTable({
    ok: v.boolean(),
    accounts: v.number(),
    transactions: v.number(),
    violations: v.array(v.string()),
  }),
});
