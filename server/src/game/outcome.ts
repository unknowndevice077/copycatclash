import { DRAW_THRESHOLD, maxRounds, teamRecord, type ScoreDetail, type TeamId } from '@ccc/shared';

export interface RoundDecision {
  winner: TeamId | 'draw';
  /** Points awarded this round per team. */
  points: Record<TeamId, number>;
}

/**
 * Decides a round between any number of sides. Everyone within DRAW_THRESHOLD of the best score
 * shares the round (+1 each) unless pixel tie-break is on. Any real attempt beats a blank canvas.
 * With two sides this is the classic head-to-head rule.
 */
export function decideRound(details: Partial<Record<TeamId, ScoreDetail>>, teams: TeamId[], tieBreakByPixels: boolean): RoundDecision {
  const points = teamRecord(() => 0);
  const drawn = teams.filter((t) => details[t] && details[t]?.source !== 'blank');
  if (!drawn.length) return { winner: 'draw', points };
  const score = (t: TeamId) => details[t]?.score ?? 0;
  const best = Math.max(...drawn.map(score));
  let top = drawn.filter((t) => best - score(t) < DRAW_THRESHOLD);
  if (top.length > 1 && tieBreakByPixels) {
    const px = (t: TeamId) => details[t]?.pixelScore ?? 0;
    const bestPx = Math.max(...top.map(px));
    const byPx = top.filter((t) => px(t) === bestPx);
    if (byPx.length === 1) top = byPx;
  }
  if (top.length === 1) {
    points[top[0]] = 1;
    return { winner: top[0], points };
  }
  for (const t of top) points[t] = 1;
  return { winner: 'draw', points };
}

export type MatchProgress = { kind: 'continue'; suddenDeath: boolean } | { kind: 'finished'; winner: TeamId | 'draw' };

const MAX_SUDDEN_DEATH_ROUNDS = 3;

/** The side with the highest score, or 'draw' when two or more share it. */
export function leaderOf(score: Record<TeamId, number>, teams: TeamId[]): TeamId | 'draw' {
  const best = Math.max(...teams.map((t) => score[t]));
  const top = teams.filter((t) => score[t] === best);
  return top.length === 1 ? top[0] : 'draw';
}

/**
 * First to `roundsToWin`; best of (2n-1); a shared lead at the end goes to sudden death with a fresh
 * photo until one side leads outright.
 */
export function matchProgress(opts: {
  score: Record<TeamId, number>;
  teams: TeamId[];
  roundsPlayed: number;
  roundsToWin: number;
  suddenDeathRoundsPlayed: number;
  inSuddenDeath: boolean;
}): MatchProgress {
  const { score, teams, roundsToWin } = opts;
  const leader = leaderOf(score, teams);

  if (opts.inSuddenDeath) {
    if (leader !== 'draw') return { kind: 'finished', winner: leader };
    if (opts.suddenDeathRoundsPlayed >= MAX_SUDDEN_DEATH_ROUNDS) return { kind: 'finished', winner: 'draw' };
    return { kind: 'continue', suddenDeath: true };
  }

  const someoneReached = teams.some((t) => score[t] >= roundsToWin);
  const outOfRounds = opts.roundsPlayed >= maxRounds(roundsToWin);
  if (someoneReached || outOfRounds) {
    if (leader !== 'draw') return { kind: 'finished', winner: leader };
    return { kind: 'continue', suddenDeath: true };
  }
  return { kind: 'continue', suddenDeath: false };
}
