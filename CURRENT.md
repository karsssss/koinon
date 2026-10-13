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

## Next
See the audit section below once it is written; otherwise the next step is the P2 economy core.
