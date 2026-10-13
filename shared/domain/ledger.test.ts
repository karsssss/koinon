import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  BURN_ACCOUNT,
  LedgerError,
  MINT_ACCOUNT,
  checkLedgerInvariants,
  transactionFingerprint,
  validateTransaction,
  walletAccount,
  type AccountId,
  type Posting,
  type TransactionSpec,
} from "./ledger.ts";

const A = walletAccount("a");
const B = walletAccount("b");
const empty = () => 0;

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof LedgerError ? e.code : "OTHER";
  }
  return undefined;
}

describe("validateTransaction", () => {
  it("accepts a balanced mint and returns new balances", () => {
    const next = validateTransaction({ kind: "CHECKIN", idempotencyKey: "k", postings: [{ account: MINT_ACCOUNT, delta: -10 }, { account: A, delta: 10 }] }, empty);
    expect(next.get(A)).toBe(10);
    expect(next.get(MINT_ACCOUNT)).toBe(-10);
  });

  it.each<[string, Posting[], string]>([
    ["unbalanced (I1)", [{ account: MINT_ACCOUNT, delta: -10 }, { account: A, delta: 9 }], "UNBALANCED"],
    ["fractional (I10)", [{ account: MINT_ACCOUNT, delta: -0.5 }, { account: A, delta: 0.5 }], "INVALID_DELTA"],
    ["zero delta", [{ account: MINT_ACCOUNT, delta: 0 }, { account: A, delta: 0 }], "INVALID_DELTA"],
    ["single posting", [{ account: A, delta: 1 }], "EMPTY"],
    ["duplicate account", [{ account: A, delta: -1 }, { account: A, delta: 1 }], "DUPLICATE_ACCOUNT"],
  ])("rejects %s", (_, postings, expected) => {
    expect(code(() => validateTransaction({ kind: "CHECKIN", idempotencyKey: "k", postings }, (a) => (a === A ? 5 : 0)))).toBe(expected);
  });

  it("rejects a wallet going negative (I4)", () => {
    expect(code(() => validateTransaction({ kind: "TRANSFER", idempotencyKey: "k", postings: [{ account: A, delta: -5 }, { account: B, delta: 5 }] }, (a) => (a === A ? 4 : 0)))).toBe("INSUFFICIENT_BALANCE");
  });

  it("only lets minting kinds touch the mint, and only outward", () => {
    expect(code(() => validateTransaction({ kind: "TRANSFER", idempotencyKey: "k", postings: [{ account: MINT_ACCOUNT, delta: -5 }, { account: A, delta: 5 }] }, empty))).toBe("FORBIDDEN_ACCOUNT");
    expect(code(() => validateTransaction({ kind: "CHECKIN", idempotencyKey: "k", postings: [{ account: A, delta: -5 }, { account: MINT_ACCOUNT, delta: 5 }] }, () => 5))).toBe("FORBIDDEN_ACCOUNT");
  });

  it("only lets burning kinds touch the burn account, and only inward", () => {
    expect(code(() => validateTransaction({ kind: "TRANSFER", idempotencyKey: "k", postings: [{ account: A, delta: -5 }, { account: BURN_ACCOUNT, delta: 5 }] }, () => 5))).toBe("FORBIDDEN_ACCOUNT");
    expect(validateTransaction({ kind: "PURCHASE", idempotencyKey: "k", postings: [{ account: A, delta: -5 }, { account: BURN_ACCOUNT, delta: 5 }] }, (a) => (a === A ? 5 : 0)).get(BURN_ACCOUNT)).toBe(5);
  });
});

describe("transactionFingerprint", () => {
  it("ignores posting order but not content", () => {
    const a: TransactionSpec = { kind: "TRANSFER", idempotencyKey: "k", postings: [{ account: A, delta: -1 }, { account: B, delta: 1 }] };
    const b: TransactionSpec = { ...a, postings: [...a.postings].reverse() };
    expect(transactionFingerprint(a)).toBe(transactionFingerprint(b));
    expect(transactionFingerprint({ ...a, postings: [{ account: A, delta: -2 }, { account: B, delta: 2 }] })).not.toBe(transactionFingerprint(a));
  });
});

describe("checkLedgerInvariants", () => {
  it("is clean for a consistent ledger and flags each kind of corruption", () => {
    const log: Posting[][] = [
      [{ account: MINT_ACCOUNT, delta: -10 }, { account: A, delta: 10 }],
      [{ account: A, delta: -3 }, { account: BURN_ACCOUNT, delta: 3 }],
    ];
    const balances = new Map<AccountId, number>([[MINT_ACCOUNT, -10], [A, 7], [BURN_ACCOUNT, 3]]);
    expect(checkLedgerInvariants({ balances, postingLog: log })).toEqual([]);

    const tampered = new Map(balances).set(A, 8);
    const v = checkLedgerInvariants({ balances: tampered, postingLog: log });
    expect(v.some((s) => s.startsWith("I2"))).toBe(true);
    expect(v.some((s) => s.startsWith("I3"))).toBe(true);
    expect(v.some((s) => s.startsWith("I5"))).toBe(true);
    expect(checkLedgerInvariants({ balances: new Map<AccountId, number>([[MINT_ACCOUNT, 1], [A, -1]]) }).some((s) => s.startsWith("I4"))).toBe(true);
  });

  it("property: any sequence of validated transactions preserves I1–I5", () => {
    const members = ["a", "b", "c"].map(walletAccount);
    const op = fc.oneof(
      fc.record({ type: fc.constant("mint" as const), to: fc.nat(2), amount: fc.integer({ min: 1, max: 50 }) }),
      fc.record({ type: fc.constant("transfer" as const), from: fc.nat(2), to: fc.nat(2), amount: fc.integer({ min: 1, max: 80 }) }),
      fc.record({ type: fc.constant("burn" as const), from: fc.nat(2), amount: fc.integer({ min: 1, max: 80 }) }),
    );
    fc.assert(
      fc.property(fc.array(op, { maxLength: 60 }), (ops) => {
        const balances = new Map<AccountId, number>();
        const log: Posting[][] = [];
        ops.forEach((o, i) => {
          const get = (acc: AccountId) => balances.get(acc) ?? 0;
          const pick = (k: number) => members[k] ?? A;
          let spec: TransactionSpec;
          if (o.type === "mint") spec = { kind: "CHECKIN", idempotencyKey: `${i}`, postings: [{ account: MINT_ACCOUNT, delta: -o.amount }, { account: pick(o.to), delta: o.amount }] };
          else if (o.type === "burn") spec = { kind: "PURCHASE", idempotencyKey: `${i}`, postings: [{ account: pick(o.from), delta: -o.amount }, { account: BURN_ACCOUNT, delta: o.amount }] };
          else spec = { kind: "TRANSFER", idempotencyKey: `${i}`, postings: [{ account: pick(o.from), delta: -o.amount }, { account: pick(o.to), delta: o.amount }] };
          try {
            const next = validateTransaction(spec, get);
            for (const [acc, bal] of next) balances.set(acc, bal);
            log.push([...spec.postings]);
          } catch (e) {
            // Rejected transactions must leave no trace; only expected rejections are allowed.
            expect(e).toBeInstanceOf(LedgerError);
          }
        });
        expect(checkLedgerInvariants({ balances, postingLog: log })).toEqual([]);
      }),
      { seed: 42, numRuns: 300 },
    );
  });
});
