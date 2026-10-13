# Koinon — Economy Simulation: Method, Assumptions, Findings

Status: **v1, 2026-10-13** · Raw results: [`sim/reports/REPORT.md`](../sim/reports/REPORT.md) (generated, do not edit)

> **Read this first.** The simulator is a *what-if* tool. The issuance, season and wager-limit
> rules come from the specs. **Every behavioural number (how often people log in, bet, gift, or buy)
> is an assumption made up for exploration, not measured from our group.** Use the results to
> compare rules against each other, not as forecasts. Re-calibrate after 30 days of real data.

## 1. Reproduce

```bash
npm install
npm test                                   # invariant, determinism and property tests
npm run sim:report                         # full matrix + sensitivity → sim/reports/REPORT.md (~2 min)
npm run sim -- --engagement medium --days 90 --seed 42                     # one run, per-player table
npm run sim -- --engagement high --days 180 --seeds 200                    # one scenario, 200 seeds
npm run sim -- --days 180 --seeds 200 --set wagers.cap.maxStakeBps=5000    # any config path
```

- **Base seed** `20261013`. Each scenario runs 200 derived seeds and reports the median, p10 and p90.
- **Byte-identical output.** The same inputs give the same output on the same Node major version (24). The report prints a SHA-256 of its results. Two consecutive runs produced identical files (sha256 of `REPORT.md`: `74be571c…876310`).
- **Shared code.** Code lives in `sim/`. Ledger, bet and season rules come from `shared/domain/`, the same functions the backend will use (ADR-005).

## 2. Model and assumptions

| Area | Rule (source) | Assumption (not measured) |
|---|---|---|
| Players | 8 seats, one per archetype in ECONOMY.md §9 (grinder, social, high-roller, sharp, casual, lurker, generous, churner) | Archetype mix and parameters in `sim/config.ts` |
| Engagement | — | **Medium** = the archetype table as written (mean ≈ 79% of days active). **Low**: every activity probability × 0.55. **High**: inactivity × 0.4. Offer rate × 0.5, 1 or 1.6. |
| Issuance | Genesis 1, check-in 10, digest 20, each once per day (H4, H5) | Check-in happens on every active day |
| Digest verification | OD-1 default: another member acknowledges it on the same day, or the next day (grace) | Any other active member counts as a verifier |
| Bets | Two integer stakes; ≤ 20:1 ratio; maker escrows on offer; counter refunds and re-escrows; ≤ 6 offers per chain; winner takes the pot (ECONOMY §6) | Offers are Poisson per active day. A 5-minute response chance of 10–45% per archetype, scaled as `1 − (1 − p5)^(window/5)`. 55% accept, 30% counter, 15% decline. 25% of offers are open-to-all. True win probability = fair odds + skill-edge difference. 2% void, plus 5% disputed, of which 35% are voided. Bets resolve within 1–7 days. |
| Wealth cap | OD-13 spec default: stake ≤ available balance | Variants: ≤ 50%, ≤ 25%, minimum balance |
| Transfers | Zero-sum, final | Generous archetype gifts 10% of balance weekly to the poorest member. Everyone has a 5% chance per day of a small "trade" of 0.01–10% of balance. |
| Seasons | Every 14 days from day 8, 6 days long. Mafia v0.1 points. B = 400, 5 coins/point, scaled to the budget. Needs ≥ 7 opt-ins (OD-11). | Opt-in requires activity in the 48 h before the start. Fading = 2 consecutive inactive season days. Town wins 50%, draws 5%. 40% of players survive. Missions: 50% × share of days active. |
| Sinks | Not in the MVP (OD-7) | Optional shop with items costing 40, 150 or 300 coins, at most 50% of balance per purchase, 4% or 10% purchase chance per active day. Optional rake. |
| Near-zero | — | Wallet < 10 coins at the end of a day |

**Not modelled:** real time inside a day, payment-request UX, Mafia strategy, collusion, anyone's reaction to the leaderboard, and people joining later than day 1.

## 3. Conservation evidence

Across **5,600 runs**, the simulator validated:
- 15.6 M transactions and 31.3 M postings, each against I1 (balanced), I4 (bounds), I10 (integers) and the mint/burn direction rules;
- 869,600 daily invariant checks (I2, I3, I6);
- a full recompute of every balance from its postings (I5) at the end of each run.

**Result: 0 violations.** `minted − burned = supply = Σ wallets + escrow` held in 5,600/5,600 runs.

The tests prove four more properties:
- **Exact issuance:** a group that is always active ends with exactly `8 × (1 + 30·D)` coins.
- **Zero-sum flows:** wagers and transfers leave supply unchanged. Runs with and without them, from the same seed, have the same supply.
- **Exact burns:** sinks reduce supply by exactly the amount burned.
- **Property-based:** randomised configurations conserve coins.

## 4. Findings (median of 200 seeds)

1. **Daily issuance is the whole economy.**
   - Season rewards are about 2% of minting: roughly 25 coins per participant-season, against about 26 coins per active day.
   - Halving or doubling the season budget hardly matters. The 400 cap almost never binds, because a typical Mafia mints about 190 (25 × 7–8 participants).
   - The digest (+20) is about 60% of all issuance. Its definition (OD-1) is the single most important open economic decision.
2. **Wagering drives inequality.** Gini at 180 days, medium engagement:

   | Rule | Gini |
   |---|---|
   | No wagering | 0.16 |
   | Spec default (stake ≤ 100% of balance) | 0.37 |
   | Stake ≤ 50% | 0.30 |
   | Stake ≤ 25% | 0.25 |
   | Wager rate ×3 | 0.51 |
   | High engagement | 0.55 |

   Busts stay rare, because daily minting refills wallets: near-zero player-days are at most 1.7% in every scenario.
3. **The 5-minute window [HARD] kills most offers.**
   - About 74% of offers expire at medium engagement, and about 91% at low.
   - A 30-minute window would double matched bets: 51% matched instead of 24%. It would also raise Gini to 0.47.
   - This is the largest product-behaviour lever in the model.
4. **Seasons often don't start.** Requiring ≥ 7 of 8 opt-ins skipped:
   - 9 of 12 seasons at medium engagement;
   - all of them at low engagement.

   With ≥ 6, about 8 of 12 run at medium.
5. **The 10,000 milestone is a long-term goal, as intended.**
   - **Nobody earns it from minting within 180 days.** The median player is projected to reach 10,000 lifetime minted in about 456 days at medium engagement, about 359 at high, and about 1,190 at low.
   - **Wallet balance can get there earlier, through betting wins.** Under high engagement, the median is 1 player by day 180. Under a wallet-balance milestone (the OD-3 default), the first person to 10,000 will usually be a lucky or skilled bettor, not the most consistent attendee.
6. **Sinks.**
   - A shop with a 4% purchase chance removes about 21% of supply growth.
   - A 5% rake removes about 11% of supply and lowers Gini slightly.
   - A closed 8-person economy with linear issuance needs no sink for stability. Sinks only matter for keeping prices meaningful later on.

## 5. Recommended initial defaults

| Decision | Recommendation | Evidence | Risk |
|---|---|---|---|
| OD-13 wager cap | **Change to: stake ≤ 50% of available balance** (keep the ratio, open-offer and chain limits) | Gini 0.37 → 0.30. Near-zero days 0.5% → 0.2%. Keeps 83% of wager volume. | Feels paternalistic to high rollers. 25% is the fallback if the real Gini exceeds 0.45. |
| OD-7 sinks / rake | **Keep: no rake, no sinks in the MVP** | Supply grows linearly and predictably (about 150/day at medium). Busts are rare. | Prices for future privileges must be indexed to the median wallet, not fixed. |
| OD-8 season budget | **Keep B = 400, 5 coins/point**, and present seasons as status, not income | The budget rarely binds. Seasons are about 2% of issuance. | Rewards may feel small. Raising coins/point is cheap if players say so. |
| OD-11 min opt-ins | **Proposed change: run with ≥ 6.** This needs a 6-player Mafia setup, which is not designed yet (GAMES.md) | Seasons held go from 3 to 8 of 12 at medium | A 6-player Mafia is less balanced and needs its own playtest |
| OD-3 milestone basis | **Prefer lifetime minted**, or show both | A wallet-based milestone rewards betting luck | A pure attendance goal of about 1.3 years at medium engagement may feel distant. Consider intermediate badges at 1k, 2.5k and 5k. |
| H7 5-minute window | **Keep (HARD)**, but the owner should know it costs about half of potential bets. Push notifications and open-to-all offers are essential. | Window sensitivity, finding 3 | If acceptance is below 30% after 30 days, reconsider the window. |

## 6. Limits of this analysis

- **Invented behaviour.** The parameters are made up. The low/medium/high engagement levels bracket plausible behaviour but are not calibrated.
- **Simplified Mafia.** Outcomes are coin flips with fixed probabilities, so this says nothing about Mafia balance.
- **Day-level time.** The model has no time within a day. Within-window effects come only from the response-probability formula.
- **Small group.** With 8 players, single-seed results are noisy. Compare distributions (p10–p90), never single runs.
