// Double-entry ledger rules (ECONOMY.md §3, §4, §8). Pure: no storage, no clock.

import { MAX_POSTING_AMOUNT } from "./money.ts";

export type AccountId =
  | `wallet:${string}`
  | "system:mint"
  | "system:burn"
  | `escrow:${string}`
  | `pool:${string}`;

export type AccountKind = "wallet" | "mint" | "burn" | "escrow" | "pool";

export const MINT_ACCOUNT = "system:mint" satisfies AccountId;
export const BURN_ACCOUNT = "system:burn" satisfies AccountId;

export function walletAccount(memberId: string): AccountId {
  return `wallet:${memberId}`;
}

export function betEscrowAccount(betId: string): AccountId {
  return `escrow:bet:${betId}`;
}

export function accountKind(id: AccountId): AccountKind {
  if (id === MINT_ACCOUNT) return "mint";
  if (id === BURN_ACCOUNT) return "burn";
  if (id.startsWith("wallet:")) return "wallet";
  if (id.startsWith("escrow:")) return "escrow";
  return "pool";
}

/** I4 and the mint/burn sign conventions. */
export function balanceAllowed(kind: AccountKind, balance: number): boolean {
  return kind === "mint" ? balance <= 0 : balance >= 0;
}

/**
 * MVP kinds plus PURCHASE, the post-MVP sink (wallet → burn) that ECONOMY.md §4 reserves.
 * The simulator models PURCHASE so that sink scenarios can be compared.
 */
export type TxKind =
  | "GENESIS"
  | "CHECKIN"
  | "DIGEST"
  | "TRANSFER"
  | "BET_ESCROW"
  | "BET_REFUND"
  | "BET_PAYOUT"
  | "SEASON_REWARD"
  | "PURCHASE"
  | "ADJUSTMENT";

const MINTING_KINDS: ReadonlySet<TxKind> = new Set(["GENESIS", "CHECKIN", "DIGEST", "SEASON_REWARD", "ADJUSTMENT"]);
// BET_PAYOUT may burn a rake (OD-7). The MVP default rake is 0.
const BURNING_KINDS: ReadonlySet<TxKind> = new Set(["PURCHASE", "BET_PAYOUT", "ADJUSTMENT"]);

export interface Posting {
  readonly account: AccountId;
  readonly delta: number;
}

export interface TransactionSpec {
  readonly kind: TxKind;
  readonly idempotencyKey: string;
  readonly postings: readonly Posting[];
}

export type LedgerErrorCode =
  | "EMPTY"
  | "INVALID_DELTA"
  | "DUPLICATE_ACCOUNT"
  | "UNBALANCED"
  | "FORBIDDEN_ACCOUNT"
  | "INSUFFICIENT_BALANCE"
  | "IDEMPOTENCY_CONFLICT";

export class LedgerError extends Error {
  readonly code: LedgerErrorCode;
  constructor(code: LedgerErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "LedgerError";
    this.code = code;
  }
}

/**
 * Validates a transaction against the current balances and returns the new balances of the
 * accounts it touches. Throws LedgerError and never partially applies anything.
 * Enforces I1 (balanced), I4 (bounds), I10 (integers) and the mint/burn direction rules.
 */
export function validateTransaction(
  spec: TransactionSpec,
  getBalance: (account: AccountId) => number,
): Map<AccountId, number> {
  if (spec.postings.length < 2) throw new LedgerError("EMPTY", `${spec.kind} needs at least 2 postings`);
  const next = new Map<AccountId, number>();
  let sum = 0;
  for (const { account, delta } of spec.postings) {
    if (!Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > MAX_POSTING_AMOUNT) {
      throw new LedgerError("INVALID_DELTA", `${account} delta ${delta}`);
    }
    if (next.has(account)) throw new LedgerError("DUPLICATE_ACCOUNT", account);
    const kind = accountKind(account);
    if (kind === "mint" && (!MINTING_KINDS.has(spec.kind) || (delta > 0 && spec.kind !== "ADJUSTMENT"))) {
      throw new LedgerError("FORBIDDEN_ACCOUNT", `${spec.kind} cannot post ${delta} to ${account}`);
    }
    if (kind === "burn" && (!BURNING_KINDS.has(spec.kind) || (delta < 0 && spec.kind !== "ADJUSTMENT"))) {
      throw new LedgerError("FORBIDDEN_ACCOUNT", `${spec.kind} cannot post ${delta} to ${account}`);
    }
    const after = getBalance(account) + delta;
    if (!balanceAllowed(kind, after)) {
      throw new LedgerError("INSUFFICIENT_BALANCE", `${account} would become ${after}`);
    }
    next.set(account, after);
    sum += delta;
  }
  if (sum !== 0) throw new LedgerError("UNBALANCED", `${spec.kind} postings sum to ${sum}`);
  return next;
}

/** Canonical payload string used to detect idempotency-key reuse with different content. */
export function transactionFingerprint(spec: TransactionSpec): string {
  const postings = [...spec.postings]
    .map((p) => `${p.account}=${p.delta}`)
    .sort()
    .join(",");
  return `${spec.kind}|${postings}`;
}

export interface InvariantInput {
  readonly balances: ReadonlyMap<AccountId, number>;
  /** When present, enables I1 per transaction and I5 (cached balance = Σ postings). */
  readonly postingLog?: readonly (readonly Posting[])[];
}

/** Returns human-readable violations of I1–I5 and I10. An empty array means the ledger is sound. */
export function checkLedgerInvariants(input: InvariantInput): string[] {
  const violations: string[] = [];
  let total = 0;
  let minted = 0;
  let burned = 0;
  let held = 0;
  for (const [account, balance] of input.balances) {
    if (!Number.isSafeInteger(balance)) violations.push(`I10 ${account} balance ${balance} is not an integer`);
    const kind = accountKind(account);
    if (!balanceAllowed(kind, balance)) violations.push(`I4 ${account} balance ${balance} out of range`);
    total += balance;
    if (kind === "mint") minted = -balance;
    else if (kind === "burn") burned = balance;
    else held += balance;
  }
  if (total !== 0) violations.push(`I2 sum of all balances is ${total}`);
  if (minted - burned !== held) violations.push(`I3 minted ${minted} - burned ${burned} != held ${held}`);

  if (input.postingLog) {
    const recomputed = new Map<AccountId, number>();
    input.postingLog.forEach((postings, i) => {
      let sum = 0;
      for (const { account, delta } of postings) {
        sum += delta;
        recomputed.set(account, (recomputed.get(account) ?? 0) + delta);
      }
      if (sum !== 0) violations.push(`I1 transaction #${i} sums to ${sum}`);
    });
    const accounts = new Set([...input.balances.keys(), ...recomputed.keys()]);
    for (const account of accounts) {
      const cached = input.balances.get(account) ?? 0;
      const fromLog = recomputed.get(account) ?? 0;
      if (cached !== fromLog) violations.push(`I5 ${account} cached ${cached} != postings ${fromLog}`);
    }
  }
  return violations;
}
