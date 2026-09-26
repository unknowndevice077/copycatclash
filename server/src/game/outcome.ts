import { DRAW_THRESHOLD, maxRounds, type ScoreDetail, type TeamId } from '@ccc/shared';

export interface RoundDecision {
  winner: TeamId | 'draw';
  /** Points awarded this round per team. */
  points: Record<TeamId, number>;
}

/** Decides a round. Differences under DRAW_THRESHOLD are draws (+1 each) unless pixel tie-break is on. */
export function decideRound(a: ScoreDetail, b: ScoreDetail, tieBreakByPixels: boolean): RoundDecision {
  if (a.source === 'blank' && b.source === 'blank') return { winner: 'draw', points: { A: 0, B: 0 } };
  // Any real attempt beats an empty canvas, even if the attempt also scored ~0.
  if (a.source === 'blank') return { winner: 'B', points: { A: 0, B: 1 } };
  if (b.source === 'blank') return { winner: 'A', points: { A: 1, B: 0 } };
  const diff = a.score - b.score;
  if (Math.abs(diff) >= DRAW_THRESHOLD) {
    const winner: TeamId = diff > 0 ? 'A' : 'B';
    return { winner, points: { A: winner === 'A' ? 1 : 0, B: winner === 'B' ? 1 : 0 } };
  }
  if (tieBreakByPixels && a.pixelScore !== b.pixelScore) {
    const winner: TeamId = a.pixelScore > b.pixelScore ? 'A' : 'B';
    return { winner, points: { A: winner === 'A' ? 1 : 0, B: winner === 'B' ? 1 : 0 } };
  }
  return { winner: 'draw', points: { A: 1, B: 1 } };
}

export type MatchProgress = { kind: 'continue'; suddenDeath: boolean } | { kind: 'finished'; winner: TeamId | 'draw' };

const MAX_SUDDEN_DEATH_ROUNDS = 3;

/** First to `roundsToWin`; best of (2n-1); level scores at the end go to sudden death with a fresh photo. */
export function matchProgress(opts: {
  score: Record<TeamId, number>;
  roundsPlayed: number;
  roundsToWin: number;
  suddenDeathRoundsPlayed: number;
  lastWinner: TeamId | 'draw';
  inSuddenDeath: boolean;
}): MatchProgress {
  const { score, roundsToWin } = opts;
  const leader: TeamId | 'draw' = score.A === score.B ? 'draw' : score.A > score.B ? 'A' : 'B';

  if (opts.inSuddenDeath) {
    if (opts.lastWinner !== 'draw') return { kind: 'finished', winner: opts.lastWinner };
    if (opts.suddenDeathRoundsPlayed >= MAX_SUDDEN_DEATH_ROUNDS) return { kind: 'finished', winner: 'draw' };
    return { kind: 'continue', suddenDeath: true };
  }

  const someoneReached = score.A >= roundsToWin || score.B >= roundsToWin;
  const outOfRounds = opts.roundsPlayed >= maxRounds(roundsToWin);
  if (someoneReached || outOfRounds) {
    if (leader !== 'draw') return { kind: 'finished', winner: leader };
    return { kind: 'continue', suddenDeath: true };
  }
  return { kind: 'continue', suddenDeath: false };
}
