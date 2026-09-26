import { ELO } from '@ccc/shared';

export function expectedScore(teamElo: number, opponentElo: number): number {
  return 1 / (1 + 10 ** ((opponentElo - teamElo) / 400));
}

export function kFactor(gamesPlayed: number): number {
  return gamesPlayed < ELO.provisionalGames ? ELO.kProvisional : ELO.k;
}

export function average(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : ELO.start;
}

/**
 * Per-player Elo delta. Team Elo is the average of members; each player uses their own K
 * so newcomers settle faster. `factor` scales the change (ghost matches, forfeit stayers).
 */
export function eloDelta(opts: {
  teamElo: number;
  opponentElo: number;
  actual: 0 | 0.5 | 1;
  gamesPlayed: number;
  factor?: number;
}): number {
  const e = expectedScore(opts.teamElo, opts.opponentElo);
  return kFactor(opts.gamesPlayed) * (opts.actual - e) * (opts.factor ?? 1);
}
