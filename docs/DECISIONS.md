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

## Open decisions

★ marks the questions asked of the owner now. Everything else goes ahead with its default unless review says otherwise.

| ID | Question | Recommended default | Blocks |
|---|---|---|---|
| ★ OD-1 | What exactly is a "verified daily activity digest" (+20)? | A member posts a short "what I did today" note, and it is **verified when one other member acknowledges it** within the group day plus 12 hours. Alternative: read the app-generated digest of group activity and answer one quiz question. | R1 digest feature (not Slice 1) |
| ★ OD-2 | The group timezone and the day rollover hour | **One timezone for the group** (the owner names it), **rollover at 04:00** | Slice 1 (a config value; the default can be changed later) |
| ★ OD-3 | Is the 10,000 milestone based on wallet balance or lifetime earned? | ~~Wallet balance~~ → **Lifetime minted (or show both)**. *Simulation: a wallet milestone is reached first through betting luck. Lifetime takes about 456 days for the median medium-engagement player* ([SIMULATION §4.5](SIMULATION.md#4-findings-median-of-200-seeds)) | R1 milestone UI |
| ★ OD-4 | Can every member see every balance and transaction? | **Yes, a transparent economy.** Game secrets are the exception. | R1 feed and leaderboards |
| ★ OD-6 | Is a forced re-login every 7 days acceptable? (This is the Clerk Hobby limit.) | **Yes for the MVP.** Re-entering an email code takes about 20 seconds. Upgrade to Clerk Pro later if it becomes annoying. | Slice 1 (auth vendor) |
| OD-5 | How are bet disputes and silence handled? | Optional judge; otherwise mutual confirmation; disputes go to a jury of non-participants (24 h, quorum 3, strict majority, otherwise VOID); silence auto-confirms after 48 h | R2 |
| OD-7 | Sinks and bet rake | **No rake.** No sinks in the MVP; the first sink is the Season 4 auction. *Simulation confirms: supply grows linearly (about 150/day at medium), busts are rare (<2% of player-days); price future items relative to the median wallet.* | R3 tuning |
| OD-8 | Season reward budget and points-to-coins rate | B = 400 per season, 5 coins per point. *Simulation: seasons are about 2% of issuance and the cap rarely binds. Keep, and treat seasons as status.* | R3 |
| OD-9 | Hosting provider | Vercel Hobby | P0 |
| OD-10 | What does "trade" mean in the MVP? | Transfers plus payment requests. Item trading arrives with collectables. | R1 |
| OD-11 | Mafia with fewer than 8 opt-ins | 7 players works (2 Mafia, Detective, Doctor, 3 Villagers). Below 7, postpone or swap the game. *Simulation: with ≥ 7 required, 9 of 12 seasons are skipped at medium engagement. **Proposed: allow ≥ 6**, once a 6-player setup is designed.* | R3 |
| OD-12 | Admin scope and secret access | One admin (the owner). All admin actions are audited publicly. The norm is no dashboard access during a season. | R3 |
| OD-13 | Bet limits | ~~Stake ≤ available balance~~ → **proposed: stake ≤ 50% of available balance** (*simulation: Gini 0.37 → 0.30, keeps 83% of volume*); ratio ≤ 20:1, ≤ 3 open offers, ≤ 30-day resolve-by, ≤ 6 offers per negotiation | R2 |
| OD-14 | The 5-minute acceptance window (H7, HARD) | **Keep.** *Simulation: about 74% of offers expire at medium engagement; 30 minutes would double matched bets.* Re-check after 30 days of real data. | R2 (owner awareness) |
