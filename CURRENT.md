# CURRENT

Updated: 2026-10-13 · Branch `feat/economy-simulator` · Phase: **Slice 1 implemented and tested locally**

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

## Blockers (owner)
| Blocker | Blocks |
|---|---|
| **Clerk application** (Invite-only mode, email code, Convex integration) and its publishable key | Real sign-in. Clerk keyless mode was removed (Aug 2026). |
| Convex cloud project and Vercel project | Any non-local deployment |
| OD-2 group timezone | Production `setup:initGroup` (demo uses UTC) |
| OD-1 digest definition | Daily digest (+20) |

## Not in this slice
Digest, bets, push, seasons, PWA service worker, invite UI (the admin mutation exists), and rate limits.

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
| **Missing** | Deployment (Convex cloud, Vercel), CI workflow, backups/export, transfer rate limit (PRD default), digest (OD-1), bets, push, seasons |

### Fixed in this audit (confirmed release blockers)
1. **Real members could not be invited.** No UI or CLI path existed, and `invites.create` needs an authenticated admin. Fix: added `setup:invite`, sharing validation and the seat cap with `invites.create`. Tests added.
2. **`demo:reset` could wipe a real group** if `DEMO_MODE` was mis-set. Fix: it now refuses when any non-demo member exists. Tests added.

### Must-do before an 8-person alpha (owner and ops, not code)
1. Create the Clerk app: Invite-only mode, email code, Convex integration. Verify that the token contains `email`.
2. Create the Convex cloud deployment and set the env vars (ADR-013). Run `setup:initGroup` with the real timezone (OD-2), then `setup:invite`.
3. Deploy to Vercel. Test sign-in in an **installed** PWA on iOS and Android.

### Can safely wait
- **Ledger audit size.** It reads every posting (`convex/ledger/audit.ts:15`). It stays under Convex's 32k-document read limit for roughly a year at check-in and transfer volume, but bets will bring that limit closer. Paginate before P4 bets.
- **JS budget.** Clerk is bundled even in demo mode; 165 of 170 KB is used. Lazy-load the auth provider when the budget binds.
- **Transfer rate limit, invite UI, PNG icons, service worker.**
- **Weekly `npx convex export`.** Run it by hand until there is CI.

### Complexity check
- No unnecessary abstractions found.
- `shared/domain` is shared by the simulator and the backend, and the backend uses it.
- Escrow accounts already exist in the ledger model. Games add a `TxKind`, a `refs` field and their own tables; no ledger redesign is needed.
- The only maintenance friction found is three tsconfigs (Node, bundler and Convex), each scoped by comment and include list.

## Next implementation task
**P0 completion: alpha deploy readiness.** Add a GitHub Actions CI workflow (typecheck, lint, test, build), PNG and `apple-touch-icon` icons, and a deploy runbook (`docs/DEPLOY.md`: env vars, initGroup, invite, Clerk checks, export). Then do the first deploy once the owner has created the Clerk, Convex and Vercel accounts.

After that: **P4 bets** (the digest stays blocked on OD-1), starting with paginating the ledger audit.
