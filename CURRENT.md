# CURRENT

Updated: 2026-10-13 · Branch `feat/economy-simulator` · Phase: **Challenges (P2P bets) implemented and tested locally**

## Done
- Planning docs (`docs/`), plus the economy simulator (P3, [docs/SIMULATION.md](docs/SIMULATION.md)).
- **Slice 1: private PWA, first vertical slice**:
  - **App:** React 19, Vite 8 and Tailwind v4 with the DESIGN tokens and shadcn/ui (Radix). A responsive **Home** (balance, daily check-in, activity feed, group balances) and **Wallet** (balance, send coins, paginated history). Bottom tab bar on mobile; side nav at ≥1024px.
  - **Auth:** Clerk integration (`ConvexProviderWithClerk`) is wired in. A **non-production demo sign-in** serves the 8 seeded profiles (ADR-012).
  - **Membership and authorization:** invite-only membership with a seat cap and an `ADMIN_EMAIL` bootstrap. Every public function uses the auth wrappers (`authedQuery`, `memberQuery`, `memberMutation`, `adminMutation`).
  - **Ledger:** a server-authoritative double-entry ledger with a single write path (`convex/ledger/post.ts`), reusing `shared/domain` validation. Idempotency keys and a nightly audit cron.
  - **Daily check-in:** +10 once per group day, computed on the server, DST-safe.
  - **Transfers:** request-ID idempotency, insufficient-funds protection, and a feed event for each check-in or transfer.
- **Verification (2026-10-13):**
  - `npm run typecheck` ✓.
  - `npm run lint` ✓.
  - `npm test`: **77/77** (domain + simulator 51, convex-test backend 26).
  - `npm run build` ✓ (JS 165 KB gzip).
  - `npm run e2e`: **8/8**, 2 skipped by design. It runs the production build on a local backend at 360px and 1280px, and covers sign-in, check-in, two-user live sync, the transfer UI, the overdraft guard, and real-backend concurrency and duplicate requests. axe reports 0 WCAG A/AA violations.

- **Challenges slice** (ECONOMY §6, ADR-016):
  - **Negotiation:** directed challenges with two integer stakes; a 5-minute window that is re-checked when an offer is accepted, with a scheduled expiry; counter-offers (6 at most) that swap the maker and re-escrow; decline and withdraw.
  - **Money:** escrow through the single ledger path; report → confirm settlement, with auto-confirm after 48 h.
  - **Disputes:** jury of the non-participants (24 h, quorum 3, strict majority, otherwise VOID; votes are final and the jury closes early). An admin can void with a public reason.
  - **Feed and history:** offered, accepted, settled and void events; wallet history names the challenge behind each entry.
  - **UI:** Bets tab (Needs you / Your live / Group history), a new-challenge sheet, and a detail page with a live countdown and role-specific actions. Home shows "Needs you". Wallet shows coins locked in challenges.
- **Verification (challenges slice):**
  - `npm run typecheck` ✓, `npm run lint` ✓.
  - `npm test`: **99/99**, including 17 new backend challenge tests.
  - `npm run build` ✓: initial JS 167 KB gzip against a 170 KB budget, with the bet routes lazy-loaded.
  - `npm run e2e`: **13/13**, 3 skipped by design: the full two-person challenge loop at 360px and desktop, decline, and real-backend races (concurrent accepts, accept vs withdraw). Every audit was clean and axe found no violations.

## Blockers (owner)
| Blocker | Blocks |
|---|---|
| **Clerk application** (Invite-only mode, email code, Convex integration) and its publishable key | Real sign-in. Clerk keyless mode was removed (Aug 2026). |
| Convex cloud project and Vercel project | Any non-local deployment |
| OD-2 group timezone | Production `setup:initGroup` (demo uses UTC) |
| OD-1 digest definition | Daily digest (+20) |

## Not built yet
Push notifications (needed so the 5-minute window works when the app is closed), open-to-all offers, judges, comments and reactions, digest (OD-1), seasons, service worker, invite UI, rate limits.

## Readiness audit (2026-10-13)

Evidence:
- Typecheck ✓, lint ✓.
- 80/80 unit and integration tests (51 domain and simulator, 29 convex-test backend).
- Build ✓ (165 KB gzip JS).
- 8/8 E2E against the production build and a real local backend.

### Feature status
| Status | Features |
|---|---|
| **Implemented and verified** | Ledger (single write path, I1–I5/I10 audit), check-in (once per group day, DST-safe), transfers (idempotent, overdraft-safe under real OCC), history, feed, group balances, auth wrappers on every function (enforced by a structural test), invite-only activation and seat cap, two-user live sync, responsive Home and Wallet (360px and desktop, axe clean) |
| **Implemented, not verified** | **Clerk sign-in.** The code is wired, but there were no keys to run it. Activation depends on the Clerk token carrying `email` (`convex/members.ts:49`). If it doesn't, nobody can join; the fix would be a Clerk session claim. |
| **Mocked (by design)** | Demo sign-in and the 8 demo profiles (ADR-012); demo timezone is UTC |
| **Partial** | PWA: manifest and SVG icon only. There is no service worker and no PNG `apple-touch-icon` for iOS. Admin invites: CLI only (`setup:invite`), no UI. |
| **Missing** | Deployment (Convex cloud, Vercel), CI workflow, backups/export, transfer rate limit (PRD default), digest (OD-1), push, seasons. (Challenges were added after this audit.) |

### Fixed in this audit (confirmed release blockers)
1. **Real members could not be invited.** No UI or CLI path existed, and `invites.create` needs an authenticated admin. Fix: added `setup:invite`, sharing validation and the seat cap with `invites.create`. Tests added.
2. **`demo:reset` could wipe a real group** if `DEMO_MODE` was mis-set. Fix: it now refuses when any non-demo member exists. Tests added.

### Must-do before an 8-person alpha (owner and ops, not code)
1. Create the Clerk app: Invite-only mode, email code, Convex integration. Verify that the token contains `email`.
2. Create the Convex cloud deployment and set the env vars (ADR-013). Run `setup:initGroup` with the real timezone (OD-2), then `setup:invite`.
3. Deploy to Vercel. Test sign-in in an **installed** PWA on iOS and Android.

### Can safely wait
- **Ledger audit size.** It reads every posting (`convex/ledger/audit.ts:15`). Each settled challenge adds about 3–6 transactions (6–12 postings). At the simulator's medium rate of about 0.7 matched bets a day, the 32k-document read limit is still months away. Paginate it within the next few slices.
- **JS budget.** Now 167 of 170 KB. Clerk is bundled even in demo mode. **The next UI feature should lazy-load the auth provider per mode**, since it no longer fits otherwise.
- **Transfer rate limit, invite UI, PNG icons, service worker.**
- **Weekly `npx convex export`.** Run it by hand until there is CI.

### Complexity check
- No unnecessary abstractions found.
- `shared/domain` is shared by the simulator and the backend, and the backend uses it.
- Escrow accounts already exist in the ledger model. Games add a `TxKind`, a `refs` field and their own tables; no ledger redesign is needed.
- The only maintenance friction found is three tsconfigs (Node, bundler and Convex), each scoped by comment and include list.

## Next implementation task
**Make the 5-minute window work when the app isn't open:** Web Push (VAPID, a Convex Node action, a service worker via vite-plugin-pwa injectManifest, a subscription table, and an in-app inbox as the reliable fallback). Notify on offers, counters, reports to confirm, and jury duty. In the same slice, lazy-load the auth provider to restore JS budget headroom. Real-device testing (an installed iOS PWA) needs the owner's phone.

Deploy readiness (CI, icons, runbook) can run in parallel once the owner has created the Clerk, Convex and Vercel accounts.
