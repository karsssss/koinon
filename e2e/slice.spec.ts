import { expect, test } from "@playwright/test";
import { balanceIn, expectNoAxeViolations, resetDemoData, runAudit, signInAs } from "./helpers";

test.beforeEach(() => resetDemoData());

test("sign in, daily check-in once, see balance, feed and history", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByRole("list", { name: "Demo profiles" }).getByRole("button")).toHaveCount(8);
  await expectNoAxeViolations(page);
  await page.screenshot({ path: info.outputPath("signin.png"), fullPage: true });

  await signInAs(page, "Bo");
  await expect.poll(() => balanceIn(page, "home-balance")).toBe(1);

  await page.getByRole("button", { name: "Check in · +10" }).click();
  await expect(page.getByText("Checked in. +10 coins.")).toBeVisible();
  await expect.poll(() => balanceIn(page, "home-balance")).toBe(11);
  await expect(page.getByRole("button", { name: "Checked in ✓" })).toBeDisabled();
  await expect(page.getByTestId("activity-feed")).toContainText("Bo checked in");
  await expectNoAxeViolations(page);
  await page.screenshot({ path: info.outputPath("home.png"), fullPage: true });

  // The claim is server state: it survives a reload and cannot be repeated.
  await page.reload();
  await expect(page.getByRole("button", { name: "Checked in ✓" })).toBeDisabled();

  await page.getByRole("link", { name: "Wallet" }).first().click();
  await expect.poll(() => balanceIn(page, "wallet-balance")).toBe(11);
  const history = page.getByTestId("wallet-history").getByRole("listitem");
  await expect(history).toHaveCount(2);
  await expect(history.nth(0)).toContainText("Daily check-in");
  await expect(history.nth(0)).toContainText("plus 10 coins");
  await expect(history.nth(1)).toContainText("Welcome coin");
  await expectNoAxeViolations(page);
  await page.screenshot({ path: info.outputPath("wallet.png"), fullPage: true });
});

test("two members see each other's balance changes live", async ({ browser }, info) => {
  const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor, baseURL } = info.project.use;
  const options = { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor, baseURL };
  const ada = await (await browser.newContext(options)).newPage();
  const bo = await (await browser.newContext(options)).newPage();
  await signInAs(ada, "Ada");
  await signInAs(bo, "Bo");

  // Ada checks in; Bo's group list updates without a reload.
  await ada.getByRole("button", { name: "Check in · +10" }).click();
  await expect(bo.getByTestId("group-balances").locator('[data-member="Ada"]')).toContainText("11");
  await expect(bo.getByTestId("activity-feed")).toContainText("Ada checked in");

  // Ada sends 5 to Bo with a note.
  await ada.getByRole("link", { name: "Wallet" }).first().click();
  await ada.getByRole("button", { name: "Send coins" }).click();
  const dialog = ada.getByRole("dialog", { name: "Send coins" });
  await dialog.getByLabel("To").selectOption({ label: "🐙 Bo" });
  await dialog.getByLabel("Amount").fill("5");
  await dialog.getByLabel("Note (optional)").fill("for lunch");
  await expect(dialog.getByText("Balance after:")).toContainText("6");
  await expectNoAxeViolations(ada);
  await ada.screenshot({ path: info.outputPath("transfer-dialog.png") });
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog).toBeHidden();

  await expect.poll(() => balanceIn(ada, "wallet-balance")).toBe(6);
  await expect(ada.getByTestId("wallet-history").getByRole("listitem").first()).toContainText("Sent to Bo");
  await expect.poll(() => balanceIn(bo, "home-balance")).toBe(6);
  await expect(bo.getByTestId("activity-feed")).toContainText("Ada sent coins to Bo");

  await bo.getByRole("link", { name: "Wallet" }).first().click();
  const top = bo.getByTestId("wallet-history").getByRole("listitem").first();
  await expect(top).toContainText("Received from Ada");
  await expect(top).toContainText("for lunch");
  await bo.screenshot({ path: info.outputPath("receiver-wallet.png"), fullPage: true });

  expect(runAudit()).toMatchObject({ ok: true, violations: [] });
});

test("cannot send more than the balance", async ({ page }) => {
  await signInAs(page, "Cy");
  await page.getByRole("link", { name: "Wallet" }).first().click();
  await page.getByRole("button", { name: "Send coins" }).click();
  const dialog = page.getByRole("dialog", { name: "Send coins" });
  await dialog.getByLabel("To").selectOption({ label: "🦊 Ada" });
  await dialog.getByLabel("Amount").fill("5");
  await expect(dialog.getByRole("alert")).toHaveText("That's more than your balance.");
  await expect(dialog.getByRole("button", { name: "Send" })).toBeDisabled();
});
