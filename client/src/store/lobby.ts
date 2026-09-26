import { create } from 'zustand';
import type { ChatMessage, EmoteEvent, LobbyStats, PartyState, QueueStatus, RoomListing, RoomState } from '@ccc/shared';

interface LobbyState {
  stats: LobbyStats | null;
  queue: QueueStatus | null;
  party: PartyState | null;
  room: RoomState | null;
  roomList: RoomListing[];
  chat: ChatMessage[];
  emotes: EmoteEvent[];
  set: (patch: Partial<Omit<LobbyState, 'set' | 'pushChat' | 'pushEmote'>>) => void;
  pushChat: (m: ChatMessage) => void;
  pushEmote: (e: EmoteEvent) => void;
}

export const useLobby = create<LobbyState>((set) => ({
  stats: null,
  queue: null,
  party: null,
  room: null,
  roomList: [],
  chat: [],
  emotes: [],
  set: (patch) => set(patch),
  pushChat: (m) => set((s) => ({ chat: [...s.chat.slice(-80), m] })),
  pushEmote: (e) => set((s) => ({ emotes: [...s.emotes.slice(-12), e] })),
}));
