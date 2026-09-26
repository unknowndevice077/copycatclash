import { XP_RULES, levelFromXp } from '@ccc/shared';
import type { PlayerRow } from '../db/repos/players';

export interface ProgressResult {
  xp: number;
  gained: number;
  level: number;
  leveledUp: boolean;
  winStreak: number;
  bestWinStreak: number;
  dailyStreak: number;
  lastDailyDate: string;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** XP, win streak and daily streak after a finished match. */
export function applyMatchProgress(row: PlayerRow, result: 'win' | 'loss' | 'draw', roundsWon: number, xpFactor = 1): ProgressResult {
  const today = isoDay(new Date());
  const yesterday = isoDay(new Date(Date.now() - 86_400_000));
  let dailyStreak = row.daily_streak;
  let dailyBonus = 0;
  if (row.last_daily_date !== today) {
    dailyStreak = row.last_daily_date === yesterday ? dailyStreak + 1 : 1;
    dailyBonus = XP_RULES.dailyBonus;
  }

  const base = result === 'win' ? XP_RULES.win : result === 'draw' ? XP_RULES.draw : XP_RULES.loss;
  const gained = Math.round((base + roundsWon * XP_RULES.perRoundWon) * xpFactor) + dailyBonus;
  const xp = row.xp + gained;
  const before = levelFromXp(row.xp).level;
  const after = levelFromXp(xp).level;
  const winStreak = result === 'win' ? row.win_streak + 1 : result === 'draw' ? row.win_streak : 0;

  return {
    xp,
    gained,
    level: after,
    leveledUp: after > before,
    winStreak,
    bestWinStreak: Math.max(row.best_win_streak, winStreak),
    dailyStreak,
    lastDailyDate: today,
  };
}
