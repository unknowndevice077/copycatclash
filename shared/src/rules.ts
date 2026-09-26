import {
  DEFAULT_THEMES,
  DIFFICULTIES,
  LIMITED_PALETTE_6,
  MODE_PRESETS,
  PALETTE_24,
  PHOTO_CATEGORIES,
  ROUNDS_TO_WIN_DEFAULT,
  TEAM_IDS,
  TEAM_SIZE_COUNT,
  VERSUS_TEAMS,
  type GameMode,
  type TeamId,
  type TeamSize,
} from './constants';
import type { MatchRules, RoomSettings } from './types';

export function rulesForQueue(mode: GameMode, teamSize: TeamSize, ranked: boolean): MatchRules {
  const p = MODE_PRESETS[mode];
  return {
    mode,
    format: 'teams',
    teamIds: [...VERSUS_TEAMS],
    teamSize,
    ranked,
    ghost: false,
    custom: false,
    roundsToWin: ROUNDS_TO_WIN_DEFAULT,
    peekMs: p.peekMs,
    drawMs: p.drawMs,
    thumbnailVisible: p.thumbnailVisible,
    relay: p.relay && TEAM_SIZE_COUNT[teamSize] > 1,
    relayTurnMs: p.relayTurnMs,
    colorLock: p.colorLock && TEAM_SIZE_COUNT[teamSize] > 1,
    mirror: p.mirror,
    limitedPalette: p.limitedPalette,
    themes: [...DEFAULT_THEMES],
    categories: [...PHOTO_CATEGORIES],
    difficulties: [...p.difficulties],
    opponentPreview: false,
    allowSpectators: false,
    tieBreakByPixels: false,
  };
}

/** `teamIds` are the seats actually taken (free-for-all rooms only fill some of A..E). */
export function rulesForRoom(s: RoomSettings, teamIds: TeamId[] = [...VERSUS_TEAMS]): MatchRules {
  const multi = s.format === 'teams' && TEAM_SIZE_COUNT[s.teamSize] > 1;
  return {
    mode: s.mode,
    format: s.format,
    teamIds,
    teamSize: s.format === 'ffa' ? '1v1' : s.teamSize,
    ranked: false,
    ghost: false,
    custom: true,
    roundsToWin: s.roundsToWin,
    peekMs: s.peekSec * 1000,
    drawMs: s.drawSec * 1000,
    thumbnailVisible: s.thumbnailVisible && !s.memory,
    relay: s.relay && multi,
    relayTurnMs: s.relayTurnSec * 1000,
    colorLock: s.colorLock && multi,
    mirror: s.mirror,
    limitedPalette: s.limitedPalette,
    themes: [...s.themes],
    categories: [...s.categories],
    difficulties: [...s.difficulties],
    opponentPreview: s.opponentPreview,
    allowSpectators: s.allowSpectators,
    tieBreakByPixels: false,
  };
}

export function defaultRoomSettings(mode: GameMode = 'classic', teamSize: TeamSize = '2v2'): RoomSettings {
  const p = MODE_PRESETS[mode];
  return {
    mode,
    format: 'teams',
    teamSize,
    roundsToWin: ROUNDS_TO_WIN_DEFAULT,
    peekSec: Math.round(p.peekMs / 1000),
    drawSec: Math.round(p.drawMs / 1000),
    themes: [...DEFAULT_THEMES],
    categories: [...PHOTO_CATEGORIES],
    difficulties: [...p.difficulties],
    thumbnailVisible: p.thumbnailVisible,
    memory: !p.thumbnailVisible,
    relay: p.relay,
    relayTurnSec: Math.round(p.relayTurnMs / 1000),
    colorLock: p.colorLock,
    mirror: p.mirror,
    limitedPalette: p.limitedPalette,
    opponentPreview: false,
    allowSpectators: true,
    isPrivate: true,
    useUploadedPhotos: false,
  };
}

/** A value for every side, e.g. `teamRecord(() => 0)` for a blank scoreboard. */
export function teamRecord<T>(make: (team: TeamId) => T): Record<TeamId, T> {
  return Object.fromEntries(TEAM_IDS.map((t) => [t, make(t)])) as Record<TeamId, T>;
}

export function basePalette(rules: Pick<MatchRules, 'limitedPalette'>): string[] {
  return rules.limitedPalette ? [...LIMITED_PALETTE_6] : [...PALETTE_24];
}

/** Color Lock splits the palette into interleaved, disjoint slices per teammate. */
export function allowedColorsFor(rules: Pick<MatchRules, 'limitedPalette' | 'colorLock' | 'teamSize'>, slot: number): string[] | null {
  if (!rules.colorLock) return rules.limitedPalette ? basePalette(rules) : null;
  const palette = basePalette(rules);
  const size = TEAM_SIZE_COUNT[rules.teamSize];
  // White stays shared so everyone can make highlights.
  const shared = palette.filter((c) => c === '#ffffff');
  const rest = palette.filter((c) => c !== '#ffffff');
  return [...rest.filter((_, i) => i % size === slot % size), ...shared];
}

export function customColorAllowed(rules: Pick<MatchRules, 'limitedPalette' | 'colorLock'>): boolean {
  return !rules.limitedPalette && !rules.colorLock;
}

export function maxRounds(roundsToWin: number): number {
  return roundsToWin * 2 - 1;
}

export function isValidDifficultyList(list: string[]): boolean {
  return list.every((d) => (DIFFICULTIES as readonly string[]).includes(d));
}
