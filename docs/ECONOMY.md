# Koinon — Economy Specification

Status: **Draft v0.1** · The labels [HARD], [DEFAULT] and [OPEN OD-n] are defined in [PRD.md](PRD.md).

The economy is a **closed, play-money, double-entry ledger**. Coins enter only by minting under rules written in code. They leave only by burning, and only through explicit sinks. Between those two points they move only through balanced journal entries.

## 1. Three separate value tracks

| Track | What it is | Transferable | Resets | Used for |
|---|---|---|---|---|
| **Wallet** (coins) | Spendable balance on the ledger | Yes (transfers, bets) | Never | Betting, transfers, future sinks, the 10,000 milestone ([OPEN OD-3]) |
| **Season rating** (points) | Score from one seasonal game | No | Every season | Season leaderboard and season reward *allocation* |
| **Lifetime progress** | Stats that only go up, plus achievements | No | Never | Lifetime leaderboard, badges, streaks |

Rules:
- Season points **are not coins**. At the end of a season, points are *converted* into a coin mint from a pre-declared budget (§5.3). After that, the points stay as history.
- Lifetime "earned" = coins **minted to** the member (genesis, daily, and season rewards). It deliberately leaves out transfers received and bet winnings. Pooling coins into one account can then move the wallet leaderboard, but never the lifetime board.
- Lifetime stats also track: total check-ins, longest streak, number of digests, bets won/lost/void, net betting P&L, seasons played, and peak wallet balance.
- **The milestone ([OPEN OD-3])**: **[DEFAULT]** reached the first time the *wallet balance* hits at least 10,000. It is recorded once as a permanent achievement, with the peak balance as its timestamped evidence. Alternative: base it on lifetime earned, which makes it a pure attendance goal of about 330 perfect days.

## 2. Units and amounts

- [DEFAULT] Coins are **integers**. No fractions anywhere, and no rounding paths. Odds are written as two integer stakes (§6), so payouts never need division.
- Every amount in a request is a positive integer. **[DEFAULT]** A single posting is capped at 1,000,000 as a sanity limit.

## 3. Accounts

| Account | Holder | Allowed balance |
|---|---|---|
| `wallet:<memberId>` | a member | **≥ 0** |
| `system:mint` | issuance source | ≤ 0 (its negative is total minted) |
| `system:burn` | sink | ≥ 0 (total burned) |
| `escrow:bet:<betId>` | one bet | ≥ 0; must be 0 once the bet is terminal |
| `pool:season:<seasonId>` | season entry fees (not in the MVP) | ≥ 0; must be 0 once the season is final |

## 4. Journal model

A **transaction** has these fields: `id`, `kind`, `idempotencyKey`, `actorId` (a member, or `system`), `createdAt` (server time), `groupDay`, `refs` (betId, seasonId, digestId, …), `memo`, and `postings[]`.

A **posting** is `{accountId, delta}`, where delta is a nonzero integer.

Ledger mutations run as a single atomic backend transaction:
1. Check that the actor is allowed to do this. Check that the business preconditions hold.
2. Look up the idempotency key. If it exists with the same payload, **return the original result**. If it exists with a different payload, throw `IDEMPOTENCY_CONFLICT`.
3. Build the postings. Assert that their deltas sum to zero.
4. Apply each delta to the cached account balance. Assert that each account stays within its allowed range.
5. Insert the transaction, the postings, the idempotency record, and the feed event, and schedule any follow-ups.

The ledger is **append-only**. Nothing is ever edited or deleted. Errors are fixed with a reversing transaction (`kind = ADJUSTMENT`), which is admin-only, requires a reason, and appears in the feed.

Transaction kinds in the MVP:

| Kind | Postings |
|---|---|
| `GENESIS` | mint −1, wallet +1 |
| `CHECKIN` | mint −10, wallet +10 |
| `DIGEST` | mint −20, wallet +20 |
| `TRANSFER` | sender −x, receiver +x |
| `BET_ESCROW` | wallet −s, escrow +s |
| `BET_REFUND` | escrow −s, wallet +s |
| `BET_PAYOUT` | escrow −(a+b), winner wallet +(a+b) |
| `SEASON_REWARD` | mint −r, wallet +r (one transaction per member per season, with the line items in `refs`) |
| `ADJUSTMENT` | any balanced set of postings (admin only) |

`BURN` (sinks) is reserved for after the MVP.

### Idempotency keys

| Operation | Key |
|---|---|
| Genesis | `genesis:<memberId>` |
| Check-in | `checkin:<memberId>:<groupDay>` |
| Digest reward | `digest:<memberId>:<groupDay>` |
| Season reward | `season:<seasonId>:reward:<memberId>` |
| Bet escrow, refund, payout | `bet:<betId>:offer:<offerId>:escrow`, `…:refund`, `bet:<betId>:settle` |
| User-initiated (transfer, offer, accept) | `<memberId>:<clientUuid>`. The client generates the UUID once per user *intent* and reuses it on retry. |

Keys for natural mints are derived on the server and never come from the client. A mint's key therefore also enforces its "once per group day" rule.

## 5. Issuance (mint) rules

### 5.1 Group day
- `groupDay = localDate(now − rolloverHour, groupTimezone)` as an ISO date. **[DEFAULT]** The rollover hour is 04:00 ([OPEN OD-2]).
- It is always computed on the server. The client's clock is only used to display countdowns.
- DST is handled by computing the local date in the IANA zone. A group day may be 23 or 25 hours long.

### 5.2 Daily
- [HARD] Check-in mints +10, at most once per member per group day.
- [HARD] A verified digest mints +20, at most once per member per group day ([OPEN OD-1] defines "verified"). With the default peer-verification mechanic, the reward belongs to the group day *the digest was posted*, even if verification lands during the grace period.
- [HARD] Genesis mints +1 once, when the member is activated.
- Group maximum: 8 × 30 = **240 coins/day**, or about **87,600/year**, before season rewards.

### 5.3 Season rewards
- Every season declares a **budget B** before it starts. The budget is public and stored on the season record, and it cannot change once the season is live.
- At the end, the game produces season points per player. The reward formula is defined per game (Mafia's is in [GAMES.md](GAMES.md#4-scoring-and-rewards-mafia)). If the computed total exceeds B, every line is scaled down by `floor(line × B / total)`. **Rounding remainders are simply not minted**, so there is never anything left to allocate.
- **[DEFAULT]** B is about 50 coins per player per season, or 400 for 8 players, which is under 10% of daily issuance across a 14-day cycle (3,360). That keeps daily attendance as the main income and seasons as a meaningful bonus. The simulator will validate this number ([OPEN OD-8]).

### 5.4 Milestone math (no betting)
- A perfect player earns 30 a day, plus about 30 from seasons on average, so **about 32/day**. 10,000 takes **roughly 310 days**.
- A typical player (80% check-in, 70% digest) earns about 22/day, so roughly **450 days**.
- 10,000 is therefore a genuine long-term goal. Betting can speed it up or set it back. Nothing gets minted for betting.

## 6. Wagering and settlement

> **Implemented** (`convex/bets.ts`, rules in `shared/domain/bets.ts`): directed challenges, counters, the 5-minute window, escrow, report/confirm, 48 h auto-confirm, jury and admin void. **Not yet:** open-to-all offers, judges, comments and reactions, push notifications.

### 6.1 Concepts
- A **bet** is the long-lived object: a statement, its participants, a resolve-by time, comments, reactions, and an outcome.
- An **offer** is one set of proposed terms inside a bet's negotiation. A bet's offers form a chain, and **at most one offer is open at a time**.
- **Odds are integer stakes.** The maker stakes `m` and the taker stakes `t`. The winner receives `m + t`. The UI shows the ratio (e.g. "50 : 20, pays 2.5×").

### 6.2 Offer lifecycle (5-minute window [HARD])

```
            ┌── accept ──────────────► (bet ACTIVE)
OPEN ───────┼── counter ─► new OPEN offer (roles swap: counterer becomes the maker)
 (escrow:   ├── decline ─► DECLINED ─┐
  maker     ├── withdraw (maker) ─► WITHDRAWN ─┤──► bet CLOSED, refund maker
  stake)    └── expiresAt reached ─► EXPIRED ──┘
```

1. **Creating an offer** escrows the maker's stake in the same transaction (`BET_ESCROW`). It sets `expiresAt = serverNow + 300 s` and schedules `expireOffer(offerId)` at `expiresAt`.
2. **Accepting** requires all of the following:
   - the offer is `OPEN`;
   - `serverNow < expiresAt`, re-checked inside the transaction no matter whether the scheduler has run;
   - the taker is eligible;
   - the taker's available balance is at least `t`.

   The transaction escrows the taker's stake and marks the bet `ACTIVE`. It's atomic: either both stakes are locked or nothing changes.
3. **Countering** (taker only, while the offer is open) has four steps in one transaction:
   - mark the old offer `COUNTERED`;
   - refund the old maker's stake;
   - create a new offer with the counterer as maker, escrowing the counterer's new stake;
   - start a fresh 5-minute window.

   **[DEFAULT]** A chain allows at most **6 offers**, then the bet closes.
4. **Expiry** is handled by a scheduled mutation. If the offer is still `OPEN`, it marks it `EXPIRED` and refunds the maker. Otherwise it does nothing (it's idempotent). Because mutations are serializable, an accept and an expiry that race can never both succeed.
5. **Open-to-all bets**: any eligible member may accept, and the first commit wins. Open offers **cannot be countered**; a member who wants other terms creates a directed bet.

### 6.3 Constraints [DEFAULT]
- Each stake must be at least 1 and no more than the maker's or taker's available balance.
- The stake ratio must be at most 20:1, so odds can't get absurd.
- A member can have at most **3** open offers as maker at once.
- `resolveBy` must be at least 5 minutes and at most 30 days after creation.
- You can't bet against yourself. The judge can't be a participant.

### 6.4 Outcomes and settlement
- The possible outcomes are `A_WINS`, `B_WINS`, and `VOID` (the names used in code). "A" is the original proposer and "B" is the counterparty. The labels don't change as offers swap makers.
- **If a judge was named**: only the judge reports, and the report is final. It settles immediately.
- **If no judge was named**:
  1. Either participant may report an outcome once the bet is `ACTIVE`. Early reports are fine, because the event might already be decided.
  2. The other participant **confirms**, which settles the bet, or **disputes** it.
  3. **[DEFAULT]** If there is no response within 48 hours, the report auto-confirms ([OPEN OD-5]).
- **Dispute → jury**: the jury is every active member who is not a participant (up to 6). They get 24 hours to vote for A, B, or VOID.
  - The result is the option with a **strict majority of votes cast, with at least 3 votes cast**.
  - Anything else settles as VOID.
  - Jurors get no reward. Each juror's vote is shown to the group after the bet closes.
  - **[DEFAULT, set in implementation]** A juror's vote is final once cast. The jury closes early as soon as every eligible juror has voted. With fewer than 3 eligible jurors the quorum can't be met, so a disputed bet settles as VOID.
- **Settlement**:
  - A winner receives `escrow` in full (`BET_PAYOUT`).
  - VOID refunds each side's own stake (two `BET_REFUND` postings).
  - The escrow account must end at exactly 0.
- **Rake: 0** ([OPEN OD-7]). Bets are strictly zero-sum, so the house takes nothing.
- An admin may **void** any non-terminal bet. Escrow is refunded, a reason is required, and the action is audited.

## 7. Abuse prevention

| Vector | Control |
|---|---|
| Client clock or replay | Server-side time and groupDay; idempotency keys; natural mint keys |
| Double spend, races | Serializable transactions; balance checks inside the transaction; `expiresAt` re-checked when an offer is accepted |
| Sybil accounts | Invite-only; seat cap of 8; admin-managed allowlist |
| Self-dealing | No self-transfers, self-bets, or self-verification of digests; participants can't be judge or juror |
| Leaderboard pooling | The lifetime board counts mints only; transfers are visible in the feed ([OPEN OD-4]) |
| Betting on known outcomes | The jury can rule VOID; the 5-minute window limits sniping; norms are posted in-app |
| Spam | [DEFAULT] At most 20 transfers per member per day, at most 20 new bets per day, at most 3 open offers, and rate limits on comments |
| Admin abuse | Every admin action is audited and visible to all members; ADJUSTMENT entries appear in the feed |
| Game secrets | Server-side visibility filters; see ARCHITECTURE §5 |

## 8. Monetary invariants

These must hold after **every** committed transaction. They are checked inline where it's cheap, and by a nightly audit job plus tests.

1. **I1 Balanced**: every transaction's postings sum to 0.
2. **I2 Closed system**: the sum of all account balances is 0.
3. **I3 Supply identity**: `minted − burned = Σ wallets + Σ escrows + Σ pools`, where `minted = −balance(system:mint)`.
4. **I4 Non-negative**: every wallet, escrow and pool balance is at least 0.
5. **I5 Cache integrity**: each account's cached balance equals the sum of its postings.
6. **I6 Escrow lifecycle**:
   - While an offer is open, the escrow equals the maker's stake.
   - While the bet is active, it equals the sum of both stakes.
   - Once the bet is terminal (SETTLED, VOID or CLOSED), it is 0.
7. **I7 Mint uniqueness**: there is at most one CHECKIN and one DIGEST per (member, groupDay), and one GENESIS per member.
8. **I8 Season cap**: a season's total minted rewards are at most its budget B.
9. **I9 Append-only**: no transaction or posting is ever updated or deleted.
10. **I10 Integers**: every delta is a nonzero integer.

Whenever the nightly `auditLedger` job finds a violation, it creates an admin alert and an item in the admin inbox. It never auto-corrects.

## 9. Simulator

> **Implemented** in `sim/`. The method, assumptions, commands and findings are in [SIMULATION.md](SIMULATION.md). The simulator models the post-MVP `PURCHASE` sink (wallet → burn) and an optional rake, so those can be compared. Neither is an MVP rule.

The simulator answers the tuning questions before real coins exist, so they aren't left to guesswork.

**Design**
- It is a pure TypeScript package (`sim/`). It **imports the same domain rule functions** the backend uses: groupDay, offer state machine, settlement, and season reward allocation. Simulation and production therefore can't drift apart.
- Randomness is deterministic: a seeded PRNG (xoshiro128**). Each stream is derived as `hash(seed, scenario, day, playerId, purpose)`, so adding a behaviour doesn't reshuffle the others. The same arguments produce **byte-identical output**, and a test asserts this with a hash snapshot.
- Time steps are days. Bets are modelled within each day: offers arrive as a Poisson process, and acceptance within 5 minutes depends on how likely the taker is to be online, which is the critical sensitivity.
- It checks invariants I1–I8 every simulated day. Any violation fails the run.

**Player archetypes (8, one per seat, all parameters configurable)**

| Archetype | Check-in p | Digest p | Bets/day λ | Stake (fraction of balance) | Skill edge | Notes |
|---|---|---|---|---|---|---|
| Grinder | 0.98 | 0.95 | 0.2 | 5–10% | 0 | |
| Social | 0.9 | 0.8 | 1.0 | 10–20% | 0 | Comments heavily |
| High roller | 0.85 | 0.6 | 0.8 | 30–60% | 0 | |
| Sharp | 0.9 | 0.8 | 0.5 | 10–20% | +0.10 | |
| Casual | 0.65 | 0.4 | 0.3 | 10% | 0 | |
| Lurker | 0.35 | 0.15 | 0.05 | 5% | 0 | |
| Generous | 0.85 | 0.7 | 0.3 | 10% | 0 | Gifts 10% of balance weekly |
| Churner | 0.9 until day 45, then 0.1 | 0.8, then 0 | 0.5 | 15% | 0 | |

- Daily online probability per archetype sets the chance of accepting an offer within 5 minutes.
- Seasons start every 14 days, opt-in follows each archetype's probability, and the town win rate is configurable (default 0.5).

**Scenarios** (each run for 30, 90 and 180 days, over 500 seeds, reporting p5/p50/p95)

| ID | Scenario |
|---|---|
| S0 | Baseline as above |
| S1 | No betting (pure issuance) |
| S2 | Heavy betting (λ×3, stakes ×2) |
| S3 | Low engagement (3 lurkers) |
| S4 | Sinks on: future shop burns about 20% of each member's earnings |
| S5 | Season budget ×0.5 / ×2 |
| S6 | Acceptance window 5 min vs 30 min (to measure what the HARD rule costs) |
| S7 | Churn: 2 members leave on day 45 |

**Outputs**
- **Per day**: supply, minted by kind, burned, escrow outstanding, balances, offers made, accepted and expired, wager volume.
- **Summary**:
  - wealth distribution: Gini, top-1 and top-2 share, median, p10/p90 balance;
  - betting activity: wager frequency, acceptance rate, bust count (balance < 10 while wanting to bet);
  - progress and rankings: days to 10,000 per archetype, wallet leaderboard rank churn.
- **Formats**: `out/<scenario>-<days>d-<seed>.json`, `.csv`, and a Markdown comparison table.
- **CLI**: `npm run sim -- --scenario S0 --days 90 --seeds 500 --seed 42`.

**Decisions it informs**: OD-3 (milestone basis), OD-7 (sinks/rake), OD-8 (season budget), and the stake caps in §6.3.
