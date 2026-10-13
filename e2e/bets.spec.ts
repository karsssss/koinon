import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { balanceIn, expectNoAxeViolations, resetDemoData, runAudit, signInAs } from "./helpers";

test.beforeEach(() => resetDemoData());

async function member(browser: Browser, info: TestInfo, name: string): Promise<Page> {
  const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor, baseURL } = info.project.use;
  const page = await (await browser.newContext({ viewport, isMobile, hasTouch, userAgent, deviceScaleFactor, baseURL })).newPage();
  await signInAs(page, name);
  await page.getByRole("button", { name: "Check in · +10" }).click(); // 11 coins each
  await expect.poll(() => balanceIn(page, "home-balance")).toBe(11);
  return page;
}

test("challenge, live counter-offer, accept, report and confirm settle the pot", async ({ browser }, info) => {
  const ada = await member(browser, info, "Ada");
  const bo = await member(browser, info, "Bo");

  // Ada challenges Bo: 5 vs 3.
  await ada.getByRole("link", { name: "Bets" }).first().click();
  await ada.getByRole("button", { name: "New challenge" }).click();
  const form = ada.getByRole("dialog", { name: "New challenge" });
  await form.getByLabel("Challenge").selectOption({ label: "🐙 Bo" });
  await form.getByLabel("I bet that…").fill("it rains on Saturday");
  await form.getByLabel("My stake").fill("5");
  await form.getByLabel("Their stake").fill("3");
  await expect(form.getByText("Win: +")).toContainText("Pot 8");
  await expectNoAxeViolations(ada);
  await ada.screenshot({ path: info.outputPath("new-challenge.png") });
  await form.getByRole("button", { name: "Send challenge" }).click();
  await expect(ada.getByRole("heading", { name: "it rains on Saturday" })).toBeVisible();
  await expect(ada.getByTestId("bet-status")).toContainText("Offer expires in");

  // Bo sees it on Home without reloading, with the countdown, and counters 5:4.
  const needsYou = bo.getByTestId("needs-you");
  await expect(needsYou).toContainText("it rains on Saturday");
  await expect(needsYou).toContainText(/[0-4]:\d\d/);
  await needsYou.getByRole("link").first().click();
  await expect(bo.getByRole("button", { name: "Accept" })).toBeVisible();
  await expectNoAxeViolations(bo);
  await bo.screenshot({ path: info.outputPath("offer-received.png"), fullPage: true });
  await bo.getByRole("button", { name: "Counter" }).click();
  await bo.getByLabel("My stake").fill("4");
  await bo.getByRole("button", { name: "Send counter-offer" }).click();
  await expect(bo.getByRole("button", { name: "Withdraw" })).toBeVisible();

  // Ada now has the counter-offer to answer, live, and accepts.
  await expect(ada.getByRole("button", { name: "Accept" })).toBeVisible();
  // textContent joins the visible digits and the screen-reader text ("5" + "5 coins"); assert on the spoken part.
  await expect(ada.getByText("You stake")).toContainText("5 coins to win 4");
  await ada.getByRole("button", { name: "Accept" }).click();
  await expect(ada.getByTestId("bet-status")).toContainText("Live.");
  await expect(bo.getByTestId("bet-status")).toContainText("Live.");

  // Escrow shows on the wallet.
  await ada.getByRole("link", { name: "Wallet" }).first().click();
  await expect.poll(() => balanceIn(ada, "wallet-balance")).toBe(6);
  await expect(ada.getByTestId("wallet-escrowed")).toContainText("5");
  await ada.goBack();

  // Ada reports her win; Bo confirms; the 9-coin pot pays out.
  await ada.getByRole("button", { name: "Ada wins" }).click();
  await expect(bo.getByText("Reported result:")).toContainText("Ada wins");
  await bo.getByRole("button", { name: "Confirm" }).click();
  await expect(bo.getByTestId("bet-status")).toContainText("Ada wins the pot of");
  await expect(ada.getByTestId("bet-status")).toContainText("Ada wins the pot of");
  await bo.screenshot({ path: info.outputPath("settled.png"), fullPage: true });

  await ada.getByRole("link", { name: "Home" }).first().click();
  await expect.poll(() => balanceIn(ada, "home-balance")).toBe(15);
  await expect(ada.getByTestId("activity-feed")).toContainText("Ada won against Bo");
  await bo.getByRole("link", { name: "Wallet" }).first().click();
  await expect.poll(() => balanceIn(bo, "wallet-balance")).toBe(7);
  await expect(bo.getByTestId("wallet-history").getByRole("listitem").first()).toContainText("Stake locked");
  await bo.getByRole("link", { name: "Bets" }).first().click();
  await expectNoAxeViolations(bo);
  await bo.screenshot({ path: info.outputPath("bets-list.png"), fullPage: true });

  expect(runAudit()).toMatchObject({ ok: true, violations: [] });
});

test("declining returns the stake and closes the challenge", async ({ browser }, info) => {
  const cy = await member(browser, info, "Cy");
  const dee = await member(browser, info, "Dee");
  await cy.getByRole("link", { name: "Bets" }).first().click();
  await cy.getByRole("button", { name: "New challenge" }).click();
  const form = cy.getByRole("dialog", { name: "New challenge" });
  await form.getByLabel("Challenge").selectOption({ label: "🐢 Dee" });
  await form.getByLabel("I bet that…").fill("the train is late");
  await form.getByLabel("My stake").fill("20");
  await form.getByLabel("Their stake").fill("2");
  await expect(form.getByRole("alert")).toHaveText("That's more than your balance.");
  await form.getByLabel("My stake").fill("10");
  await form.getByRole("button", { name: "Send challenge" }).click();
  await expect(cy.getByTestId("bet-status")).toContainText("Offer expires in");

  await dee.getByTestId("needs-you").getByRole("link").first().click();
  await dee.getByRole("button", { name: "Decline" }).click();
  await expect(cy.getByTestId("bet-status")).toContainText("No deal (declined)");
  await cy.getByRole("link", { name: "Home" }).first().click();
  await expect.poll(() => balanceIn(cy, "home-balance")).toBe(11);
});
