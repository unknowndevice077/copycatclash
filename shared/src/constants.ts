export const GAME_NAME = 'Copy Cat Clash';

/** Logical drawing resolution. All stroke coordinates live in this space. */
export const CANVAS_W = 1024;
export const CANVAS_H = 768;

/** Size images are normalised to before being sent to the AI judge. */
export const SCORE_W = 768;
export const SCORE_H = 576;

export const TEAM_IDS = ['A', 'B'] as const;
export type TeamId = (typeof TEAM_IDS)[number];

export const TEAM_SIZES = ['1v1', '2v2', '3v3'] as const;
export type TeamSize = (typeof TEAM_SIZES)[number];
export const TEAM_SIZE_COUNT: Record<TeamSize, number> = { '1v1': 1, '2v2': 2, '3v3': 3 };

export const GAME_MODES = [
  'classic',
  'speed',
  'memory',
  'relay',
  'colorLock',
  'mirror',
  'limitedPalette',
] as const;
export type GameMode = (typeof GAME_MODES)[number];

export const PHOTO_CATEGORIES = [
  'animals',
  'landscapes',
  'food',
  'buildings',
  'objects',
  'vehicles',
  'abstract',
] as const;
export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number];

/** Picture styles. "simple" = bold flat illustrations made for quick drawing; "photos" = real photographs. */
export const PHOTO_THEMES = ['simple', 'photos'] as const;
export type PhotoTheme = (typeof PHOTO_THEMES)[number];
export const THEME_LABELS: Record<PhotoTheme, string> = { simple: 'Simple pictures', photos: 'Real photos' };
export const DEFAULT_THEMES: PhotoTheme[] = ['simple'];

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export interface ModePreset {
  label: string;
  blurb: string;
  peekMs: number;
  drawMs: number;
  thumbnailVisible: boolean;
  difficulties: Difficulty[];
  relay: boolean;
  relayTurnMs: number;
  colorLock: boolean;
  mirror: boolean;
  limitedPalette: boolean;
  /** Modes that require more than one player per team. */
  teamOnly: boolean;
}

export const MODE_PRESETS: Record<GameMode, ModePreset> = {
  classic: {
    label: 'Classic',
    blurb: '5s peek, 45s draw, photo stays as a thumbnail.',
    peekMs: 5000,
    drawMs: 45000,
    thumbnailVisible: true,
    difficulties: ['easy', 'medium', 'hard'],
    relay: false,
    relayTurnMs: 15000,
    colorLock: false,
    mirror: false,
    limitedPalette: false,
    teamOnly: false,
  },
  speed: {
    label: 'Speed Round',
    blurb: '20 seconds. Simple photos. Go go go!',
    peekMs: 4000,
    drawMs: 20000,
    thumbnailVisible: true,
    difficulties: ['easy'],
    relay: false,
    relayTurnMs: 10000,
    colorLock: false,
    mirror: false,
    limitedPalette: false,
    teamOnly: false,
  },
  memory: {
    label: 'Memory',
    blurb: 'Study it for 5s, then it vanishes.',
    peekMs: 5000,
    drawMs: 45000,
    thumbnailVisible: false,
    difficulties: ['easy', 'medium'],
    relay: false,
    relayTurnMs: 15000,
    colorLock: false,
    mirror: false,
    limitedPalette: false,
    teamOnly: false,
  },
  relay: {
    label: 'Relay',
    blurb: 'Teammates take turns holding the brush.',
    peekMs: 5000,
    drawMs: 60000,
    thumbnailVisible: true,
    difficulties: ['easy', 'medium', 'hard'],
    relay: true,
    relayTurnMs: 15000,
    colorLock: false,
    mirror: false,
    limitedPalette: false,
    teamOnly: true,
  },
  colorLock: {
    label: 'Color Lock',
    blurb: 'Each teammate owns their own slice of the palette.',
    peekMs: 5000,
    drawMs: 45000,
    thumbnailVisible: true,
    difficulties: ['easy', 'medium', 'hard'],
    relay: false,
    relayTurnMs: 15000,
    colorLock: true,
    mirror: false,
    limitedPalette: false,
    teamOnly: true,
  },
  mirror: {
    label: 'Mirror Match',
    blurb: 'The photo is flipped. So is your brain.',
    peekMs: 5000,
    drawMs: 45000,
    thumbnailVisible: true,
    difficulties: ['easy', 'medium'],
    relay: false,
    relayTurnMs: 15000,
    colorLock: false,
    mirror: true,
    limitedPalette: false,
    teamOnly: false,
  },
  limitedPalette: {
    label: 'Limited Palette',
    blurb: 'Only six colors. Make them count.',
    peekMs: 5000,
    drawMs: 45000,
    thumbnailVisible: true,
    difficulties: ['easy', 'medium', 'hard'],
    relay: false,
    relayTurnMs: 15000,
    colorLock: false,
    mirror: false,
    limitedPalette: true,
    teamOnly: false,
  },
};

/** Ranked queue is Classic only; everything else is casual or custom. */
export const RANKED_MODE: GameMode = 'classic';

export const PALETTE_24 = [
  '#000000', '#4a4a4a', '#9b9b9b', '#ffffff',
  '#7a1f1f', '#e53935', '#ff8a80', '#ff7043',
  '#8d5524', '#f4a261', '#ffd166', '#fff59d',
  '#2e7d32', '#66bb6a', '#b9f6ca', '#00897b',
  '#0d47a1', '#1e88e5', '#81d4fa', '#3949ab',
  '#6a1b9a', '#ab47bc', '#f48fb1', '#c2a878',
] as const;

export const LIMITED_PALETTE_6 = ['#000000', '#ffffff', '#e53935', '#ffd166', '#1e88e5', '#2e7d32'] as const;

/** Colors used for teammate cursor labels (slot order). Distinct from team colors. */
export const TEAMMATE_LABEL_COLORS = ['#ffd23f', '#3bceac', '#ee4266'] as const;

export const TEAM_COLORS: Record<TeamId, { main: string; soft: string; name: string; icon: string }> = {
  A: { main: '#ff5a5f', soft: '#ffb3b5', name: 'Team Coral', icon: '▲' },
  B: { main: '#2d7dff', soft: '#a9c8ff', name: 'Team Volt', icon: '●' },
};

export const BRUSH_SIZES = [4, 10, 22, 44] as const;
export const ERASER_RADIUS = 18;
export const FILL_TOLERANCE = 48;

export const MATCH_TIMINGS = {
  matchFoundMs: 3000,
  teamIntroMs: 4000,
  scoringMinMs: 2500,
  scoringMaxMs: 9000,
  showdownMs: 9000,
  resultLingerMs: 90_000,
};

export const RECONNECT_WINDOW_MS = 45_000;
export const GHOST_OFFER_AFTER_MS = 20_000;
export const GHOST_ELO_FACTOR = 0.5;
export const DRAW_THRESHOLD = 2;

export const ROUNDS_TO_WIN_DEFAULT = 5;
export const ROUNDS_TO_WIN_MIN = 3;
export const ROUNDS_TO_WIN_MAX = 7;

export const MATCHMAKING = {
  baseWindow: 100,
  widenBy: 50,
  widenEveryMs: 5000,
  maxWindow: 400,
  tickMs: 1000,
};

export const ELO = {
  start: 1000,
  k: 32,
  kProvisional: 48,
  provisionalGames: 10,
  forfeitStayerFactor: 0.5,
};

export const STROKE_LIMITS = {
  maxPointsPerBatch: 240,
  maxPointsPerStroke: 6000,
  maxOpsPerTeamRound: 3000,
  maxSize: 64,
  minSize: 1,
};

export const NAME_LIMITS = { min: 2, max: 16 };
export const CHAT_MAX_LEN = 200;

export const EMOTES = [
  { id: 'gg', label: 'GG', glyph: '🤝' },
  { id: 'lol', label: 'LOL', glyph: '😂' },
  { id: 'wow', label: 'Wow', glyph: '😮' },
  { id: 'fire', label: 'Fire', glyph: '🔥' },
  { id: 'art', label: 'Art!', glyph: '🎨' },
  { id: 'cry', label: 'Nooo', glyph: '😭' },
] as const;
export type EmoteId = (typeof EMOTES)[number]['id'];

export const XP_RULES = { win: 100, loss: 40, draw: 60, perRoundWon: 10, dailyBonus: 50 };

export const MAX_PARTY_SIZE = 3;
