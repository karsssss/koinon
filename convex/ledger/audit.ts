import { checkLedgerInvariants, type AccountId, type Posting } from "../../shared/domain/ledger";
import { internalMutation } from "../_generated/server";

/**
 * Full ledger audit (ECONOMY.md §8): recomputes every balance from postings (I5) and checks
 * I1–I4 and I10. Records the result; never auto-corrects. Fine at this group's scale; switch to
 * a paginated audit once the ledger approaches Convex's per-function read limits.
 */
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const accounts = await ctx.db.query("accounts").collect();
    const balances = new Map<AccountId, number>(accounts.map((a) => [a.key as AccountId, a.balance]));
    const byTx = new Map<string, Posting[]>();
    for (const p of await ctx.db.query("postings").collect()) {
      const list = byTx.get(p.txId) ?? [];
      list.push({ account: p.accountKey as AccountId, delta: p.delta });
      byTx.set(p.txId, list);
    }
    const violations = checkLedgerInvariants({ balances, postingLog: [...byTx.values()] });
    const result = { ok: violations.length === 0, accounts: accounts.length, transactions: byTx.size, violations };
    await ctx.db.insert("ledgerAudits", result);
    if (!result.ok) console.error("Ledger audit failed", violations);
    return result;
  },
});
