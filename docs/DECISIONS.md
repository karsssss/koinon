# Koinon — Decisions

ADR statuses are **Proposed**, **Accepted**, and **Superseded**. Every ADR below is *Proposed* until the owner reviews it.

## Architecture decision records

| ID | Decision | Status | Rationale (short) | Revisit if |
|---|---|---|---|---|
| ADR-001 | **Convex** for the backend, database, realtime and scheduler | Proposed | Serializable mutations, an exactly-once transactional scheduler, reactive queries, and one TypeScript surface shared with the simulator. No Docker. See [ARCHITECTURE §2](ARCHITECTURE.md#2-convex--clerk-vs-supabase). | DB-level constraints or SQL portability become a priority |
| ADR-002 | **Clerk Hobby**: Invite-only mode, invitations, email-code sign-in, plus a second gate on the Convex `members` table | Proposed | Free for 8 users, mature, and works natively with Convex. Email *codes* work inside an iOS standalone PWA. | The forced re-login every 7 days on Hobby is unacceptable → Clerk Pro ($25/mo) or Convex Auth/Better Auth ([OPEN OD-6]) |
| ADR-003 | **Integer coins, double-entry, append-only ledger**, with a single write path | Proposed | Exact arithmetic, auditable, and its invariants can be tested | — |
| ADR-004 | **Odds expressed as two integer stakes** (the winner takes both) | Proposed | No fractions or rounding, and easy to explain | Players want decimal odds shown → presentation only |
| ADR-005 | **`shared/domain` pure rules** imported by the backend, client and simulator | Proposed | The simulator and production can't drift apart, and it reduces lock-in | — |
| ADR-006 | **Server-authoritative time**; group day computed with `Intl` in the IANA timezone | Proposed | Clients can't cheat with their clock, and DST is handled correctly | — |
| ADR-007 | **PWA via vite-plugin-pwa, injectManifest**; Web Push (VAPID) from a Convex Node action; **no offline writes** | Proposed | A custom service worker is needed for push, and the economy needs the server | — |
| ADR-008 | **Vercel Hobby** for static hosting | Proposed | Convex has an official deploy flow for it, and it costs $0 | You prefer Cloudflare Pages or Netlify ([OPEN OD-9]) |
| ADR-009 | **npm on Node 24**; React Router (SPA); no global state library (Convex hooks are enough) | Proposed | Uses what is already installed, with the fewest dependencies | — |
| ADR-010 | **Commit–reveal seed** for all randomness in games | Proposed | The admin is also a player, so anyone can verify the role assignment was fair | — |
| ADR-011 | **Deterministic seeded simulator** (`sim/`, xoshiro128**, labelled streams) built on `shared/domain` rules; reports carry a results hash | Accepted (simulator task approved) | Rule changes can be compared reproducibly before real coins exist. See [SIMULATION.md](SIMULATION.md). | Real usage data replaces the assumed behaviour |
| ADR-012 | **Non-production demo sign-in**: a Convex `customJwt` provider (own issuer, `data:` URI JWKS), tokens minted by `/demo-auth/token`, both active only when the deployment has `DEMO_MODE=true` | Accepted (slice 1) | Lets the 8 demo profiles, two-user sync and E2E run without Clerk credentials. Demo identities can never match Clerk users (different issuer). | Clerk testing tokens replace it in CI |
| ADR-013 | **Every auth-config env var must be set on each deployment** (a Convex requirement): `CLERK_JWT_ISSUER_DOMAIN` (URL or `disabled`), `DEMO_MODE` (`false` in production), `DEMO_JWKS` (`none` in production) | Accepted | Convex rejects a push if a variable read in `auth.config.ts` is unset | — |
| ADR-014 | **Structural guards as tests**: one test fails if any `convex/` file defines a function without the auth wrappers, another if anything other than `ledger/post.ts` writes ledger tables | Accepted | Cheap to run, and each guard was checked against a deliberately planted violation | — |
| ADR-015 | **CLI-only admin operations for the alpha**: `setup:initGroup` and `setup:invite` are internal mutations run from the CLI; no admin UI yet. `demo:reset` refuses if any non-demo member exists. | Accepted (audit) | Unblocks inviting 7 real members without building admin UI; removes a data-loss foot-gun | An admin UI is built |
