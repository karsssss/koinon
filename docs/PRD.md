# Koinon — Product Requirements

Status: **Draft v0.1, awaiting review** · Owner: project lead · Last updated: 2026-10-12

Labels used in every doc:
- **[HARD]**: a requirement from the project brief. It changes only if the owner decides to change it.
- **[DEFAULT]**: a proposed default. We build it unless review changes it.
- **[OPEN OD-n]**: an open decision. Each one is tracked in [DECISIONS.md](DECISIONS.md#open-decisions) with a recommended default.

## 1. Vision

Koinon (Greek *κοινόν*, "the commons") is a private social-gaming app for one small group of friends. Its centre is a persistent play-money economy: members earn coins for showing up, then move them around through transfers, peer-to-peer bets, and rotating seasonal games. The app should feel premium and calm. Most interactions are quick taps on a phone, plus a short burst of social intensity during each season.

## 2. Hard constraints

| ID | Constraint |
|---|---|
| H1 | **[HARD]** Invite-only. The first group has **8 members**, and nobody else can sign up. |
| H2 | **[HARD]** Mobile-first installable PWA. Desktop must work but is secondary. |
| H3 | **[HARD]** Coins are play money only. There is no real-money purchase of coins, no cash-out, no redemption, and no prize with external value. Anything "purchasable" is bought with coins only. |
| H4 | **[HARD]** Every member starts with a balance of 1 coin. |
| H5 | **[HARD]** Daily earnings: **10** coins for checking in and **20** coins for a verified daily activity digest. Each is limited to once per member per **group day**. |
| H6 | **[HARD]** Long-term milestone: **10,000** coins. |
| H7 | **[HARD]** P2P bets have a **5-minute acceptance window**, escrow, negotiated odds, outcome verification, comments, and reactions. GIFs are planned for later. |
| H8 | **[HARD]** A seasonal game runs roughly **every 14 days** and lasts **3–7 days**. Season 1 is **asynchronous Mafia for 8 players**. |
| H9 | **[HARD]** The UI is dark-first and minimalist, with lightweight animation and accessible components. |

## 3. Users and roles

- **Member**: one of the 8 friends. Has full access to the economy, bets, and games.
- **Admin**: a member with extra powers. They manage invites, set group configuration, start or abort seasons, and void bets. **[DEFAULT]** The project owner is the only admin. Every admin action writes an audit entry that all members can see ([OPEN OD-12]).
- There are no anonymous users and no public pages besides sign-in.

## 4. Glossary

- **Group day**: the 24-hour window that daily limits apply to. It is computed on the server from the group timezone and a rollover hour ([OPEN OD-2]; **[DEFAULT]** a single group timezone with rollover at 04:00 local, so late-night activity counts toward the day the player thinks of as "today").
- **Wallet**: a member's spendable coin balance.
- **Season rating**: non-transferable points earned in the current seasonal game. They reset every season.
- **Lifetime progress**: stats that never go down, plus achievements (including the 10,000 milestone).
- **Escrow**: coins locked against an open bet or game. They belong to no member until the bet or game settles.

## 5. Scope

### MVP = Releases R1–R3 (everything needed to play Season 1)

| Release | Features |
|---|---|
| **R1 Economy core** | Invite-only sign-in, profile (name, emoji/avatar), genesis coin, daily check-in, daily digest, transfers with a note, wallet with ledger history, group activity feed, three leaderboards (wallet, season, lifetime), milestone progress, installable PWA, admin invite management |
| **R2 Bets** | Create a bet (directed or open), escrow, a 5-minute window, counter-offers (negotiated odds), accept/decline/withdraw, auto-expiry refunds, outcome reporting and confirmation, disputes, settlement, comments, emoji reactions, Web Push notifications |
| **R3 Seasons + Mafia** | Season framework (schedule, opt-in, lifecycle, reward minting, season rating), async Mafia (see [GAMES.md](GAMES.md)), deterministic economy simulator (see [ECONOMY.md](ECONOMY.md#9-simulator)) |

### Not in the MVP (designed for, not built)

GIFs in comments. Item trading and collectables. Auctions. A coin shop for privileges. Prediction tournaments. Other seasonal games. A light theme. Multiple groups. i18n. Native apps. Email digests. Rich media uploads.

### Never in scope

Fiat on-ramps or off-ramps. Any exchange of coins for real-world value. Public sign-up. Ads.

## 6. Functional requirements

### 6.1 Access
- F-A1: Sign-in works only for allowlisted identities. Total seats are capped at 8, and the cap is configurable by an admin.
- F-A2: **[DEFAULT]** Sign-in uses an emailed one-time code. Passkeys are optional. Because the app is usable from an installed PWA, there are no OAuth redirects (see ARCHITECTURE §4).
- F-A3: The first successful sign-in creates a member record and mints the genesis coin exactly once.

### 6.2 Daily earnings
- F-D1: **Check-in**: one tap credits +10, at most once per member per group day. Retries or a second device never double-credit.
- F-D2: **Daily digest (+20)**: the exact mechanic is **[OPEN OD-1]**. **[DEFAULT]** The member posts a short "what I did today" digest (text up to 280 characters plus an optional mood emoji). The digest counts as *verified* once **one other member** acknowledges it during the same group day or a 12-hour grace period after it. Coins are minted at the moment of verification and attributed to the group day the digest was posted. The verifier earns nothing, which keeps verification from becoming a farming loop. Alternative: the app generates a digest of group activity, and the member earns +20 by reading it and answering one auto-generated question.
- F-D3: The Today screen always shows what can still be claimed and the countdown to rollover.

### 6.3 Wallet and transfers
- F-W1: Shows the balance, an escrowed amount (locked in bets), and a paginated ledger history in which every line explains *why* the amount changed.
- F-W2: A transfer moves an integer amount of at least 1 coin, up to the sender's available balance, to another active member, with an optional note. It is final; there is no reversal by the sender.
- F-W3: **"Trade"**: [OPEN OD-10]. **[DEFAULT]** For the MVP, trade means transfers plus **payment requests** (ask a member for X coins; they approve with one tap). Item trading arrives with collectables, which are not in the MVP.

### 6.4 Bets
These are the full rules. Escrow mechanics are in [ECONOMY.md §6](ECONOMY.md#6-wagering-and-settlement).
- F-B1: A bet has: a statement, a proposer stake, a counterparty stake (these two set the odds), a counterparty (a specific member or open to all), a resolve-by time, and optionally a judge.
- F-B2: The proposer's stake is escrowed when the bet is proposed. The offer expires after **5 minutes** **[HARD]**.
- F-B3: Within the window, the counterparty can accept, decline, or counter (new stakes). A counter replaces the previous offer and starts its own 5-minute window.
- F-B4: After the resolve-by time, either participant (or the judge) reports the outcome. The other side confirms or disputes it. Disputes go to a jury ([OPEN OD-5]).
- F-B5: Comments and emoji reactions are allowed on any bet, from any member, for the bet's whole life.

### 6.5 Seasons
- F-S1: An admin schedules a season: the game type, the start time, and the length (3–7 days). **[DEFAULT]** One season starts every 14 days.
- F-S2: Members opt in up to the start time. The game's own rules decide the minimum number of players.
- F-S3: When the game ends, the season mints its rewards from a pre-declared budget and freezes the season leaderboard.

### 6.6 Social and feed
- F-F1: A group activity feed shows check-in streaks, digests, transfers ([OPEN OD-4] transparency), bets and their outcomes, milestones, and season events. Secret game information never appears in the feed.
- F-F2: Comments and reactions use one shared model. GIFs will later attach to that model.

### 6.7 Notifications
- F-N1: Web Push for: an incoming bet offer or counter, which is time-critical; a bet outcome to confirm; a payment request; a season phase change; and a nudge before rollover with unclaimed coins (opt-in).
- F-N2: Every notification is mirrored as an in-app inbox item, because push delivery is never guaranteed.

## 7. User journeys

**J1 Invite and onboarding.** The admin adds an email to the allowlist. The friend gets the link and opens it on their phone, then enters the emailed code. They pick a display name and avatar emoji. The app mints the genesis coin and shows "+1". It then shows install guidance (on iOS: Share → Add to Home Screen). Inside the installed app, the member is prompted to enable notifications and lands on Today. *Failure paths:* an email that isn't allowlisted gets "This is a private group" and no account is created. When the seat cap is reached, the admin is blocked from adding a 9th email.

**J2 Daily check-in.** The member opens the app and taps "Check in +10" on Today. The button shows optimistic feedback, the server confirms, and the balance animates. *Edge cases:* a double tap, two devices, or a request that lands after rollover. The server's group day is always the source of truth. The second claim returns "already claimed". It is not an error.

**J3 Daily digest** (default mechanic). The member writes a digest and posts it. It appears in the feed as "awaiting verification", and the other members get an in-app prompt. When the first other member taps "Verify ✓", the author is credited +20. If nobody verifies within the grace period, the digest stays in the feed and no coins are minted. *Edge cases:* a second digest on the same day is rejected. The author cannot verify their own digest.

**J4 Transfer or payment request.** The member opens Wallet → Send, picks a member, enters an amount (with a "max" shortcut), and adds an optional note. The review screen shows the balance after sending; the member confirms. The recipient gets a push and an inbox item. A payment request works the other way: the recipient sees Approve/Decline. Approving runs a transfer with the request's idempotency key.

**J5 Bet: happy path.** The member opens Bets → New and fills in the statement ("Alex will finish the marathon under 4h"), the counterparty (Alex), their own stake of 50, Alex's stake of 20 (shown as "2.5 : 1"), and resolve-by Sunday 18:00. The member confirms, and the 50 coins move to escrow. Alex gets a push and has 5 minutes, shown as a countdown. Alex counters with stakes of 50 vs 30. The proposer accepts within 5 minutes. Now both stakes are escrowed and the bet is active. Friends comment and react. After Sunday 18:00, Alex reports "Proposer wins", the proposer confirms, and the escrowed 80 is paid to the proposer. The feed posts the result.

**J6 Bet: expiry and withdrawal.** If there is no response within 5 minutes, the server expires the offer and refunds the escrow. Both sides are notified. The proposer can withdraw an unaccepted offer at any time, which also refunds it.

**J7 Bet: dispute.** One side reports an outcome and the other disputes it. The bet moves to the jury: the non-participating members get 24 hours to vote. A majority settles it; no quorum voids the bet and refunds both stakes. If the reported outcome gets no response within 48 hours, it auto-confirms ([OPEN OD-5]).

**J8 Season: Mafia.** The admin schedules Mafia. Opt-in opens 48 hours ahead and members join. When the game starts, each player privately receives a role and a secret mission. Then come daily day phases (discussion and voting) and night phases (secret actions). The game ends on a victory condition or at the day cap. Everyone sees the full reveal: roles, night actions, and missions. Rewards are minted, the season rating is posted, and a recap appears in the feed.

**J9 Milestone and leaderboards.** The member opens People → Leaderboards and switches tabs: Wallet (current), Season (current season rating), and Lifetime (total earned from mints). Milestone progress toward 10,000 appears on the member's profile. Reaching it posts a permanent badge to the feed.

**J10 Admin.** The admin can manage the allowlist, edit configuration (timezone, rollover), schedule or abort a season, void a bet (refunding escrow), and freeze a member. Every action is recorded in an audit log that members can see.

**J11 Member leaves or is removed.** **[DEFAULT]** The member is frozen. They can't sign in or receive anything, open offers are refunded, active bets go to the jury, and their balance stays in place and still counts toward supply. Data is deleted on request through an admin action that keeps anonymised ledger rows.

## 8. Non-functional requirements

- Correctness: the economy invariants in [ECONOMY.md §8](ECONOMY.md#8-monetary-invariants) must always hold, and they are tested automatically.
- Performance and accessibility targets are in [DESIGN.md §6](DESIGN.md#6-accessibility-and-performance-targets).
- Privacy: secret game state never reaches the wrong client. It is enforced in server queries, not by hiding things in the UI.
- Cost: $0 per month at 8 users is the target. The ceiling is under $30 per month.
- Durability: a daily automated export. Restoring from it is tested once before Season 1.

## 9. Roadmap

The test strategy and technical risks are in [ARCHITECTURE.md §9–10](ARCHITECTURE.md#9-test-strategy). Phases run in order unless marked ∥ (can run in parallel).

| Phase | Scope | Depends on | Acceptance criteria (summary) |
|---|---|---|---|
| **P0 Foundations** | Scaffold the stack: Vite/React/TS, Tailwind v4, shadcn/ui, Convex, Clerk. Lint, typecheck, Vitest, convex-test, Playwright, CI, Vercel deploy, design tokens. | Owner creates the Convex, Clerk and Vercel accounts (OD-6, OD-9) | CI is green on an empty app. The production URL serves the shell. An invited email can sign in and a non-invited one can't. |
| **P1 Slice 1 "First Coin"** | See [CURRENT.md](../CURRENT.md#first-end-to-end-slice-slice-1-first-coin) | P0, OD-2 | Listed in CURRENT.md |
| **P2 Economy core (R1)** | Digest, transfers, payment requests, feed, three leaderboards, milestone, PWA install and offline shell, audit cron, nightly export | P1, OD-1, OD-3, OD-4 | Double-claim and double-spend attempts are proven impossible in tests. Invariant audit is clean. The PWA installs on iOS and Android. A restore drill passes. |
| **P3 Simulator v1** ∥ | `sim/` package, archetypes, scenarios S0–S7, reports | The domain package from P1 | Same seed gives byte-identical output. A report for 30/90/180 days goes to the owner, along with recommendations for OD-7 and OD-8. |
| **P4 Bets + push (R2)** | Full offer and bet lifecycle, escrow, jury, comments, reactions, Web Push, inbox | P2, VAPID keys, iOS and Android test devices | Accept/expire race tests pass. Expiry fires within 5 s of the deadline. I6 holds in property tests. Push arrives on an installed iOS PWA and on Android. Two-context E2E negotiation passes. |
| **P5 Seasons + Mafia (R3)** | Season engine (phases, secrets, channels, event log, commit–reveal), Mafia, missions, rewards | P4 (push), P3 (budget, OD-8) | Per-role visibility tests pass. 10,000 random Mafia games all terminate within the cap, and town win rate is reported. A full dry run with 8 test accounts on staging. Rewards stay within B. |
| **P6 Launch hardening** | Accessibility audit, performance budget, device matrix, restore drill, onboarding of all 8 members | P5 | The targets in DESIGN §6 are met. All 8 members are installed with push working. Season 1 is scheduled. |
| **P7+ Expansion** | Split or Steal, Forecast League, Auction (first sink), GIFs, collectables | After Season 1 retro | Per feature |

## 10. Success metrics (first 60 days)

- At least 6 of 8 members are active on at least 5 of every 7 days.
- At least 1 accepted bet per member per week, with at least 40% of offers accepted before expiry.
- At least 7 of 8 members opt in to Season 1, and at least 80% of them stay active until the game ends.
- Zero invariant violations and zero double credits.
