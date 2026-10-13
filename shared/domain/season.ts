// Season reward rules (ECONOMY.md §5.3, GAMES.md §4). Mafia v0.1 points table.

export interface MafiaPointsTable {
  readonly win: number;
  readonly draw: number;
  readonly participation: number;
  readonly aliveAtEnd: number;
  readonly mission: number;
}

export const MAFIA_POINTS_V0_1: MafiaPointsTable = { win: 6, draw: 3, participation: 2, aliveAtEnd: 1, mission: 2 };

export type MafiaTeam = "town" | "mafia";
export type MafiaResult = "town" | "mafia" | "draw";

export interface MafiaPlayerResult {
  readonly memberId: string;
  readonly team: MafiaTeam;
  readonly faded: boolean;
  readonly aliveAtEnd: boolean;
  readonly missionCompleted: boolean;
}

export function mafiaSeasonPoints(player: MafiaPlayerResult, result: MafiaResult, table: MafiaPointsTable = MAFIA_POINTS_V0_1): number {
  if (player.faded) return 0;
  let points = table.participation;
  if (result === "draw") points += table.draw;
  else if (result === player.team) points += table.win;
  if (player.aliveAtEnd) points += table.aliveAtEnd;
  if (player.missionCompleted) points += table.mission;
  return points;
}

export interface RewardLine {
  readonly memberId: string;
  readonly coins: number;
}

/**
 * coins = points × coinsPerPoint. If the total exceeds the budget, each line becomes
 * floor(line × budget / total). Remainders are not minted, so the sum never exceeds the budget (I8).
 */
export function allocateSeasonRewards(
  points: readonly { readonly memberId: string; readonly points: number }[],
  coinsPerPoint: number,
  budget: number,
): RewardLine[] {
  for (const n of [coinsPerPoint, budget]) {
    if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`coinsPerPoint and budget must be non-negative integers, got ${n}`);
  }
  const raw = points.map((p) => {
    if (!Number.isSafeInteger(p.points) || p.points < 0) throw new RangeError(`points must be non-negative integers, got ${p.points}`);
    return { memberId: p.memberId, coins: p.points * coinsPerPoint };
  });
  const total = raw.reduce((s, l) => s + l.coins, 0);
  if (total <= budget) return raw;
  return raw.map((l) => ({ memberId: l.memberId, coins: Math.floor((l.coins * budget) / total) }));
}
