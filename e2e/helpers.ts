import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { execSync } from "node:child_process";

/** Wipes and reseeds the demo data on the local deployment (DEMO_MODE only). */
export function resetDemoData(): void {
  let output: string;
  try {
    output = execSync("npx convex run demo:reset", { encoding: "utf8" });
  } catch (e) {
    // Windows: the CLI may abort with a libuv assertion after the function has completed.
    output = String((e as { stdout?: unknown }).stdout ?? "");
  }
  if (!output.includes('"created": 8')) throw new Error(`demo reset failed: ${output}`);
}

export function runAudit(): { ok: boolean; violations: string[] } {
  let output: string;
  try {
    output = execSync("npx convex run ledger/audit:run", { encoding: "utf8" });
  } catch (e) {
    output = String((e as { stdout?: unknown }).stdout ?? "");
  }
  const json = output.slice(output.indexOf("{"), output.lastIndexOf("}") + 1);
  return JSON.parse(json) as { ok: boolean; violations: string[] };
}

export async function signInAs(page: Page, name: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("list", { name: "Demo profiles" }).getByRole("button", { name: new RegExp(`^.*${name}`) }).click();
  await expect(page.getByTestId("current-member")).toHaveText(name);
}

export async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

/** Balance text inside a container, as a number ("1,234" → 1234). */
export async function balanceIn(page: Page, testId: string): Promise<number> {
  const text = (await page.getByTestId(testId).locator("[aria-hidden=true]").first().textContent()) ?? "";
  return Number(text.replace(/[^\d]/g, ""));
}
