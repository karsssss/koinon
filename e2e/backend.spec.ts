// Runs against the REAL local Convex backend (real OCC), not the convex-test mock.
import { expect, test } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { readFileSync } from "node:fs";
import { api } from "../convex/_generated/api";
import { resetDemoData, runAudit } from "./helpers";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

async function clientFor(subject: string | null): Promise<ConvexHttpClient> {
  const client = new ConvexHttpClient(env.VITE_CONVEX_URL!);
  if (subject) {
    const res = await fetch(`${env.VITE_CONVEX_SITE_URL}/demo-auth/token`, { method: "POST", body: JSON.stringify({ subject }) });
    client.setAuth(((await res.json()) as { token: string }).token);
  }
  return client;
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "OK";
  } catch (e) {
    return String((e as { data?: { code?: string } }).data?.code ?? e);
  }
}

test.describe("backend (real deployment)", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "API tests run once, not per viewport");
    resetDemoData();
  });

  test("rejects unauthenticated and forged callers", async () => {
    const anon = await clientFor(null);
    expect(await code(anon.query(api.wallet.summary, {}))).toBe("UNAUTHENTICATED");
    expect(await code(anon.mutation(api.daily.checkIn, {}))).toBe("UNAUTHENTICATED");
    const forged = await clientFor(null);
    forged.setAuth("eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJkZW1vLTEifQ.invalid");
    expect(await code(forged.query(api.wallet.summary, {}))).not.toBe("OK");
  });

  test("concurrent check-ins mint once; concurrent transfers never overdraw; duplicates apply once", async () => {
    const fen = await clientFor("demo-6");
    const gus = await clientFor("demo-7");
    const members = await fen.query(api.members.list, {});
    const gusId = members.find((m) => m.displayName === "Gus")!._id;

    const claims = await Promise.all(Array.from({ length: 5 }, () => fen.mutation(api.daily.checkIn, {})));
    expect(claims.filter((c) => c.status === "claimed")).toHaveLength(1);
    expect((await fen.query(api.wallet.summary, {})).balance).toBe(11);

    const races = await Promise.all(
      Array.from({ length: 5 }, (_, i) => code(fen.mutation(api.wallet.transfer, { toMemberId: gusId, amount: 5, requestId: `e2e-race-${i}-000` }))),
    );
    expect(races.filter((r) => r === "OK")).toHaveLength(2);
    expect(races.filter((r) => r === "INSUFFICIENT_FUNDS")).toHaveLength(3);

    const dup = { toMemberId: gusId, amount: 1, requestId: "e2e-dup-000001" };
    const dups = await Promise.all(Array.from({ length: 4 }, () => fen.mutation(api.wallet.transfer, dup)));
    expect(new Set(dups.map((d) => d.txId)).size).toBe(1);
    expect(dups.filter((d) => !d.replayed)).toHaveLength(1);

    expect((await fen.query(api.wallet.summary, {})).balance).toBe(0);
    expect((await gus.query(api.wallet.summary, {})).balance).toBe(12);
    expect(runAudit()).toMatchObject({ ok: true, violations: [] });
  });
});
