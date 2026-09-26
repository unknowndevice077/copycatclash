import type { RankInfo } from './types';

type Tier = RankInfo['tier'];
type Division = Exclude<RankInfo['division'], null>;

interface Step {
  tier: Tier;
  division: Division | null;
  floor: number;
}

const DIVS: Division[] = ['III', 'II', 'I'];
const TIERS: Tier[] = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'];

/** Bronze III starts at 0, every division spans 100 Elo, Master starts at 2150. */
const STEPS: Step[] = [
  { tier: 'Bronze', division: 'III', floor: 0 },
  { tier: 'Bronze', division: 'II', floor: 750 },
  { tier: 'Bronze', division: 'I', floor: 850 },
  ...TIERS.slice(1).flatMap((tier, t) =>
    DIVS.map((division, d) => ({ tier, division, floor: 950 + t * 300 + d * 100 })),
  ),
  { tier: 'Master', division: null, floor: 2150 },
];

export function rankFromElo(eloRaw: number): RankInfo {
  const elo = Math.max(0, Math.round(eloRaw));
  let idx = 0;
  for (let i = 0; i < STEPS.length; i++) if (elo >= STEPS[i].floor) idx = i;
  const step = STEPS[idx];
  const next = STEPS[idx + 1];
  const ceiling = next ? next.floor : null;
  const span = ceiling === null ? 400 : ceiling - step.floor;
  const progress = Math.min(1, (elo - step.floor) / span);
  return {
    tier: step.tier,
    division: step.division,
    label: step.division ? `${step.tier} ${step.division}` : step.tier,
    progress,
    floor: step.floor,
    ceiling,
  };
}

export function rankOrder(rank: RankInfo): number {
  return STEPS.findIndex((s) => s.tier === rank.tier && s.division === rank.division);
}

export const TIER_COLORS: Record<Tier, string> = {
  Bronze: '#c77b43',
  Silver: '#b8c4d6',
  Gold: '#ffc83d',
  Platinum: '#53e3c8',
  Diamond: '#7fb2ff',
  Master: '#d772ff',
};

/** XP needed to go from `level` to `level + 1`. */
export function xpForLevel(level: number): number {
  return 200 + 100 * (level - 1);
}

export function levelFromXp(xp: number): { level: number; xpIntoLevel: number; xpForNextLevel: number } {
  let level = 1;
  let remaining = Math.max(0, Math.floor(xp));
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level++;
  }
  return { level, xpIntoLevel: remaining, xpForNextLevel: xpForLevel(level) };
}
