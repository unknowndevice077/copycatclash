import { TEAM_COLORS, VERSUS_TEAMS, type MatchPlayer, type MatchRules, type TeamId } from '@ccc/shared';

/** Sides in play: A and B, or one per player in a free-for-all. */
export function sidesOf(rules: Pick<MatchRules, 'teamIds'> | null): TeamId[] {
  return rules?.teamIds ?? VERSUS_TEAMS;
}

export function isFfa(rules: Pick<MatchRules, 'format'> | null): boolean {
  return rules?.format === 'ffa';
}

/** How a side is named on screen: the player's name in a free-for-all, the team name otherwise. */
export function sideName(team: TeamId, rules: Pick<MatchRules, 'format'> | null, players: MatchPlayer[], myTeam: TeamId | null): string {
  if (!isFfa(rules)) return TEAM_COLORS[team].name;
  if (team === myTeam) return 'You';
  return players.find((p) => p.team === team)?.name ?? TEAM_COLORS[team].name;
}

/** Score line: "3 – 2" for two sides; "You 3 · best 4" in a free-for-all. */
export function scoreLine(score: Partial<Record<TeamId, number>>, sides: TeamId[], myTeam: TeamId | null): string {
  if (sides.length === 2) return `${score[sides[0]] ?? 0} – ${score[sides[1]] ?? 0}`;
  const best = Math.max(...sides.map((t) => score[t] ?? 0));
  return myTeam ? `You ${score[myTeam] ?? 0} · best ${best}` : `Best ${best}`;
}
