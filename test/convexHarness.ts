// convex-test harness. Lives outside convex/ so the Convex bundler never treats it as a function module.

/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect } from "vitest";
import type { Id } from "../convex/_generated/dataModel";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { createMember } from "../convex/model/members";
import { postTransaction } from "../convex/ledger/post";
import { MINT_ACCOUNT, walletAccount } from "../shared/domain/ledger";

// Every function module, including _generated (convex-test locates the root through it).
const modules = import.meta.glob(["../convex/**/*.ts", "../convex/**/*.js", "!../convex/**/*.test.ts", "!../convex/**/*.d.ts"]);

export const ISSUER = "https://test-issuer.koinon.invalid";

export function identity(subject: string, email = `${subject}@test.invalid`) {
  return { issuer: ISSUER, subject, tokenIdentifier: `${ISSUER}|${subject}`, email, emailVerified: true, name: subject };
}

const newTest = () => convexTest(schema, modules);
export type TestConvex = ReturnType<typeof newTest>;

/** A configured group with the given members (each gets the genesis coin). */
export async function setupGroup(names: readonly string[], opts: { timezone?: string; seatCap?: number } = {}) {
  const t = newTest();
  const ids: Record<string, Id<"members">> = {};
  await t.run(async (ctx) => {
    await ctx.db.insert("groupConfig", { name: "Test", timezone: opts.timezone ?? "UTC", rolloverHour: 4, seatCap: opts.seatCap ?? 8 });
    for (const [i, name] of names.entries()) {
      const who = identity(name);
      ids[name] = await createMember(ctx, {
        tokenIdentifier: who.tokenIdentifier,
        email: who.email,
        displayName: name,
        avatar: "🙂",
        role: i === 0 ? "admin" : "member",
      });
    }
  });
  const as = (name: string) => t.withIdentity(identity(name));
  return { t, ids, as };
}

/** Extracts the app error code from a ConvexError rejection. */
export async function errorCode(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const data = (e as { data?: { code?: string } }).data;
    return data?.code ?? `UNEXPECTED: ${String(e)}`;
  }
  return "NO_ERROR";
}

/** Full ledger audit (I1–I5, I10) plus the supply identity against wallet balances. */
export async function expectLedgerSound(t: TestConvex): Promise<void> {
  const audit = await t.mutation(internal.ledger.audit.run, {});
  expect(audit.violations).toEqual([]);
  await t.run(async (ctx) => {
    const accounts = await ctx.db.query("accounts").collect();
    const minted = -(accounts.find((a) => a.key === "system:mint")?.balance ?? 0);
    const held = accounts.filter((a) => a.kind !== "mint" && a.kind !== "burn").reduce((s, a) => s + a.balance, 0);
    expect(held).toBe(minted);
  });
}

/** Test-only: mints coins to a member through the real ledger path (as an ADJUSTMENT). */
export async function grant(t: TestConvex, memberId: Id<"members">, amount: number): Promise<void> {
  await t.run((ctx) =>
    postTransaction(ctx, {
      kind: "ADJUSTMENT",
      idempotencyKey: `test-grant:${memberId}:${Math.random()}`,
      postings: [
        { account: MINT_ACCOUNT, delta: -amount },
        { account: walletAccount(memberId), delta: amount },
      ],
      groupDay: "2026-10-13",
    }),
  );
}
