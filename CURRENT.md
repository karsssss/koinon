# CURRENT

Updated: 2026-10-13 · Phase: **P3 economy simulator done** · Code: `shared/domain/` (ledger, bet and season rules) and `sim/`; no web app yet

## Done
- Product, economy, games, architecture, design and decisions docs drafted (`docs/`).
- Stack evaluated against current official docs. Proposed choice: **Convex + Clerk** (ADR-001, ADR-002).
- **Economy simulator (P3)**, deterministic and seeded. 8 players; 30/90/180 days; low/medium/high engagement; sensitivity variants.
  - Results: [docs/SIMULATION.md](docs/SIMULATION.md), and the generated [sim/reports/REPORT.md](sim/reports/REPORT.md).
  - 5,600 runs and 15.6 M transactions validated, with 0 invariant violations.
  - Reproduce: `npm test` and `npm run sim:report`.
  - Findings were added to the OD-3, OD-7, OD-8, OD-11 and OD-13 entries, plus a new OD-14 for the 5-minute window.

## Waiting on the owner
1. Review the docs, then accept or amend the ADRs in `docs/DECISIONS.md`.
2. Answer the ★ open decisions: OD-1 digest mechanic, OD-2 timezone, OD-3 milestone basis, OD-4 transparency, OD-6 weekly re-login.
   The simulation also proposes changes to OD-3, OD-11 and OD-13 for review.
3. Create accounts and projects (I can't do this step): Convex team/project, Clerk application (set sign-up mode to **Invite-only** and enable **email code**), Vercel project, and the GitHub remote.

## Blockers
| Blocker | Blocks | Owner |
|---|---|---|
| ADR approval | Everything | Owner |
| Convex, Clerk, Vercel accounts | P0 | Owner |
| OD-2 timezone | Slice 1 config (a default is possible) | Owner |
| OD-1 digest definition | P2 digest | Owner |
| An iOS device with the PWA installed, for push testing | P4 | Owner + group |

## First end-to-end slice: Slice 1 "First Coin"

Goal: an invited member signs in on a phone, gets 1 coin, checks in for +10, and sees the balance, history, and leaderboard update live. Everything runs through the production ledger path.

**In scope**
- P0 scaffold:
  - Vite + React + TS (strict), Tailwind v4 + shadcn/ui, and the DESIGN tokens.
  - React Router, with BottomNav routes Today/Wallet/People. Bets and Season are placeholders.
- Tooling:
  - ESLint and Prettier; Vitest, convex-test, Playwright, and fast-check.
  - GitHub Actions CI and a Vercel production deploy.
- Clerk in Invite-only mode with email-code sign-in. `ConvexProviderWithClerk`. A `members` gate and seat cap in Convex. The admin is bootstrapped via `ADMIN_EMAIL`.
- Admin: invite by email (a Convex action calling the Clerk Invitations API, plus an `invites` row), and a member list.
- `groupConfig` singleton (timezone, rolloverHour = 4, seatCap = 8).
- `shared/domain`: `groupDay()`, posting balance and limit checks, and the invariant checker.
- The ledger core:
  - `accounts`, `transactions`, `postings`, and idempotency.
  - `postTransaction()` and `assertLedgerInvariants()`.
  - The nightly `ledger.audit` cron.
- **GENESIS** (+1, once per member) on first activation. **CHECKIN** (+10, once per group day).
- Screens:
  - **Today**: check-in button, claimed state, countdown to rollover, balance.
  - **Wallet**: balance and paginated ledger history.
  - **People**: members and the wallet leaderboard.
- PWA manifest and icons, so the app is installable. No push yet.

**Out of scope:** digest, transfers, bets, push, seasons, feed, milestone UI, light theme.

**Acceptance criteria**
1. An invited email can sign in with a code on mobile. A non-invited email can't create an account, and the member count never exceeds `seatCap`.
2. A member's first sign-in creates exactly one member and one GENESIS (+1), even with concurrent first loads from two devices (tested in convex-test).
3. Check-in credits +10 once per group day. A repeat claim returns `ALREADY_CLAIMED` without minting. Rollover happens at 04:00 in the group timezone. Unit tests cover the spring and autumn DST transitions and the edges at 03:59/04:00.
4. The Wallet balance equals the sum of postings. History shows GENESIS and CHECKIN with their group day.
5. The leaderboard updates live in a second browser context when another member checks in (Playwright).
6. Invariants I1–I5, I7, I9 and I10 are asserted after every backend test. The audit function, invoked directly, reports clean, and it reports any tampering with a cached balance.
7. Lighthouse (mobile) passes the installable check with accessibility ≥ 95. Initial JS is ≤ 170 KB gzip. axe finds no violations.
8. CI is green (typecheck, lint, unit, convex-test, Playwright mobile and desktop), and the app is live at the production URL.

## Next after Slice 1
P2 economy core and P3 simulator, run in parallel. See the roadmap in [docs/PRD.md §9](docs/PRD.md#9-roadmap).
