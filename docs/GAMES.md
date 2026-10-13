# Koinon — Seasonal Games

Status: **Draft v0.1** · The labels [HARD], [DEFAULT] and [OPEN OD-n] are defined in [PRD.md](PRD.md).

## 1. Season cadence

- [HARD] A season starts roughly every **14 days** and lasts **3–7 days**. The rest of the cycle is the "off-season", when bets and daily earnings continue as usual.
- [DEFAULT] An admin schedules each season with: the game type, the start time, the length, and a reward budget **B** (see [ECONOMY.md §5.3](ECONOMY.md#53-season-rewards)). Opt-in opens 48 hours before the start.
- Every game is built on a shared **game engine**:
  - **Phases** with server-scheduled deadlines.
  - **Per-player secret state.**
  - **Secret actions.**
  - **Channels** with visibility rules.
  - An append-only **game event log**. It drives the UI, mission checks, and the final reveal.
  - **Seeded randomness with commit–reveal.** At the start the server publishes `sha256(seed)` and reveals `seed` at the end. Anyone can then recheck that roles and other random draws weren't rigged, which matters because the admin is also a player.

## 2. Candidate games, prioritised for exactly 8 players

Scores run from 1 to 5, where higher is better. "Build" means effort, assuming the engine and Mafia already exist.

| # | Game | Mechanic (1-line) | 8-fit | Async | Build | Economy role | Priority |
|---|---|---|---|---|---|---|---|
| 1 | **Async Mafia** | Hidden roles, day votes, night actions, secret missions | 5 | 4 | L (first) | Mint (budget) | **Season 1 [HARD]** |
| 2 | **Split or Steal Round-Robin** | 7 days = a perfect round-robin of 8. Each day the group splits into 4 pairs, and each player secretly chooses Split or Steal over a budget-funded pot. | 5 | 5 | S | Mint (budget) | **Season 2** |
| 3 | **Forecast League** | Members post yes/no questions that resolve inside the season and forecast a probability; Brier score → points | 4 | 5 | M (reuses bet resolution and jury) | Mint (budget) | **Season 3** |
| 4 | **Sealed-Bid Auction Week** | Second-price sealed auctions for in-app privileges (choose the next game, a custom title, a pinned message); the winning price is **burned** | 4 | 5 | M | **Sink** | **Season 4** (first sink) |
| 5 | **Public Goods Pot** | Daily: everyone may contribute 0–20 wallet coins; the pot × 1.5 (top-up minted from B) is split 8 ways; contributions revealed at day end | 5 | 5 | S | Net mint, capped | Season 5 |
| 6 | **Two-Thirds Game** | Daily: pick 0–100; closest to ⅔ of the mean wins the day's points | 4 | 5 | S | Mint (budget) | Filler / off-season |
| 7 | **Two Truths and a Lie** | Each player posts 3 statements; others guess the lie; points for good guesses and for fooling people | 4 | 5 | S | Mint (budget) | Filler |
| 8 | **Ultimatum Round-Robin** | In each pairing, one player proposes how to split 100 points and the other accepts or rejects; roles swap next round | 5 | 4 | S | Mint (budget) | Later |
| 9 | **Assassin (IRL)** | Each player has a secret target and a secret word, and "kills" by getting the target to say it, confirmed by the victim | 4 | 3 | M | Mint (budget) | **Only if the group meets in person regularly** [OPEN] |
| 10 | **Codenames 4v4 (async)** | Two teams of 4; rotating spymaster; clue → guesses per phase | 5 | 3 | L | Mint (budget) | Later |

How the order was chosen:
- Mafia comes first by decree.
- Split or Steal is next because it is almost free once the engine has phases and secret actions, and because 8 players fit a round-robin exactly.
- Forecast League reuses bet resolution.
- The auction introduces the first sink, which is needed once the simulator shows how inflation builds up.

## 3. Mafia: candidate ruleset (v0.1)

This is a starting point for playtesting, not a final balance. Every number lives in a versioned `MafiaConfig`, so a rule change is a config bump rather than a code change.

### 3.1 Setup [DEFAULT]

| Players | Mafia | Detective | Doctor | Villagers |
|---|---|---|---|---|
| **8** (canonical) | 2 (one is the *Don*) | 1 | 1 | 4 |
| 7 (fallback) | 2 | 1 | 1 | 3 |
| < 7 | The game does not start. The admin postpones it or swaps in a different game ([OPEN OD-11]) | | | |

- Roles are assigned uniformly at random from the committed seed. The two Mafia know each other.
- **Mafia**: one kill per night, shared between the pair. If the two submissions disagree, the Don's target wins. If only one Mafia submits, that target stands.
- **Detective**: investigates one living player per night and learns "Mafia" or "Not Mafia". Nobody is immune to investigation.
- **Doctor**: protects one living player per night. They cannot protect the same player two nights in a row, and may protect themselves **once per game**.
- **Villager**: has no night action.
- A role is **revealed publicly when its player dies.** Players may claim any role in chat, and lying is allowed.

### 3.2 Phases and deadlines [DEFAULT]

All times are in the group timezone ([OPEN OD-2]).

| Phase | Window | What happens |
|---|---|---|
| Night 0 | Starts 20:00 the evening before Day 1 and lasts until 08:00 | Roles and missions are delivered, the Mafia channel opens, and nobody has a night action |
| Day *n* | 08:00 → 21:00 | Public discussion and voting. The elimination is resolved at 21:00 |
| Night *n* | 21:00 → 08:00 | Secret actions are submitted until 08:00. They are resolved at 08:00 (dawn), followed by the announcement |

- Deadlines are fixed, and there is **no early "hammer"**: a day doesn't end early when a majority is reached. Players who only check in during the evening still have their full say.
- Nudges are sent by push and in-app at deadline − 2h to living players who haven't voted or used their night action yet.
- **Day cap: the game ends after Day 6** if there is no winner. A game therefore lasts at most 6.5 calendar days, which fits the [HARD] limit of 3–7 days.

### 3.3 Day vote

1. Each living player has one vote. It can go to any living player (including themselves), to **No elimination**, or be left as an abstention. Votes can change until the deadline, and the history of every vote is public.
2. At the deadline, the player with the most votes is eliminated **if that count is higher than the votes for No elimination**.
3. If several players tie for the most votes, the one who **reached that final count first** is eliminated. This is a deterministic rule, and it rewards voting early.
4. If nobody voted at all, or No elimination is tied for the top or ahead, nobody is eliminated.

### 3.4 Night resolution (at dawn, in order)

1. The Doctor's protection is applied.
2. The Mafia's kill is applied. If the target is protected, the kill fails, and the dawn message simply says nobody died.
3. The Detective's result is delivered privately. If the investigated player was killed that night, the result still arrives.
4. The win check runs.

### 3.5 Victory

The win check runs after **every** elimination.
- **Town wins** when no Mafia are alive.
- **Mafia wins** when the number of living Mafia is **at least** the number of living non-Mafia.
- **Draw** if Day 6 ends without either condition being met.

### 3.6 Channels and permissions

| Capability | Living town | Living mafia | Dead player | Non-participant member |
|---|---|---|---|---|
| Read Town Square | ✓ | ✓ | ✓ | ✓ (spectator, [DEFAULT]) |
| Post in Town Square (day *and* night) | ✓ | ✓ | ✗ | ✗ |
| React in Town Square | ✓ | ✓ | ✗ | ✗ |
| Mafia Den (read/post) | ✗ | ✓ | read-only if they were mafia | ✗ |
| Graveyard (read/post) | ✗ | ✗ | ✓ | ✓ (read-only) |
| Day vote | ✓ | ✓ | ✗ | ✗ |
| Night action | role-specific | kill | ✗ | ✗ |
| See any hidden role | own only | own and partner's | own only (**everything is revealed only at the end**) | ✗ |

- The app has **no private player-to-player DMs during a game**.
- An honour code is shown at opt-in: no screenshots, and no discussing the game outside the app. The app cannot enforce it, so it is stated as a rule.
- Every visibility rule is enforced in **server queries**. The client never receives data it isn't allowed to see.

### 3.7 Secret missions

- Each player gets **one secret mission**, drawn at random from the pool below without repeats.
- Missions are **role-neutral**: completing one never reveals your alignment.
- Missions are checked automatically from the event log at game end.
- A completed mission is worth **+2 season points**.
- Missions are revealed at the end of the game.

| ID | Mission | Completed when (computed from the event log) |
|---|---|---|
| M1 | Early Bird | You cast the first vote of the day on 2 different days |
| M2 | Kingmaker | Your final vote matched the eliminated player on 2 different days |
| M3 | Survivor | You are alive at the start of Day 3 |
| M4 | Town Crier | You posted at least 5 messages in Town Square on 3 different days |
| M5 | Unseen | You had no votes on you at the Day 1 and Day 2 deadlines (and were alive both times) |
| M6 | Swing Voter | You changed your vote at least once on 2 different days |
| M7 | Diplomat | You reacted to messages from at least 5 different players |
| M8 | Steadfast | Your final vote was on the same player on 2 consecutive days |
| M9 | Peacekeeper | Your final vote was No elimination on a day when nobody was eliminated |
| M10 | Last Word | You cast or changed a vote in the last 15 minutes before a day deadline |

### 3.8 Inactivity

- **Missed day vote**: counts as an abstention.
- **Missed night action**: there is no effect. For Mafia, only a submitted target is used.
- **Fading**: a living player becomes **faded** if they **neither vote nor post** during 2 consecutive day phases. A faded player is eliminated at the next dawn, after the Mafia's kill, and their role is revealed. A faded player earns **0 season points**.
- **Faded players and the win check**: a faded player is removed like any other eliminated player.
- **Inactive Mafia pair**: if both Mafia skip their night action, there is no kill that night.
- **Mid-game substitutes**: not possible, because the group has only 8 members.

### 3.9 Balance notes and adjustment levers

- With 2 Mafia among 8 players and a day start, the town gets 3–4 eliminations before Mafia parity. The Detective and Doctor give the town its information and its protection.
- The balance target is a town win rate of 45–55%.
- **v0.1 is unvalidated.** Validation comes from two sources:
  - a random-play and heuristic-play Monte Carlo run in the simulator;
  - the result of Season 1 itself.
- If the balance needs adjusting, the levers are listed below from smallest to largest change:
  - a night-start variant;
  - deliver Detective results with a one-phase delay;
  - remove the Doctor's self-protect;
  - add a Jester (a third party who wins by being voted out);
  - go to 3 Mafia (only if the town wins far too often).

## 4. Scoring and rewards (Mafia)

### 4.1 Season points

| Event | Points |
|---|---|
| On the winning team (alive or dead) | +6 |
| Draw (each non-faded player) | +3 |
| Participated without fading | +2 |
| Alive at the end | +1 |
| Completed the secret mission | +2 |
| Faded | 0 total |

The most a single player can earn is 11 points.

### 4.2 Coin conversion

- **[DEFAULT]** Each season point converts to **5 coins**. The season budget is B = 400, and allocations are scaled down proportionally if they would exceed it.
- A typical town win mints about 350 coins in total. A Mafia win mints about 240.
- These numbers are [OPEN OD-8] until the simulator has run.
- Rewards are minted in a single `SEASON_REWARD` transaction per player when the game ends, under the key `season:<id>:reward:<memberId>`.

## 5. Engine requirements derived from Mafia (reused by later games)

- **Phase scheduler.** At each phase start, the next transition is scheduled with `runAt`. Transitions are idempotent: they check the current phase and do nothing if it has already moved on.
- **Secret actions.** Each one is stored per player per phase. A player can only submit actions their role and current phase permit. A later submission in the same phase overwrites the earlier one.
- **Event log.** Every vote, action, message, elimination and resolution is recorded with a monotonic sequence number. The end-of-game reveal and the mission checks are both computed from this log.
- **Admin.** An admin can only abort a running game, which voids the season. The admin cannot see or change any player's secrets.
