# Koinon

A private, invite-only, mobile-first social gaming PWA for one group of eight friends. It has a persistent **play-money** coin economy: daily earnings, transfers, peer-to-peer bets with escrow and negotiated odds, leaderboards, and a seasonal game every ~14 days. Season 1 is asynchronous Mafia.

> No real money is involved anywhere. Coins can't be bought, cashed out, or redeemed for anything with external value.

## Status

**Slice 1 (wallet, daily check-in, transfers, feed) runs locally with demo profiles.** Real Clerk sign-in still needs keys. See [CURRENT.md](CURRENT.md).

## Documentation

| Doc | Contents |
|---|---|
| [docs/PRD.md](docs/PRD.md) | Product spec, MVP scope, user journeys, roadmap |
| [docs/ECONOMY.md](docs/ECONOMY.md) | Wallet, season rating, lifetime tracks; ledger; escrow; bets; invariants; simulator |
| [docs/GAMES.md](docs/GAMES.md) | Seasonal game catalogue and the Mafia ruleset |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack decision (Convex + Clerk vs Supabase), data model, security, tests, risks |
| [docs/DESIGN.md](docs/DESIGN.md) | Tokens, components, information architecture, accessibility and performance targets |
| [docs/DECISIONS.md](docs/DECISIONS.md) | ADRs and open decisions |
| [CLAUDE.md](CLAUDE.md) | Rules for working in this repo |

## Proposed stack

React · TypeScript · Vite · Tailwind CSS v4 · shadcn/ui · Convex · Clerk · vite-plugin-pwa · Vitest · convex-test · Playwright

## Getting started (local, no accounts needed)

```bash
npm install
npx convex dev --once     # first run creates an anonymous LOCAL Convex deployment (.env.local)
npm run demo:setup        # NON-PRODUCTION: enables the 8 demo profiles and seeds them
echo VITE_AUTH_MODE=demo >> .env.local
npx convex dev            # terminal 1: local backend + function push on save
npm run dev               # terminal 2: http://localhost:5173
```

Checks:

```bash
npm run typecheck && npm run lint && npm test   # domain, simulator and convex-test suites
npm run build
npx playwright install chromium && npm run e2e  # production build + local backend, 360px and desktop
npm run demo:reset                              # wipe and reseed the demo data
```

Real sign-in uses Clerk (ADR-002). Set `VITE_CLERK_PUBLISHABLE_KEY` in `.env.local`, then set `CLERK_JWT_ISSUER_DOMAIN`, `DEMO_MODE=false` and `DEMO_JWKS=none` on the deployment (ADR-013). Membership matches the verified email in the Convex token, and the Clerk Convex integration does not include it by default: in Clerk → Sessions → Customize session token, add `{"email": "{{user.primary_email_address}}", "email_verified": "{{user.email_verified}}"}`. Run `npx convex run setup:initGroup` once with the group timezone (OD-2).

Two local environments, kept apart:

| | Demo / E2E | Real sign-in (cloud dev) |
|---|---|---|
| Env file | `.env.local` (`VITE_AUTH_MODE=demo`) | `.env.clerk.local` (gitignored; cloud URLs, `VITE_AUTH_MODE=clerk`, a deploy key scoped to the dev deployment) |
| Backend | `npx convex dev` (local backend) | `npx convex deploy -y --env-file .env.clerk.local` |
| Frontend | `npm run dev` | `npx vite --mode clerk` |
| CLI | `npx convex run …` | `npx convex run … --env-file .env.clerk.local` |

Don't run `npx convex dev --env-file .env.clerk.local`: `convex dev` rewrites `.env.local` to point at whatever it targets.

Vercel previews (`vercel.json`) build the SPA only and use the cloud dev backend through Preview env vars. Production deploys from `main` are disabled until a production backend exists. Dashboard setup and the two-player verification gate: [docs/PLAYTEST.md](docs/PLAYTEST.md).
