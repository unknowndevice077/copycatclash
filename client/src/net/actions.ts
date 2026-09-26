import type { EmoteId, GameMode, MatchSnapshot, PartyState, QueueStatus, ReportInput, RoomListing, RoomSettings, RoomState, TeamId, TeamSize } from '@ccc/shared';
import { drawSession } from '../canvas/drawSession';
import { useMatch } from '../store/match';
import { useUi } from '../store/ui';
import { call, getSocket } from './socket';

function report<T>(res: { ok: true; data: T } | { ok: false; error: string }): T | null {
  if (res.ok) return res.data;
  useUi.getState().toast({ kind: 'error', code: 'action', message: res.error }, 5000);
  return null;
}

export const actions = {
  joinQueue: async (teamSize: TeamSize, mode: GameMode, ranked: boolean) => report(await call<QueueStatus>((s, cb) => s.emit('queue:join', { teamSize, mode, ranked }, cb))),
  leaveQueue: async () => report(await call<undefined>((s, cb) => s.emit('queue:leave', cb))),
  playGhost: async () => report(await call<{ matchId: string }>((s, cb) => s.emit('queue:ghost', cb))),

  createParty: async () => report(await call<PartyState>((s, cb) => s.emit('party:create', cb))),
  joinParty: async (code: string) => report(await call<PartyState>((s, cb) => s.emit('party:join', { code: code.toUpperCase() }, cb))),
  leaveParty: async () => report(await call<undefined>((s, cb) => s.emit('party:leave', cb))),

  createRoom: async (settings: RoomSettings) => report(await call<RoomState>((s, cb) => s.emit('room:create', settings, cb))),
  joinRoom: async (code: string, asSpectator = false) => report(await call<RoomState>((s, cb) => s.emit('room:join', { code: code.toUpperCase(), asSpectator }, cb))),
  updateRoom: async (settings: RoomSettings) => report(await call<RoomState>((s, cb) => s.emit('room:update', settings, cb))),
  setRoomTeam: async (team: TeamId | 'spectator') => report(await call<RoomState>((s, cb) => s.emit('room:setTeam', { team }, cb))),
  startRoom: async () => report(await call<{ matchId: string }>((s, cb) => s.emit('room:start', cb))),
  leaveRoom: async () => report(await call<undefined>((s, cb) => s.emit('room:leave', cb))),
  listRooms: async () => report(await call<RoomListing[]>((s, cb) => s.emit('room:list', cb))),

  rematch: async () => report(await call<undefined>((s, cb) => s.emit('match:rematch', cb))),
  /** Leaves the match (a forfeit if it's still running) and returns to the lobby. */
  leaveMatch: async () => {
    await call<undefined>((s, cb) => s.emit('match:leave', cb));
    drawSession.reset();
    useMatch.getState().reset();
  },
  resync: async () => {
    const res = await call<MatchSnapshot>((s, cb) => s.emit('match:resync', cb));
    return res.ok;
  },

  emote: (emote: EmoteId) => getSocket()?.emit('emote', { emote }),
  chat: async (channel: 'party' | 'match' | 'room', text: string) => report(await call<undefined>((s, cb) => s.emit('chat:send', { channel, text }, cb))),
  report: async (playerId: string, reason: ReportInput['reason']) => {
    const res = report(await call<undefined>((s, cb) => s.emit('report', { playerId, reason }, cb)));
    if (res !== null) useUi.getState().toast({ kind: 'info', code: 'reported', message: 'Thanks. Our moderators will take a look.' });
  },
};
