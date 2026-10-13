// In-memory append-only ledger for the simulator. Every write goes through the shared domain
// validator, so each modelled transaction is checked for conservation (I1) and bounds (I4).

import {
  LedgerError,
  checkLedgerInvariants,
  transactionFingerprint,
  validateTransaction,
  type AccountId,
  type Posting,
  type TransactionSpec,
  type TxKind,
} from "../shared/domain/ledger.ts";

export class SimLedger {
  private readonly balances = new Map<AccountId, number>();
  private readonly log: (readonly Posting[])[] = [];
  private readonly keys = new Map<string, { fingerprint: string; index: number }>();
  readonly countByKind = new Map<TxKind, number>();
  postingsChecked = 0;
  invariantChecks = 0;

  balance(account: AccountId): number {
    return this.balances.get(account) ?? 0;
  }

  get transactionCount(): number {
    return this.log.length;
  }

  /** Applies a transaction atomically. Replaying the same key with the same payload is a no-op. */
  post(spec: TransactionSpec): { replayed: boolean } {
    const fingerprint = transactionFingerprint(spec);
    const seen = this.keys.get(spec.idempotencyKey);
    if (seen) {
      if (seen.fingerprint !== fingerprint) throw new LedgerError("IDEMPOTENCY_CONFLICT", spec.idempotencyKey);
      return { replayed: true };
    }
    const next = validateTransaction(spec, (a) => this.balance(a));
    for (const [account, balance] of next) this.balances.set(account, balance);
    this.log.push(spec.postings);
    this.keys.set(spec.idempotencyKey, { fingerprint, index: this.log.length - 1 });
    this.countByKind.set(spec.kind, (this.countByKind.get(spec.kind) ?? 0) + 1);
    this.postingsChecked += spec.postings.length;
    return { replayed: false };
  }

  /** Throws if any invariant is violated. `full` also recomputes every balance from the log (I5). */
  assertInvariants(full: boolean): void {
    this.invariantChecks++;
    const violations = checkLedgerInvariants(full ? { balances: this.balances, postingLog: this.log } : { balances: this.balances });
    if (violations.length > 0) throw new Error(`Ledger invariant violation:\n${violations.join("\n")}`);
  }

  /** Exposed for tests that deliberately corrupt the cache. */
  corruptBalanceForTest(account: AccountId, value: number): void {
    this.balances.set(account, value);
  }
}
