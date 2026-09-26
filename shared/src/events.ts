/**
 * Every Socket.IO event in the game, with payload types.
 * Client -> server payloads are validated on the server with the zod schemas in ./schemas.
 */
import type { TeamId } from './constants';
import type {
  ChatSendInput,
  CursorInput,
  EmoteInput,
  EraseInput,
  FillInput,
  PartyJoinInput,
  QueueJoinInput,
  ReportInput,
  RoomJoinInput,
  RoomSetTeamInput,
  RoomSettingsInput,
  StrokeBatchInput,
} from './schemas';
import type {
  Ack,
  ChatMessage,
  EmoteEvent,
  FillOp,
  LobbyStats,
  MatchFoundPayload,
  MatchResultPayload,
  MatchSnapshot,
  Notice,
  PartyState,
  PhaseInfo,
  PlayerProfile,
  QueueStatus,
  RelayState,
  RoomListing,
  RoomState,
  ShowdownPayload,
} from './types';

type Cb<T = undefined> = (res: Ack<T>) => void;

export interface ClientToServerEvents {
  /** Clock sync. Returns server time in ms. */
  'time:ping': (payload: { clientTime: number }, cb: (serverTime: number) => void) => void;

  'queue:join': (payload: QueueJoinInput, cb: Cb<QueueStatus>) => void;
  'queue:leave': (cb: Cb) => void;
  /** Accept a ghost match after waiting 20s in the 1v1 queue. */
  'queue:ghost': (cb: Cb<{ matchId: string }>) => void;

  'party:create': (cb: Cb<PartyState>) => void;
  'party:join': (payload: PartyJoinInput, cb: Cb<PartyState>) => void;
  'party:leave': (cb: Cb) => void;

  'room:create': (payload: RoomSettingsInput, cb: Cb<RoomState>) => void;
  'room:join': (payload: RoomJoinInput, cb: Cb<RoomState>) => void;
  'room:update': (payload: RoomSettingsInput, cb: Cb<RoomState>) => void;
  'room:setTeam': (payload: RoomSetTeamInput, cb: Cb<RoomState>) => void;
  'room:start': (cb: Cb<{ matchId: string }>) => void;
  'room:leave': (cb: Cb) => void;
  'room:list': (cb: Cb<RoomListing[]>) => void;

  'match:accept': () => void;
  'match:resync': (cb: Cb<MatchSnapshot>) => void;
  'match:rematch': (cb: Cb) => void;
  'match:leave': (cb: Cb) => void;

  'draw:stroke': (payload: StrokeBatchInput) => void;
  'draw:fill': (payload: FillInput) => void;
  'draw:erase': (payload: EraseInput) => void;
  'draw:undo': () => void;
  'draw:redo': () => void;
  'draw:clear': () => void;
  'draw:cursor': (payload: CursorInput) => void;

  emote: (payload: EmoteInput) => void;
  'chat:send': (payload: ChatSendInput, cb: Cb) => void;
  report: (payload: ReportInput, cb: Cb) => void;
}

export interface StrokeRelay {
  team: TeamId;
  playerId: string;
  id: string;
  color: string;
  size: number;
  points: number[];
  times: number[];
  done: boolean;
}

export interface ServerToClientEvents {
  'session:ready': (payload: { player: PlayerProfile; activeMatchId: string | null }) => void;
  'session:profile': (player: PlayerProfile) => void;
  'lobby:stats': (stats: LobbyStats) => void;
  notice: (notice: Notice) => void;

  'queue:status': (status: QueueStatus) => void;
  'party:state': (party: PartyState | null) => void;
  'room:state': (room: RoomState | null) => void;

  'match:found': (payload: MatchFoundPayload) => void;
  'match:snapshot': (snapshot: MatchSnapshot) => void;
  'match:phase': (phase: PhaseInfo) => void;
  /** Sent only at the PEEK phase. The URL carries a one-time token. */
  'round:peek': (payload: { round: number; photoUrl: string; mirrored: boolean }) => void;
  'round:showdown': (payload: ShowdownPayload) => void;
  'match:result': (payload: MatchResultPayload) => void;
  'match:rematchVotes': (payload: { votes: string[]; needed: number }) => void;
  'match:closed': (payload: { matchId: string; reason: string }) => void;
  'player:status': (payload: { playerId: string; connected: boolean }) => void;

  'draw:stroke': (payload: StrokeRelay) => void;
  'draw:fill': (payload: FillOp & { team: TeamId }) => void;
  'draw:visibility': (payload: { team: TeamId; ids: string[]; hidden: boolean }) => void;
  'draw:reject': (payload: { id: string; reason: string }) => void;
  'draw:cursor': (payload: { playerId: string; x: number; y: number }) => void;
  'relay:turn': (payload: { team: TeamId; relay: RelayState }) => void;
  /** Low-res opponent preview, only when the rules enable it. */
  'match:preview': (payload: { team: TeamId; image: string }) => void;

  emote: (payload: EmoteEvent) => void;
  'chat:message': (payload: ChatMessage) => void;
}

export interface InterServerEvents {
  'lobby:counts': (payload: { instanceId: string; online: number; inMatch: number }) => void;
}

export interface SocketData {
  playerId: string;
  name: string;
  ip: string;
}
