// Coin amounts are positive safe integers (ECONOMY.md §2). No fractions anywhere.

export const MAX_POSTING_AMOUNT = 1_000_000;

/** Basis points: 10_000 bps = 100%. Used for every fractional rule so amounts stay integer. */
export const BPS = 10_000;

export function isCoinAmount(n: number): boolean {
  return Number.isSafeInteger(n) && n >= 1 && n <= MAX_POSTING_AMOUNT;
}

/** floor(amount × bps / 10_000) using integer arithmetic only. */
export function applyBps(amount: number, bps: number): number {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError(`amount must be a non-negative integer, got ${amount}`);
  if (!Number.isSafeInteger(bps) || bps < 0) throw new RangeError(`bps must be a non-negative integer, got ${bps}`);
  return Math.floor((amount * bps) / BPS);
}
