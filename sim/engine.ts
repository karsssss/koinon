// One deterministic simulation run. Days are group days 1..D. Order within a day:
// settle due bets → daily mints → transfers → purchases → wagers → season end → checks and metrics.

import {
  escrowPostings,
  fairWinProbabilityA,
  maxStake,
  MAX_ODDS_RATIO,
  refundPostings,
  settlementPostings,
  stakeError,
  type BetOutcome,
  type MatchedBet,
} from "../shared/domain/bets.ts";
import { BURN_ACCOUNT, MINT_ACCOUNT, betEscrowAccount, walletAccount, type TxKind } from "../shared/domain/ledger.ts";
import { applyBps } from "../shared/domain/money.ts";
import { allocateSeasonRewards, mafiaSeasonPoints, type MafiaResult } from "../shared/domain/season.ts";
import type { Archetype, EngagementLevel, EngagementModel, SimConfig } from "./config.ts";
import { SimLedger } from "./ledger.ts";
import { gini, mean, median } from "./metrics.ts";
import { stream, type Rng } from "./rng.ts";

export interface PlayerResult {
  readonly id: string;
  readonly finalBalance: number;
  readonly peakBalance: number;
  readonly lifetimeMinted: number;
  readonly activeDays: number;
  readonly walletMilestoneDay: number | null;
  readonly lifetimeMilestoneDay: number | null;
}

export interface DailyPoint {
  readonly day: number;
  readonly supply: number;
  readonly escrow: number;
  readonly medianWallet: number;
  readonly maxWallet: number;
  readonly gini: number;
  readonly nearZeroWallets: number;
}

export interface RunResult {
  readonly seed: number;
  readonly days: number;
  readonly engagement: EngagementLevel;
  readonly players: readonly PlayerResult[];
  readonly daily: readonly DailyPoint[];
  readonly sources: { genesis: number; checkin: number; digest: number; season: number; total: number };
  readonly sinks: { purchase: number; rake: number; total: number };
  readonly flows: {
    transferVolume: number;
    transfers: number;
    offersMade: number;
    counters: number;
    offersAccepted: number;
    offersExpired: number;
    offersDeclined: number;
    offersBlockedByCap: number;
    wagerVolume: number;
    betsSettled: number;
    betsVoided: number;
    escrowOutstanding: number;
    maxStakeShareObserved: number;
  };
  readonly seasons: { held: number; skipped: number; participantSeasons: number; rewardsMinted: number; maxSeasonMint: number };
  readonly activity: { activePlayerDays: number; digestsPosted: number; digestsVerified: number };
  readonly conservation: { transactions: number; postings: number; invariantChecks: number; byKind: Record<string, number> };
  readonly summary: {
    supply: number;
    medianWallet: number;
    maxWallet: number;
    meanWallet: number;
    gini: number;
    nearZeroPlayerDayShare: number;
    nearZeroAtEnd: number;
    walletMilestonePlayers: number;
    lifetimeMilestonePlayers: number;
    dailyMintPerActivePlayerDay: number;
    seasonCoinsPerParticipant: number;
    mintedPerPlayer: number;
    medianProjectedDaysToLifetimeMilestone: number;
  };
}

interface Effective {
  readonly pActive: number;
  readonly pDigest: number;
  readonly offers: number;
  readonly pRespond: number;
  readonly optIn: number;
  readonly a: Archetype;
}

interface OpenBet extends MatchedBet {
  readonly resolveDay: number;
  readonly pAWins: number;
}

function shift(p: number, level: EngagementLevel, m: EngagementModel): number {
  if (level === "low") return p * m.lowScale;
  if (level === "high") return 1 - (1 - p) * m.highInactivityScale;
  return p;
}

function effective(a: Archetype, cfg: SimConfig): Effective {
  const lvl = cfg.engagement;
  const m = cfg.engagementModel;
  const p5 = shift(a.pRespondWithin5Min, lvl, m);
  return {
    a,
    pActive: shift(a.pActive, lvl, m),
    pDigest: shift(a.pDigestGivenActive, lvl, m),
    offers: a.offersPerActiveDay * m.wagerScale[lvl],
    pRespond: 1 - Math.pow(1 - p5, cfg.wagers.acceptanceWindowMinutes / 5),
    optIn: shift(a.seasonOptIn, lvl, m),
  };
}

function at<T>(xs: readonly T[], i: number): T {
  const x = xs[i];
  if (x === undefined) throw new RangeError(`index ${i} out of range`);
  return x;
}

/** Keeps a stake pair within the odds-ratio limit by moving the second stake. */
function clampRatio(first: number, second: number): number {
  return Math.min(first * MAX_ODDS_RATIO, Math.max(Math.ceil(first / MAX_ODDS_RATIO), second, 1));
}

export function runSimulation(cfg: SimConfig): RunResult {
  const n = cfg.archetypes.length;
  if (n < 2) throw new Error("need at least 2 players");
  if (!Number.isSafeInteger(cfg.days) || cfg.days < 1) throw new Error("days must be a positive integer");
  const D = cfg.days;
  const ids = cfg.archetypes.map((a, i) => `p${i}-${a.id}`);
  const eff = cfg.archetypes.map((a) => effective(a, cfg));
  const wallet = (p: number) => walletAccount(at(ids, p));
  const ledger = new SimLedger();

  // Activity and digest intent are precomputed per player stream (D + 1 days, for the digest grace day).
  const active: boolean[][] = [];
  const digestIntent: boolean[][] = [];
  for (let d = 0; d <= D + 1; d++) {
    active.push(new Array<boolean>(n).fill(false));
    digestIntent.push(new Array<boolean>(n).fill(false));
  }
  for (let p = 0; p < n; p++) {
    const actRng = stream(cfg.seed, "activity", p);
    const digRng = stream(cfg.seed, "digest", p);
    const e = at(eff, p);
    for (let d = 1; d <= D + 1; d++) {
      const churned = e.a.churnAfterDay !== null && d > e.a.churnAfterDay;
      at(active, d)[p] = actRng.bernoulli(churned ? cfg.churnedPActive : e.pActive);
      at(digestIntent, d)[p] = digRng.bernoulli(churned ? 0 : e.pDigest);
    }
  }
  const isActive = (d: number, p: number): boolean => at(at(active, d), p);

  const lifetimeMinted = new Array<number>(n).fill(0);
  const peak = new Array<number>(n).fill(0);
  const activeDays = new Array<number>(n).fill(0);
  const walletMilestoneDay = new Array<number | null>(n).fill(null);
  const lifetimeMilestoneDay = new Array<number | null>(n).fill(null);
  const sources = { genesis: 0, checkin: 0, digest: 0, season: 0, total: 0 };
  const sinks = { purchase: 0, rake: 0, total: 0 };
  const flows = {
    transferVolume: 0,
    transfers: 0,
    offersMade: 0,
    counters: 0,
    offersAccepted: 0,
    offersExpired: 0,
    offersDeclined: 0,
    offersBlockedByCap: 0,
    wagerVolume: 0,
    betsSettled: 0,
    betsVoided: 0,
    escrowOutstanding: 0,
    maxStakeShareObserved: 0,
  };
  const seasonStats = { held: 0, skipped: 0, participantSeasons: 0, rewardsMinted: 0, maxSeasonMint: 0 };
  const activity = { activePlayerDays: 0, digestsPosted: 0, digestsVerified: 0 };
  const daily: DailyPoint[] = [];
  let nearZeroPlayerDays = 0;

  const mint = (kind: TxKind, key: string, p: number, amount: number, bucket: "genesis" | "checkin" | "digest" | "season", day: number) => {
    if (amount === 0) return; // an issuance configured to 0 is no transaction
    ledger.post({ kind, idempotencyKey: key, postings: [{ account: MINT_ACCOUNT, delta: -amount }, { account: wallet(p), delta: amount }] });
    sources[bucket] += amount;
    sources.total += amount;
    lifetimeMinted[p] = at(lifetimeMinted, p) + amount;
    if (lifetimeMilestoneDay[p] === null && at(lifetimeMinted, p) >= cfg.milestone) lifetimeMilestoneDay[p] = day;
  };

  // ---- Bets ----
  const openBets: OpenBet[] = [];
  const closedBetIds: string[] = [];
  let betSeq = 0;
  const w = cfg.wagers;

  const recordStake = (p: number, stake: number) => {
    const balance = ledger.balance(wallet(p));
    if (balance > 0) flows.maxStakeShareObserved = Math.max(flows.maxStakeShareObserved, stake / balance);
  };

  const makeOffer = (day: number, maker: number, rng: Rng) => {
    const balance = ledger.balance(wallet(maker));
    const cap = maxStake(balance, w.cap);
    if (cap < 1) {
      flows.offersBlockedByCap++;
      return;
    }
    const e = at(eff, maker);
    let mkStake = Math.min(cap, Math.max(1, Math.floor(balance * rng.uniform(e.a.stakeShare[0], e.a.stakeShare[1]))));
    const q = rng.pick(w.impliedProbabilities);
    let tkStake = clampRatio(mkStake, Math.round((mkStake * (1 - q)) / q));
    const betId = `d${day}-b${betSeq++}`;
    const others = ids.map((_, i) => i).filter((i) => i !== maker);
    const respondP = (i: number) => (isActive(day, i) ? at(eff, i).pRespond : 0);

    let mk = maker;
    let offerNo = 1;
    recordStake(mk, mkStake);
    ledger.post({ kind: "BET_ESCROW", idempotencyKey: `bet:${betId}:offer:${offerNo}:escrow`, postings: escrowPostings(at(ids, mk), betId, mkStake) });
    flows.offersMade++;

    const closeUnmatched = (outcome: "expired" | "declined") => {
      ledger.post({ kind: "BET_REFUND", idempotencyKey: `bet:${betId}:offer:${offerNo}:refund`, postings: refundPostings(at(ids, mk), betId, mkStake) });
      if (outcome === "expired") flows.offersExpired++;
      else flows.offersDeclined++;
      closedBetIds.push(betId);
    };

    // Open-to-all: the first responder who can afford the terms accepts. Open offers cannot be countered.
    if (rng.bernoulli(w.openToAllShare)) {
      for (const i of rng.shuffled(others)) {
        if (rng.bernoulli(respondP(i)) && tkStake <= maxStake(ledger.balance(wallet(i)), w.cap) && rng.bernoulli(w.pAccept)) {
          return match(day, betId, mk, i, mkStake, tkStake, rng, offerNo);
        }
      }
      return closeUnmatched("expired");
    }

    let tk = rng.pick(others);
    for (;;) {
      const seen = offerNo === 1 ? rng.bernoulli(respondP(tk)) : isActive(day, tk) && rng.bernoulli(w.pCounterSeen);
      if (!seen) return closeUnmatched("expired");
      const tkCap = maxStake(ledger.balance(wallet(tk)), w.cap);
      const canCounter = offerNo < w.maxOffersPerChain;
      let counter: { stake: number; ask: number };
      if (tkStake > tkCap) {
        // Wealth constraint binds: the taker counters with proportionally smaller stakes, or declines.
        if (tkCap < 1 || !canCounter) return closeUnmatched("declined");
        const ask = Math.max(1, Math.floor((mkStake * tkCap) / tkStake));
        counter = { stake: tkCap, ask: clampRatio(tkCap, ask) };
      } else {
        const u = rng.next();
        if (u < w.pAccept) return match(day, betId, mk, tk, mkStake, tkStake, rng, offerNo);
        if (u >= w.pAccept + w.pCounter || !canCounter) return closeUnmatched("declined");
        // Counter on better terms for the counterer: risk 20% less for the same upside.
        const stake = Math.max(1, Math.floor(tkStake * 0.8));
        counter = { stake, ask: clampRatio(stake, mkStake) };
      }
      ledger.post({ kind: "BET_REFUND", idempotencyKey: `bet:${betId}:offer:${offerNo}:refund`, postings: refundPostings(at(ids, mk), betId, mkStake) });
      offerNo++;
      flows.counters++;
      [mk, tk] = [tk, mk];
      mkStake = counter.stake;
      tkStake = counter.ask;
      recordStake(mk, mkStake);
      ledger.post({ kind: "BET_ESCROW", idempotencyKey: `bet:${betId}:offer:${offerNo}:escrow`, postings: escrowPostings(at(ids, mk), betId, mkStake) });
    }
  };

  const match = (day: number, betId: string, mk: number, tk: number, mkStake: number, tkStake: number, rng: Rng, offerNo: number) => {
    const err = stakeError(mkStake, tkStake);
    if (err) throw new Error(`invalid stakes ${mkStake}/${tkStake}: ${err}`);
    recordStake(tk, tkStake);
    ledger.post({ kind: "BET_ESCROW", idempotencyKey: `bet:${betId}:offer:${offerNo}:accept`, postings: escrowPostings(at(ids, tk), betId, tkStake) });
    const edge = at(eff, mk).a.skillEdge - at(eff, tk).a.skillEdge;
    openBets.push({
      betId,
      partyA: at(ids, mk),
      partyB: at(ids, tk),
      stakeA: mkStake,
      stakeB: tkStake,
      resolveDay: day + 1 + rng.int(w.resolveDaysMax),
      pAWins: Math.min(0.99, Math.max(0.01, fairWinProbabilityA(mkStake, tkStake) + edge)),
    });
    flows.offersAccepted++;
    flows.wagerVolume += mkStake + tkStake;
  };

  const settleDue = (day: number) => {
    const rng = stream(cfg.seed, "settle", day);
    for (let i = 0; i < openBets.length; ) {
      const bet = at(openBets, i);
      if (bet.resolveDay > day) {
        i++;
        continue;
      }
      openBets.splice(i, 1);
      let outcome: BetOutcome;
      if (rng.bernoulli(w.pVoid) || (rng.bernoulli(w.pDispute) && rng.bernoulli(w.pDisputeVoid))) outcome = "VOID";
      else outcome = rng.bernoulli(bet.pAWins) ? "A_WINS" : "B_WINS";
      const { kind, postings } = settlementPostings(bet, outcome, w.rakeBps);
      ledger.post({ kind, idempotencyKey: `bet:${bet.betId}:settle`, postings });
      const rake = postings.find((p) => p.account === BURN_ACCOUNT)?.delta ?? 0;
      sinks.rake += rake;
      sinks.total += rake;
      if (outcome === "VOID") flows.betsVoided++;
      else flows.betsSettled++;
      closedBetIds.push(bet.betId);
    }
  };

  // ---- Seasons ----
  const seasonsEndingOn = new Map<number, { index: number; start: number; end: number }>();
  if (cfg.seasons.enabled) {
    for (let k = 0; ; k++) {
      const start = cfg.seasons.firstStartDay + k * cfg.seasons.cycleDays;
      const end = start + cfg.seasons.lengthDays - 1;
      if (end > D) break;
      seasonsEndingOn.set(end, { index: k, start, end });
    }
  }

  const runSeason = (s: { index: number; start: number; end: number }) => {
    const sc = cfg.seasons;
    const rng = stream(cfg.seed, "season", s.index);
    const lookback = s.start > 1 ? [Math.max(1, s.start - 2), s.start - 1] : [1, 1];
    const participants: number[] = [];
    for (let p = 0; p < n; p++) {
      const sawOptIn = isActive(at(lookback, 0), p) || isActive(at(lookback, 1), p);
      if (rng.bernoulli(at(eff, p).optIn) && sawOptIn) participants.push(p);
    }
    if (participants.length < sc.minParticipants) {
      seasonStats.skipped++;
      return;
    }
    seasonStats.held++;
    seasonStats.participantSeasons += participants.length;
    const mafia = new Set(rng.shuffled(participants).slice(0, sc.mafiaCount));
    const result: MafiaResult = rng.bernoulli(sc.pDraw) ? "draw" : rng.bernoulli(sc.pTownWin) ? "town" : "mafia";
    const points = participants.map((p) => {
      let activeInSeason = 0;
      let faded = false;
      for (let d = s.start; d <= s.end; d++) {
        if (isActive(d, p)) activeInSeason++;
        else if (d > s.start && !isActive(d - 1, p)) faded = true; // GAMES.md §3.8: 2 consecutive inactive days
      }
      const share = activeInSeason / sc.lengthDays;
      return {
        memberId: String(p),
        points: mafiaSeasonPoints(
          {
            memberId: at(ids, p),
            team: mafia.has(p) ? "mafia" : "town",
            faded,
            aliveAtEnd: !faded && rng.bernoulli(sc.pAliveAtEnd),
            missionCompleted: !faded && rng.bernoulli(sc.pMissionIfFullyActive * share),
          },
          result,
          sc.points,
        ),
      };
    });
    let minted = 0;
    for (const line of allocateSeasonRewards(points, sc.coinsPerPoint, sc.budget)) {
      if (line.coins === 0) continue;
      const p = Number(line.memberId);
      mint("SEASON_REWARD", `season:${s.index}:reward:${at(ids, p)}`, p, line.coins, "season", s.end);
      minted += line.coins;
    }
    seasonStats.rewardsMinted += minted;
    seasonStats.maxSeasonMint = Math.max(seasonStats.maxSeasonMint, minted);
  };

  // ---- Day loop ----
  for (let p = 0; p < n; p++) mint("GENESIS", `genesis:${at(ids, p)}`, p, cfg.issuance.genesis, "genesis", 1);

  for (let day = 1; day <= D; day++) {
    settleDue(day);

    for (let p = 0; p < n; p++) {
      if (!isActive(day, p)) continue;
      activeDays[p] = at(activeDays, p) + 1;
      activity.activePlayerDays++;
      mint("CHECKIN", `checkin:${at(ids, p)}:${day}`, p, cfg.issuance.checkin, "checkin", day);
      if (at(at(digestIntent, day), p)) {
        activity.digestsPosted++;
        const verified = ids.some((_, o) => o !== p && (isActive(day, o) || (cfg.digestGraceNextDay && isActive(day + 1, o))));
        if (verified) {
          activity.digestsVerified++;
          mint("DIGEST", `digest:${at(ids, p)}:${day}`, p, cfg.issuance.digest, "digest", day);
        }
      }
    }

    if (cfg.transfers.enabled) {
      const rng = stream(cfg.seed, "transfer", day);
      for (let p = 0; p < n; p++) {
        if (!isActive(day, p)) continue;
        const send = (to: number, amount: number, tag: string) => {
          if (amount < 1) return;
          ledger.post({ kind: "TRANSFER", idempotencyKey: `${at(ids, p)}:${tag}:${day}`, postings: [{ account: wallet(p), delta: -amount }, { account: wallet(to), delta: amount }] });
          flows.transfers++;
          flows.transferVolume += amount;
        };
        const gift = at(eff, p).a.weeklyGiftBps;
        if (gift > 0 && day % 7 === 0) {
          let poorest = -1;
          for (let o = 0; o < n; o++) {
            if (o !== p && (poorest < 0 || ledger.balance(wallet(o)) < ledger.balance(wallet(poorest)))) poorest = o;
          }
          send(poorest, applyBps(ledger.balance(wallet(p)), gift), "gift");
        }
        if (rng.bernoulli(cfg.transfers.pTradePerActiveDay)) {
          const to = rng.pick(ids.map((_, i) => i).filter((i) => i !== p));
          send(to, applyBps(ledger.balance(wallet(p)), rng.intBetween(1, cfg.transfers.tradeMaxBps)), "trade");
        }
      }
    }

    if (cfg.sinks.enabled) {
      const rng = stream(cfg.seed, "sink", day);
      for (let p = 0; p < n; p++) {
        if (!isActive(day, p) || !rng.bernoulli(cfg.sinks.pPurchasePerActiveDay)) continue;
        const spendable = applyBps(ledger.balance(wallet(p)), cfg.sinks.maxSpendBps);
        const affordable = cfg.sinks.catalog.filter((item) => item.price <= spendable);
        if (affordable.length === 0) continue;
        const item = rng.pick(affordable);
        ledger.post({ kind: "PURCHASE", idempotencyKey: `${at(ids, p)}:purchase:${day}`, postings: [{ account: wallet(p), delta: -item.price }, { account: BURN_ACCOUNT, delta: item.price }] });
        sinks.purchase += item.price;
        sinks.total += item.price;
      }
    }

    if (w.enabled) {
      const rng = stream(cfg.seed, "wager", day);
      for (const p of rng.shuffled(ids.map((_, i) => i))) {
        if (!isActive(day, p)) continue;
        const count = Math.min(w.maxOffersPerMemberPerDay, rng.poisson(at(eff, p).offers));
        for (let k = 0; k < count; k++) makeOffer(day, p, rng);
      }
    }

    const season = seasonsEndingOn.get(day);
    if (season) runSeason(season);

    // Checks: I1/I4/I10 ran on every post; here I2/I3/I4 run daily and I6 for open bets.
    ledger.assertInvariants(false);
    for (const bet of openBets) {
      const held = ledger.balance(betEscrowAccount(bet.betId));
      if (held !== bet.stakeA + bet.stakeB) throw new Error(`I6 escrow ${bet.betId} holds ${held}`);
    }

    const wallets = ids.map((_, p) => ledger.balance(wallet(p)));
    wallets.forEach((b, p) => {
      if (b > at(peak, p)) peak[p] = b;
      if (walletMilestoneDay[p] === null && b >= cfg.milestone) walletMilestoneDay[p] = day;
    });
    const nearZero = wallets.filter((b) => b < cfg.nearZeroThreshold).length;
    nearZeroPlayerDays += nearZero;
    const supply = -ledger.balance(MINT_ACCOUNT) - ledger.balance(BURN_ACCOUNT);
    daily.push({
      day,
      supply,
      escrow: supply - wallets.reduce((s, b) => s + b, 0),
      medianWallet: median(wallets),
      maxWallet: Math.max(...wallets),
      gini: gini(wallets),
      nearZeroWallets: nearZero,
    });
  }

  // Full audit: I5 (recompute from log) and I6 for closed bets.
  ledger.assertInvariants(true);
  for (const id of closedBetIds) {
    const held = ledger.balance(betEscrowAccount(id));
    if (held !== 0) throw new Error(`I6 closed bet ${id} still holds ${held}`);
  }
  flows.escrowOutstanding = openBets.reduce((s, b) => s + b.stakeA + b.stakeB, 0);

  const wallets = ids.map((_, p) => ledger.balance(wallet(p)));
  const supply = -ledger.balance(MINT_ACCOUNT) - ledger.balance(BURN_ACCOUNT);
  const projected = lifetimeMinted.map((m) => (m > 0 ? Math.ceil((cfg.milestone * D) / m) : Number.POSITIVE_INFINITY));

  return {
    seed: cfg.seed,
    days: D,
    engagement: cfg.engagement,
    players: ids.map((id, p) => ({
      id,
      finalBalance: at(wallets, p),
      peakBalance: at(peak, p),
      lifetimeMinted: at(lifetimeMinted, p),
      activeDays: at(activeDays, p),
      walletMilestoneDay: at(walletMilestoneDay, p),
      lifetimeMilestoneDay: at(lifetimeMilestoneDay, p),
    })),
    daily,
    sources,
    sinks,
    flows,
    seasons: seasonStats,
    activity,
    conservation: {
      transactions: ledger.transactionCount,
      postings: ledger.postingsChecked,
      invariantChecks: ledger.invariantChecks,
      byKind: Object.fromEntries([...ledger.countByKind.entries()].sort(([a], [b]) => a.localeCompare(b))),
    },
    summary: {
      supply,
      medianWallet: median(wallets),
      maxWallet: Math.max(...wallets),
      meanWallet: mean(wallets),
      gini: gini(wallets),
      nearZeroPlayerDayShare: nearZeroPlayerDays / (n * D),
      nearZeroAtEnd: wallets.filter((b) => b < cfg.nearZeroThreshold).length,
      walletMilestonePlayers: walletMilestoneDay.filter((d) => d !== null).length,
      lifetimeMilestonePlayers: lifetimeMilestoneDay.filter((d) => d !== null).length,
      dailyMintPerActivePlayerDay: activity.activePlayerDays === 0 ? 0 : (sources.checkin + sources.digest) / activity.activePlayerDays,
      seasonCoinsPerParticipant: seasonStats.participantSeasons === 0 ? 0 : seasonStats.rewardsMinted / seasonStats.participantSeasons,
      mintedPerPlayer: sources.total / n,
      medianProjectedDaysToLifetimeMilestone: median(projected),
    },
  };
}
