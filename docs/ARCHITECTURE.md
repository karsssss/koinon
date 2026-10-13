# Koinon — Architecture

Status: **Proposed, awaiting review** · Sources were checked against official docs on 2026-10-12. Anything not verified is marked *unverified*.

## 1. Decision summary

| Layer | Choice |
|---|---|
| Client | React + TypeScript + Vite, Tailwind CSS v4, shadcn/ui (Radix primitives), React Router (SPA) |
| Backend / DB / realtime / scheduler | **Convex** (cloud) |
| Auth | **Clerk** (Hobby plan): **Invite-only** sign-up mode, invitations, **email one-time code** |
| PWA | `vite-plugin-pwa` with the **injectManifest** strategy (custom service worker for push) |
| Push | Web Push (VAPID), sent from a Convex Node action using `web-push` |
| Hosting | Vercel Hobby (static SPA) + Convex production deployment ([OPEN OD-9]) |
| Tests | Vitest (domain and UI), `convex-test` (backend), Playwright (E2E, mobile and desktop), fast-check (property tests) |
| Tooling | Node 24, npm (already installed; no pnpm/bun on this machine) |

The full rationale is in ADR-001…ADR-010 in [DECISIONS.md](DECISIONS.md).

## 2. Convex + Clerk vs Supabase

| Concern | Convex + Clerk | Supabase (Postgres + Auth) |
|---|---|---|
| Atomic ledger ops | Each mutation is one **serializable** transaction using optimistic concurrency, retried automatically. Multi-document atomicity comes by default, written in TypeScript. | Postgres functions called through RPC, one transaction per request. The default isolation is **READ COMMITTED**, so you need `FOR UPDATE` locks or serializable isolation. *Unverified:* whether a per-function `SET` of the isolation level is honoured. |
| DB-level constraints | **None**: no unique constraints and no CHECK constraints. Invariants are enforced in mutation code, and serializability makes "check then insert" safe. | **Strong**: CHECK (balance ≥ 0), UNIQUE (idempotency key), and foreign keys. *Supabase's biggest advantage.* |
| Deadlines (5-minute expiry, phases) | `ctx.scheduler.runAt` per entity. It is **transactional** (scheduled only if the mutation commits) and scheduled mutations run **exactly once**. | pg_cron (UTC) with a sweeper every N seconds over a `deadline` column. That works, but it polls. |
| Daily or periodic jobs | Crons, **UTC only**. Group-day logic is computed in code. | pg_cron, also UTC by default. |
| Realtime | Every query is reactive automatically. There's no channel plumbing. | Broadcast (recommended) or Postgres Changes. You need RLS on `realtime.messages`, and Postgres Changes **does not apply RLS to DELETEs**. |
| Secret game state | Server query functions filter by caller and role, written in TypeScript. They are easy to test. | RLS policies. They are powerful, but complex rules for alive/dead/role/phase visibility are error-prone. |
| Auth for invite-only | Clerk Hobby: Invite-only mode, invitations, and email OTP are **free**. The allowlist (in production) and **passkeys need Pro** ($25/mo). **The session lifetime is fixed at 7 days** on Hobby. | Supabase Auth: disable sign-ups plus `inviteUserByEmail` and OTP. **Custom SMTP is required**, because the built-in email only reaches team addresses at about 2 per hour. Passkeys are **beta**. |
| Local dev on Windows | A cloud dev deployment via `npx convex dev`. The local backend is beta and needs no Docker. | **Docker Desktop is required.** |
| Testing | `convex-test` mock in Vitest. It's fast and has fake timers for the scheduler. Crons aren't supported, so you invoke the functions directly. | pgTAP through `supabase test db` (needs Docker). |
| Free tier at 8 users | 1M function calls/mo, 0.5 GB DB, **no documented auto-pause**. | 500 MB DB, 2 projects, **pauses after 7 days of inactivity**, **no backups** on Free. |
| Lock-in / migration | Proprietary API. The backend is open source (FSL, Apache-2.0 after 2 years), and self-hosting is supported by the community. Data can be exported as a ZIP. | Plain Postgres, the most portable option. |
| Language surface | One language (TS) across client, server, simulator, and game rules | SQL/plpgsql for the critical logic and TS for the client. Game rules split across both. |

**Decision: Convex + Clerk.**
- **Rules shared with the simulator.** The economy and game rules are pure TypeScript functions, so the backend and the simulator call the *same* code (§3).
- **Transactions and deadlines are built in.** Serializable transactions and a transactional, exactly-once scheduler cover the two hardest correctness problems: escrow races and 5-minute expiry.
- **Simpler secrecy and realtime.** Reactive queries plus server-side filtering keep Mafia secrecy simple.
- **No Docker on Windows.**

**What we give up and how we cover it:**
- *No DB constraints.* The invariants live in one ledger module (§5.2) and are checked inline, in tests (property-based), and by a nightly audit job.
- *Lock-in.* Domain logic stays outside `convex/`, and a nightly export runs.
- *Clerk Hobby re-login every 7 days.* The fallback is Clerk Pro or Convex Auth/Better Auth (ADR-002).

**When Supabase would win instead:** if the owner values SQL portability and DB-enforced constraints above shared TypeScript rules and built-in scheduling, or wants to avoid having two vendors.

## 3. Repository layout (planned)

```
shared/domain/   Pure TS, no I/O: groupDay, ledger math, offer state machine,
                 settlement, jury tally, mafia resolution, missions, rewards.
                 Imported by convex/, src/, and sim/.
convex/          schema.ts, functions by feature (ledger/, members/, daily/,
                 bets/, seasons/, mafia/, push/), crons.ts, auth.config.ts
src/             React app: app/ (routes, layout), features/*, components/ui
                 (shadcn), lib/
sim/             Simulator CLI and scenarios (see ECONOMY.md §9)
e2e/             Playwright specs
docs/            Specs and ADRs
```

## 4. Authentication and access

1. Clerk app with **sign-up mode = Invite-only** and the **email code** strategy. No magic links and no OAuth: an iOS home-screen PWA keeps its storage separate from Safari, so a link that opens in Safari signs the user into the wrong place.
2. Invitations are created by the admin in-app. A Convex action calls the Clerk Invitations API using `CLERK_SECRET_KEY`.
3. Convex is integrated through Clerk's **native Convex integration**: `auth.config.ts` with `applicationID: "convex"`, and `ConvexProviderWithClerk`.
4. **A second gate inside Convex.** Every public function goes through a `memberQuery`/`memberMutation` wrapper. The wrapper resolves `ctx.auth.getUserIdentity()` to the `members` row and requires `status = active`. The first sign-in activates the member only if their email is on the in-app invite list and the seat count is below the cap. Even if someone bypasses Clerk's settings, they get no data.
5. The admin is bootstrapped through the Convex env var `ADMIN_EMAIL`.

## 5. Backend design

### 5.1 Data model (Convex tables)

| Area | Tables (key fields) |
|---|---|
| Group | `groupConfig` (singleton: timezone, rolloverHour, seatCap) · `members` (tokenIdentifier, email, displayName, avatar, role, status) · `invites` · `auditLog` |
| Ledger | `accounts` (key, type, ownerId?, balance) · `transactions` (kind, idempotencyKey, payloadHash, actorId, groupDay, refs, memo, createdAt) · `postings` (txId, accountId, delta, createdAt) |
| Daily | `dailyClaims` (memberId, groupDay, kind, txId) · `digests` (authorId, groupDay, text, mood, status, verifiedBy) |
| Transfers | `paymentRequests` (from, to, amount, note, status) |
| Bets | `bets` (proposerId, counterpartyId?, statement, resolveBy, judgeId?, status, outcome, report…) · `betOffers` (betId, seq, makerId, makerStake, takerStake, status, expiresAt, jobId) · `juryVotes` |
| Social | `comments` (subjectType, subjectId, authorId, body, gif?) · `reactions` (subjectType, subjectId, memberId, emoji) · `feedEvents` · `notifications` (inbox) · `pushSubscriptions` |
| Seasons | `seasons` (gameType, status, startsAt, endsAt, budget, seedCommit, seed (hidden), configVersion) · `seasonParticipants` (points, faded) |
| Mafia | `mafiaPlayers` (role, alive, missionId) · `gamePhases` · `gameVotes` · `gameActions` · `gameMessages` (channel) · `gameEvents` (seq, type, payload, visibility) |

Every lookup path has an index. The uniqueness of each idempotency key and each `(member, groupDay, kind)` is enforced by an index lookup inside the same mutation.

### 5.2 Secure operations

- **Only `convex/ledger/post.ts` writes** to `accounts`, `transactions`, or `postings`, through `postTransaction(ctx, spec)`. That one function enforces I1, I4, I7 and idempotency. Code review and a lint rule (`no-restricted-imports`/grep in CI) block any other path.
- Every public function has `args` validators. The client never supplies amounts it doesn't own, time, groupDay, roles, or outcomes beyond what it's allowed to report.
- Scheduler targets and crons are `internal*` functions only.
- **Actions** (the Node runtime) are used only for external I/O: Clerk invitations and Web Push. They call internal mutations for any state change.
- Secrets (`CLERK_SECRET_KEY`, `VAPID_PRIVATE_KEY`) live in Convex env vars.
- Rate limits use a Convex rate-limiter component (*verify it is current at implementation time*) or a simple counter table.
- **Secret game data:** queries return a per-viewer projection. Unit tests assert that each role, alive or dead, sees exactly what the permission matrix allows.

### 5.3 Scheduling

| Job | Mechanism |
|---|---|
| Offer expiry (5 min), outcome auto-confirm (48 h), jury close (24 h), digest grace expiry, game phase transitions, deadline nudges | `ctx.scheduler.runAt` from the creating mutation. The handler is idempotent and re-checks state. |
| Rollover nudges ("unclaimed coins") | A cron every 15 min (UTC). It computes the group-local time with `Intl`, so it is DST-safe. |
| Ledger audit | Nightly cron → `internal.ledger.audit` |
| Backups | A GitHub Actions nightly workflow runs `npx convex export` and stores the result as an encrypted artifact or in private storage. |

Daily claims need **no cron**: the group day is computed on demand.

Things to know:
- Scheduled actions run at most once, so push sends are fire-and-forget and the in-app inbox is the reliable channel.
- Crons are skipped while a deployment is paused.

### 5.4 Realtime

- Convex reactive `useQuery` / `usePaginatedQuery` drive everything: balances, offers, chat, and votes.
- Countdowns render locally from the server's `expiresAt`, corrected by a clock offset measured at load. **The server re-checks deadlines on every write.**

### 5.5 PWA and push

- The manifest uses `display: standalone`, dark `theme_color`/`background_color`, and maskable icons, plus the `apple-touch-icon`.
- The custom service worker precaches the app shell and handles `push` and `notificationclick`. It never caches API/WebSocket traffic.
- **No offline writes.** Economic actions need the server. Offline, the app shows the cached shell with an "offline" banner.
- **iOS push only works after Add to Home Screen** (iOS 16.4+), and the permission prompt must come from a user gesture. Onboarding therefore walks iOS users through installing before asking for notifications.
- The Badging API shows the unread count. Declarative Web Push (iOS 18.4+) is a later optimisation.
- `vite-plugin-pwa` **v2.0.0 was released in Oct 2026**. Review its breaking changes at scaffold time, and pin to the latest 1.x if v2 isn't usable yet.

## 6. Cost (8 users)

| Service | Plan | Monthly |
|---|---|---|
| Convex | Free (1M calls, 0.5 GB DB) | $0 |
| Clerk | Hobby (50k MRU) | $0 |
| Vercel | Hobby | $0 |
| **Total** | | **$0** (a domain, if wanted, costs about $10–15/yr) |

- **Upgrade triggers:**
  - Passkeys or a longer session → Clerk Pro, $25/mo.
  - Convex limits exceeded → a paid plan. *The price couldn't be verified; check before upgrading.*
- **Estimated load:** about 8 users × 300 function calls/day ≈ 72k/month normally. Mafia chat bursts could add several times that. Usage is watched in the dashboard during Season 1.

## 7. Deployment and environments

- **dev:** each developer gets a Convex dev deployment and a Clerk development instance.
- **preview:** Vercel preview builds plus Convex preview deployments. Free-plan previews are deleted after 5 days.
- **prod:** Vercel production with `npx convex deploy --cmd "npm run build"` (`CONVEX_DEPLOY_KEY`).
- **CI (GitHub Actions):** typecheck → lint → unit and convex-test → simulator determinism → build plus the bundle-size budget → Playwright. Playwright runs against a dev deployment, using Clerk testing tokens (*check the `@clerk/testing` setup at implementation time*).

## 8. Migration risk

| Risk | Likelihood | Mitigation |
|---|---|---|
| Leaving Convex | Low–medium | Domain rules live in `shared/` and don't depend on Convex. The ledger is append-only, so exporting it gives a replayable history. The schema is documented here. |
| Leaving Clerk | Low | Identity is mapped through `members.tokenIdentifier`, and only the auth wrapper and provider component would change. The fallback is Convex Auth (beta) or the official Better Auth component. |
| Schema evolution | Certain | Use Convex schema validation, and add fields as optional first, then backfill, then tighten. Changes are versioned per ADR. |

## 9. Test strategy

| Layer | Tool | Scope |
|---|---|---|
| Domain unit | Vitest | groupDay (DST in both directions, rollover edges), offer state machine, settlement, jury tally, Mafia vote/night/win resolution, missions, reward allocation and scaling |
| Property-based | Vitest + fast-check | Random sequences of ledger ops must preserve I1–I10. Random Mafia games must always terminate within the cap. |
| Backend integration | convex-test | Auth gates; idempotent replay; balance checks; accept/expire races; scheduled functions using fake timers; secret-visibility projections per role. **An invariant check runs after every test.** |
| Simulator | Vitest | The same seed produces byte-identical output (hash snapshot) |
| E2E | Playwright (Pixel 7 and iPhone 15 viewports, plus desktop) | Sign-in, check-in, transfer, a two-context bet negotiation, a Mafia vote. **axe accessibility scans** on every page. |
| Manual device matrix | — | Installed PWA on iOS Safari and on Android Chrome: install, sign in, push, badge |

## 10. Technical risks

1. **The 5-minute window vs. asynchronous life.** Many offers may expire. Mitigations: push, open-to-all bets, an "action required" view on Today, and simulator scenario S6 to measure it.
2. **iOS push depends on the user installing the app.** Mitigations: onboarding that requires installation, and the in-app inbox as a fallback.
3. **The admin can read secrets through the Convex dashboard.** The commit–reveal seed proves roles were assigned fairly, but it can't stop someone peeking. Mitigation: a team-visible norm that the dashboard isn't opened during a season, with any non-admin access audited (Convex dashboard audit, *unverified*). This is accepted as social trust ([OPEN OD-12]).
4. **No DB constraints.** Mitigation: the single ledger module, plus audits and property tests.
5. **Free-tier usage spikes during Mafia.** Mitigation: monitoring and paginated chat.
6. **A fresh vite-plugin-pwa major (v2).** Mitigation: pin a version and review it.
