import type { Difficulty, EmoteId, GameMode, PhotoCategory, PhotoTheme, TeamId, TeamSize } from './constants';

export type Ack<T = undefined> = { ok: true; data: T } | { ok: false; error: string; code?: string };

export interface RankInfo {
  tier: 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond' | 'Master';
  division: 'I' | 'II' | 'III' | null;
  label: string;
  /** 0..1 progress towards the next division. */
  progress: number;
  floor: number;
  ceiling: number | null;
}

export interface RatingSummary {
  elo: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  rank: RankInfo;
}

export interface PlayerProfile {
  id: string;
  name: string;
  username: string | null;
  isGuest: boolean;
  level: number;
  xp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  winStreak: number;
  bestWinStreak: number;
  dailyStreak: number;
  ratings: Record<TeamSize, RatingSummary>;
  queueBanUntil: number | null;
}

export interface PublicPlayer {
  id: string;
  name: string;
  level: number;
  elo: number;
  rank: RankInfo;
  isGhost: boolean;
}

export interface MatchPlayer extends PublicPlayer {
  team: TeamId;
  slot: number;
  labelColor: string;
  connected: boolean;
  /** Null means every color the rules allow. */
  allowedColors: string[] | null;
}

export interface MatchRules {
  mode: GameMode;
  teamSize: TeamSize;
  ranked: boolean;
  ghost: boolean;
  custom: boolean;
  roundsToWin: number;
  peekMs: number;
  drawMs: number;
  thumbnailVisible: boolean;
  relay: boolean;
  relayTurnMs: number;
  colorLock: boolean;
  mirror: boolean;
  limitedPalette: boolean;
  themes: PhotoTheme[];
  categories: PhotoCategory[];
  difficulties: Difficulty[];
  opponentPreview: boolean;
  allowSpectators: boolean;
  tieBreakByPixels: boolean;
}

export type MatchPhase = 'MATCH_FOUND' | 'TEAM_INTRO' | 'PEEK' | 'DRAW' | 'SCORING' | 'SHOWDOWN' | 'MATCH_RESULT';

export interface StrokeOp {
  kind: 'stroke';
  id: string;
  playerId: string;
  color: string;
  size: number;
  /** Flat [x, y, pressure, x, y, pressure, ...] in logical canvas space. */
  points: number[];
  /** ms since the draw phase started, one entry per point (used for time-lapse). */
  times: number[];
  done: boolean;
  hidden: boolean;
}

export interface FillOp {
  kind: 'fill';
  id: string;
  playerId: string;
  color: string;
  x: number;
  y: number;
  t: number;
  hidden: boolean;
}

export type DrawOp = StrokeOp | FillOp;

export interface RelayState {
  activePlayerId: string | null;
  turnEndsAt: number;
  order: string[];
}

export interface PhaseInfo {
  phase: MatchPhase;
  phaseEndsAt: number;
  serverNow: number;
  round: number;
  score: Record<TeamId, number>;
  suddenDeath: boolean;
  relay: Record<TeamId, RelayState | null>;
  aiDegraded: boolean;
}

export interface MatchSnapshot extends PhaseInfo {
  matchId: string;
  rules: MatchRules;
  players: MatchPlayer[];
  myTeam: TeamId | null;
  spectator: boolean;
  /** Ops visible to this client: own team (players) or both teams (spectators). */
  ops: Record<TeamId, DrawOp[]>;
  photoUrl: string | null;
  rounds: RoundSummary[];
  lastShowdown: ShowdownPayload | null;
  result: MatchResultPayload | null;
  rematchVotes: string[];
}

export type ScoreSource = 'ai' | 'fallback' | 'blank';

export interface ScoreDetail {
  score: number;
  reason: string;
  source: ScoreSource;
  estimated: boolean;
  pixelScore: number;
}

export interface Attribution {
  provider: 'local' | 'unsplash' | 'upload';
  title: string;
  author: string | null;
  sourceUrl: string | null;
  license: string;
  licenseUrl: string | null;
}

export interface Contribution {
  playerId: string;
  pct: number;
}

export interface TeamRoundResult {
  detail: ScoreDetail;
  imageUrl: string;
  contributions: Contribution[];
}

export interface ShowdownPayload {
  round: number;
  suddenDeath: boolean;
  referenceUrl: string;
  mirrored: boolean;
  attribution: Attribution;
  teams: Record<TeamId, TeamRoundResult>;
  winner: TeamId | 'draw';
  scoreAfter: Record<TeamId, number>;
}

export interface RoundSummary {
  round: number;
  photoTitle: string;
  referenceUrl: string;
  mirrored: boolean;
  images: Record<TeamId, string>;
  scores: Record<TeamId, number>;
  winner: TeamId | 'draw';
  estimated: boolean;
}

export interface EloChange {
  before: number;
  after: number;
  delta: number;
  rankBefore: RankInfo;
  rankAfter: RankInfo;
}

export interface MatchResultPayload {
  winner: TeamId | 'draw';
  finalScore: Record<TeamId, number>;
  forfeit: boolean;
  mvpPlayerId: string | null;
  eloChanges: Record<string, EloChange>;
  xp: Record<string, { gained: number; level: number; leveledUp: boolean }>;
  contributions: Record<string, number>;
  rounds: RoundSummary[];
  ranked: boolean;
  ghost: boolean;
}

export interface ReplayData {
  drawMs: number;
  ops: Record<TeamId, DrawOp[]>;
}

export interface QueueStatus {
  state: 'idle' | 'searching';
  teamSize: TeamSize | null;
  mode: GameMode | null;
  ranked: boolean;
  since: number;
  estimatedWaitMs: number;
  eloWindow: number;
  ghostAvailable: boolean;
  partySize: number;
}

export interface LobbyStats {
  online: number;
  inMatch: number;
  queues: Record<TeamSize, number>;
  aiDegraded: boolean;
}

export interface PartyMember {
  id: string;
  name: string;
  level: number;
  online: boolean;
}

export interface PartyState {
  code: string;
  leaderId: string;
  members: PartyMember[];
}

export interface RoomSettings {
  mode: GameMode;
  teamSize: TeamSize;
  roundsToWin: number;
  peekSec: number;
  drawSec: number;
  themes: PhotoTheme[];
  categories: PhotoCategory[];
  difficulties: Difficulty[];
  thumbnailVisible: boolean;
  memory: boolean;
  relay: boolean;
  relayTurnSec: number;
  colorLock: boolean;
  mirror: boolean;
  limitedPalette: boolean;
  opponentPreview: boolean;
  allowSpectators: boolean;
  isPrivate: boolean;
  useUploadedPhotos: boolean;
}

export interface RoomState {
  code: string;
  hostId: string;
  settings: RoomSettings;
  teams: Record<TeamId, PartyMember[]>;
  spectators: PartyMember[];
  uploadedPhotos: number;
  matchId: string | null;
}

export interface RoomListing {
  code: string;
  hostName: string;
  mode: GameMode;
  teamSize: TeamSize;
  players: number;
  capacity: number;
  inMatch: boolean;
}

export interface ChatMessage {
  id: string;
  channel: 'party' | 'match' | 'room';
  fromId: string;
  fromName: string;
  text: string;
  at: number;
}

export interface EmoteEvent {
  playerId: string;
  emote: EmoteId;
  at: number;
}

export interface Notice {
  kind: 'info' | 'warn' | 'error';
  code: string;
  message: string;
}

export interface MatchFoundPayload {
  matchId: string;
  rules: MatchRules;
  players: MatchPlayer[];
  myTeam: TeamId | null;
  acceptBy: number;
  serverNow: number;
}

export interface LeaderboardEntry {
  position: number;
  playerId: string;
  name: string;
  level: number;
  elo: number;
  rank: RankInfo;
  games: number;
  wins: number;
  weeklyDelta: number;
}

export interface MatchHistoryItem {
  matchId: string;
  endedAt: number;
  bucket: TeamSize;
  mode: GameMode;
  ranked: boolean;
  ghost: boolean;
  team: TeamId;
  result: 'win' | 'loss' | 'draw';
  score: Record<TeamId, number>;
  delta: number;
  thumbnail: string | null;
}

export interface BestDrawing {
  matchId: string;
  round: number;
  score: number;
  imageUrl: string;
  referenceUrl: string;
  photoTitle: string;
}

export interface ProfileResponse {
  player: Omit<PlayerProfile, 'queueBanUntil'>;
  history: MatchHistoryItem[];
  best: BestDrawing[];
  totals: { matches: number; wins: number; roundsWon: number; avgScore: number };
}
