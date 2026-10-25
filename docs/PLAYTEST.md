# PLAYTEST — online preview and the two-player verification gate

The preview is a static SPA on Vercel that talks to the **Convex cloud dev deployment** (`limitless-marten-493`, `DEMO_MODE=false`) and the **Clerk development instance**. Vercel never deploys the backend, and no production or demo backend is reachable from it.

## 1. One-time setup (owner, dashboards)

### Clerk (development instance)
1. **Configure → Restrictions → Sign-up mode: Restricted.** Strangers can then not create Clerk accounts. Convex refuses non-invited emails anyway.
2. **Users → Invitations → Invite** the second tester's email.
3. Confirm **Sessions → Customize session token** still has `email` and `email_verified` (README).

Development keys (`pk_test_…`) are Clerk's documented choice for `*.vercel.app` preview domains. No domain or allowed-origin setup is needed. Dev instances cap at 100 users and show a "Development mode" badge, which is fine for the alpha.

### Convex (cloud dev)
Invite the tester (it must be the same email as the Clerk invitation):
```sh
npx convex run setup:invite '{"invites":[{"email":"friend@example.com","displayName":"Friend"}]}' --env-file .env.clerk.local
```

### Vercel (Hobby)
1. **Add New → Project → Import** `karsssss/koinon`. Framework: Vite. Leave the build settings as they are, because `vercel.json` sets them. Add **no** env vars on this screen, then click **Deploy**.
   This first build is a *production* build of `main`. It has no env vars, so it renders nothing and reaches no backend. You can delete it under **Deployments**. Once this PR is merged, `vercel.json` stops production builds from `main`.
2. **Settings → Environment Variables.** Add each variable with **only "Preview"** ticked:

   | Key | Value |
   |---|---|
   | `VITE_CONVEX_URL` | the `VITE_CONVEX_URL` value from `.env.clerk.local` (`https://limitless-marten-493.….convex.cloud`) |
   | `VITE_CLERK_PUBLISHABLE_KEY` | the `pk_test_…` key from `.env.local` |
   | `VITE_AUTH_MODE` | `clerk` |

   Never add `CONVEX_DEPLOY_KEY`, any `sk_…` key, or `VITE_AUTH_MODE=demo` to Vercel.
3. **Deployments →** the `chore/clerk-cloud-dev-preview` preview **→ ⋯ → Redeploy**, so that it picks up the variables.
4. **Settings → Deployment Protection:** keep **Vercel Authentication** with **Standard Protection**. That is the default, and it hides previews from everyone but you. Then, on the preview deployment, choose **Share → "Anyone with the link"** and send that link to the tester. Hobby allows one shareable link per account.
   - The link sets a cookie in the tester's *browser*. An **installed** iOS PWA has its own cookie jar and will hit the Vercel login. Play in the browser for this playtest.
   - If you need installed-PWA testing, set protection to **Disabled** for previews. The real gate is server-side either way: restricted Clerk sign-up, invite-only Convex membership, and `memberQuery`/`memberMutation` on every function. The SPA shell only exposes public values (a `pk_test_` key and the Convex URL).

## 2. Verification gate

**A** is automated and must already be green. **M** is manual on the preview, with two real people (P1 is the owner/admin, P2 is the tester), each on their own device.

| # | Check | A (already covered) | M (on the preview) |
|---|---|---|---|
| 1 | Sign-in and membership | `authz.test`, `setup.test` (invite-only, seat cap, structural auth guard); E2E rejects forged callers | P2 opens the link, signs in with an email code, and lands on Home as a member. P2's name appears in group balances for P1. |
| 2 | Wallet and check-in | `wallet.test`; E2E check-in once; concurrent check-ins mint once | P2 starts at 0 and checks in to get **10**. A second tap is refused/disabled. Reloading keeps 10. |
| 3 | Transfers | `wallet.test`; E2E overdraft guard; concurrent transfers never overdraw; duplicates apply once | P1 sends P2 **5**, and both balances update. P2 tries to send more than they hold, and it is refused. |
| 4 | Challenges | `bets.test` (17); E2E loop: offer → counter → accept → report → confirm; decline; races | (a) P1 challenges P2 (stakes 3 v 3). P2 **counters** 4 v 3, P1 **accepts**, and both see the stake locked. P1 **reports** the outcome, P2 **confirms**, and the pot moves. (b) P1 offers, and nobody responds for **>5 min**: the offer expires and the stake returns. (c) P2 offers and P1 **declines**: the stake returns. The 48 h auto-confirm and jury are covered by tests only. |
| 5 | Realtime and conservation | E2E two-user live sync; `assertLedgerInvariants` in every backend test | Each step in 2–4 shows on the other device **without a reload**. Afterwards: `npx convex run ledger/audit:run --env-file .env.clerk.local` → `ok: true`, `violations: []`. |
| 6 | Mobile and desktop | E2E at 360px and 1280px, axe clean | P2 on a phone (iOS Safari or Android Chrome), P1 on a desktop. Tabs, sheets and countdowns are usable; no horizontal scroll. |
| 7 | Unauthorized access and isolation | E2E forged and unauthenticated callers rejected; `demo:reset` refuses real members | (a) A private window without the share link hits the Vercel login. (b) A non-invited email can't sign up (Clerk restricted) or join (Convex). (c) `curl -s -o /dev/null -w "%{http_code}" https://limitless-marten-493.convex.site/demo-auth/token` → **404**. (d) In DevTools → Network, the only Convex host is `limitless-marten-493`, not `hardy-blackbird-373` or `127.0.0.1`. (e) The production deployment `hardy-blackbird-373` still has no functions and no data. |

**Pass** means every M row passes and the audit returns `ok`. Record the date, devices and any issue in `CURRENT.md`.
