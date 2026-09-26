import { create } from 'zustand';
import type {
  ChatMessage,
  EmoteEvent,
  MatchPhase,
  MatchPlayer,
  MatchResultPayload,
  MatchRules,
  PhaseInfo,
  RelayState,
  RoundSummary,
  ShowdownPayload,
  TeamId,
} from '@ccc/shared';
import { teamRecord } from '@ccc/shared';

export interface MatchState {
  matchId: string | null;
  rules: MatchRules | null;
  players: MatchPlayer[];
  myTeam: TeamId | null;
  spectator: boolean;
  phase: MatchPhase | null;
  /** Server timestamp when the current phase ends. */
  phaseEndsAt: number;
  round: number;
  score: Record<TeamId, number>;
  suddenDeath: boolean;
  relay: Record<TeamId, RelayState | null>;
  aiDegraded: boolean;
  photoUrl: string | null;
  photoMirrored: boolean;
  showdown: ShowdownPayload | null;
  rounds: RoundSummary[];
  result: MatchResultPayload | null;
  rematchVotes: string[];
  previews: Partial<Record<TeamId, string>>;
  cursors: Record<string, { x: number; y: number; at: number }>;
  emotes: EmoteEvent[];
  chat: ChatMessage[];
  closedReason: string | null;

  applyPhase: (p: PhaseInfo) => void;
  set: (patch: Partial<MatchState>) => void;
  setPhoto: (url: string | null, mirrored: boolean) => void;
  reset: () => void;
}

const initial = {
  matchId: null,
  rules: null,
  players: [],
  myTeam: null,
  spectator: false,
  phase: null,
  phaseEndsAt: 0,
  round: 0,
  score: teamRecord(() => 0),
  suddenDeath: false,
  relay: teamRecord(() => null),
  aiDegraded: false,
  photoUrl: null,
  photoMirrored: false,
  showdown: null,
  rounds: [],
  result: null,
  rematchVotes: [],
  previews: {},
  cursors: {},
  emotes: [],
  chat: [],
  closedReason: null,
} satisfies Partial<MatchState>;

export const useMatch = create<MatchState>((set, get) => ({
  ...initial,
  applyPhase: (p) =>
    set({
      phase: p.phase,
      phaseEndsAt: p.phaseEndsAt,
      round: p.round,
      score: p.score,
      suddenDeath: p.suddenDeath,
      relay: p.relay,
      aiDegraded: p.aiDegraded,
    }),
  set: (patch) => set(patch),
  setPhoto: (url, mirrored) => {
    const old = get().photoUrl;
    if (old && old !== url && old.startsWith('blob:')) URL.revokeObjectURL(old);
    set({ photoUrl: url, photoMirrored: mirrored });
  },
  reset: () => {
    get().setPhoto(null, false);
    set({ ...initial });
  },
}));

export function myPlayer(state: MatchState, playerId: string | undefined): MatchPlayer | undefined {
  return state.players.find((p) => p.id === playerId);
}
