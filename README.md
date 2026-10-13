# Koinon

A private, invite-only, mobile-first social gaming PWA for one group of eight friends. It has a persistent **play-money** coin economy: daily earnings, transfers, peer-to-peer bets with escrow and negotiated odds, leaderboards, and a seasonal game every ~14 days. Season 1 is asynchronous Mafia.

> No real money is involved anywhere. Coins can't be bought, cashed out, or redeemed for anything with external value.

## Status

**Planning.** There is no application code yet. See [CURRENT.md](CURRENT.md).

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

## Getting started (after P0 scaffolding exists)

```bash
npm install
npx convex dev          # first run: log in and create the dev deployment
npm run dev             # Vite dev server
npm test                # unit + backend tests
npm run e2e             # Playwright
npm run sim -- --scenario S0 --days 90 --seeds 500 --seed 42
```

Required environment variables are listed under §7 of the architecture doc and will be documented in `.env.example`.
