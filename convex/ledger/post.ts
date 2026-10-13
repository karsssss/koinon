// THE ONLY WRITE PATH for accounts, transactions and postings (CLAUDE.md, ECONOMY.md §4).
// Runs inside the caller's mutation, so the whole thing is one serializable transaction.

import {
  LedgerError,
  accountKind,
  transactionFingerprint,
  validateTransaction,
  type AccountId,
  type Posting,
  type TxKind,
} from "../../shared/domain/ledger";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { appError } from "../lib/auth";

export interface PostSpec {
  readonly kind: TxKind;
  readonly idempotencyKey: string;
  readonly postings: readonly Posting[];
  readonly groupDay: string;
  readonly actorId?: Id<"members">;
  readonly fromMemberId?: Id<"members">;
  readonly toMemberId?: Id<"members">;
  readonly memo?: string;
}

export async function postTransaction(ctx: MutationCtx, spec: PostSpec): Promise<{ txId: Id<"transactions">; replayed: boolean }> {
  const fingerprint = transactionFingerprint(spec);
  const existing = await ctx.db
    .query("transactions")
    .withIndex("by_key", (q) => q.eq("idempotencyKey", spec.idempotencyKey))
    .unique();
  if (existing !== null) {
    if (existing.fingerprint !== fingerprint) {
      throw appError("IDEMPOTENCY_CONFLICT", "This request ID was already used for a different request.");
    }
    return { txId: existing._id, replayed: true };
  }

  const accounts = new Map<AccountId, Doc<"accounts"> | null>();
  for (const { account } of spec.postings) {
    accounts.set(account, await ctx.db.query("accounts").withIndex("by_key", (q) => q.eq("key", account)).unique());
  }

  let next: Map<AccountId, number>;
  try {
    next = validateTransaction(spec, (a) => accounts.get(a)?.balance ?? 0);
  } catch (e) {
    if (e instanceof LedgerError && e.code === "INSUFFICIENT_BALANCE") throw appError("INSUFFICIENT_FUNDS", "Not enough coins.");
    if (e instanceof LedgerError) throw appError("INVALID_ARGUMENT", e.message);
    throw e;
  }

  for (const [key, balance] of next) {
    const doc = accounts.get(key);
    if (doc) {
      await ctx.db.patch(doc._id, { balance });
    } else {
      // Wallets are created when a member is activated; system and escrow accounts appear on first use.
      if (accountKind(key) === "wallet") throw appError("INVALID_ARGUMENT", `Unknown wallet ${key}`);
      await ctx.db.insert("accounts", { key, kind: accountKind(key), balance });
    }
  }

  const txId = await ctx.db.insert("transactions", {
    kind: spec.kind,
    idempotencyKey: spec.idempotencyKey,
    fingerprint,
    groupDay: spec.groupDay,
    ...(spec.actorId && { actorId: spec.actorId }),
    ...(spec.fromMemberId && { fromMemberId: spec.fromMemberId }),
    ...(spec.toMemberId && { toMemberId: spec.toMemberId }),
    ...(spec.memo && { memo: spec.memo }),
  });
  for (const { account, delta } of spec.postings) {
    await ctx.db.insert("postings", { txId, accountKey: account, delta });
  }
  return { txId, replayed: false };
}

/** Creates a member's wallet account at zero. Called once, on activation. */
export async function openWallet(ctx: MutationCtx, memberId: Id<"members">, key: AccountId): Promise<void> {
  const existing = await ctx.db.query("accounts").withIndex("by_key", (q) => q.eq("key", key)).unique();
  if (existing === null) await ctx.db.insert("accounts", { key, kind: "wallet", memberId, balance: 0 });
}
