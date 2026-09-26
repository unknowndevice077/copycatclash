import {
  MODE_PRESETS,
  TEAM_SIZE_COUNT,
  rulesForRoom,
  type PartyMember,
  type RoomListing,
  type RoomSettings,
  type RoomState,
  type TeamId,
} from '@ccc/shared';
import type { PlayersRepo } from '../db/repos/players';
import { seatFor, type MatchRegistry } from '../game/MatchRegistry';
import type { Seat } from '../game/Match';
import type { PhotoService } from '../photos/photoService';
import type { Presence } from '../socket/presence';
import type { TypedServer } from '../socket/types';
import { newCode } from '../util/ids';

interface Room {
  code: string;
  hostId: string;
  settings: RoomSettings;
  teams: Record<TeamId, string[]>;
  spectators: string[];
  matchId: string | null;
  createdAt: number;
}

export type RoomResult<T = RoomState> = { ok: true; value: T } | { ok: false; error: string };

const ROOM_IDLE_MS = 30 * 60_000;

/** Host-configured custom rooms with teams, spectators and optional uploaded photos. */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly byPlayer = new Map<string, string>();

  constructor(
    private readonly io: TypedServer,
    private readonly players: PlayersRepo,
    private readonly presence: Presence,
    private readonly registry: MatchRegistry,
    private readonly photos: PhotoService,
  ) {
    setInterval(() => this.sweep(), 60_000).unref();
  }

  static channel(code: string): string {
    return `room:${code}`;
  }

  private member(id: string): PartyMember {
    const p = this.players.profile(id);
    return { id, name: p?.name ?? 'Player', level: p?.level ?? 1, online: this.presence.isOnline(id) };
  }

  private state(room: Room): RoomState {
    return {
      code: room.code,
      hostId: room.hostId,
      settings: room.settings,
      teams: { A: room.teams.A.map((m) => this.member(m)), B: room.teams.B.map((m) => this.member(m)) },
      spectators: room.spectators.map((m) => this.member(m)),
      uploadedPhotos: this.photos.uploadCount(room.code),
      matchId: room.matchId,
    };
  }

  private broadcast(room: Room): void {
    this.io.to(RoomManager.channel(room.code)).emit('room:state', this.state(room));
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  forPlayer(playerId: string): Room | undefined {
    const code = this.byPlayer.get(playerId);
    return code ? this.rooms.get(code) : undefined;
  }

  isHost(code: string, playerId: string): boolean {
    return this.rooms.get(code)?.hostId === playerId;
  }

  private normalise(s: RoomSettings): RoomSettings {
    const multi = TEAM_SIZE_COUNT[s.teamSize] > 1;
    return { ...s, relay: s.relay && multi, colorLock: s.colorLock && multi, thumbnailVisible: s.thumbnailVisible && !s.memory };
  }

  create(hostId: string, settings: RoomSettings): RoomResult {
    this.leave(hostId);
    let code = newCode();
    while (this.rooms.has(code)) code = newCode();
    const room: Room = { code, hostId, settings: this.normalise(settings), teams: { A: [hostId], B: [] }, spectators: [], matchId: null, createdAt: Date.now() };
    this.rooms.set(code, room);
    this.byPlayer.set(hostId, code);
    void this.presence.socketOf(hostId)?.join(RoomManager.channel(code));
    return { ok: true, value: this.state(room) };
  }

  join(code: string, playerId: string, asSpectator: boolean): RoomResult {
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: 'Room not found' };
    const already = [...room.teams.A, ...room.teams.B, ...room.spectators].includes(playerId);
    if (!already) {
      this.leave(playerId);
      const cap = TEAM_SIZE_COUNT[room.settings.teamSize];
      if (asSpectator || (room.teams.A.length >= cap && room.teams.B.length >= cap)) {
        if (!room.settings.allowSpectators) return { ok: false, error: 'This room is full and does not allow spectators' };
        room.spectators.push(playerId);
      } else {
        const team: TeamId = room.teams.A.length <= room.teams.B.length && room.teams.A.length < cap ? 'A' : 'B';
        room.teams[team].push(playerId);
      }
      this.byPlayer.set(playerId, code);
    }
    const socket = this.presence.socketOf(playerId);
    if (socket) void socket.join(RoomManager.channel(code));
    this.broadcast(room);
    if (room.matchId && room.spectators.includes(playerId) && room.settings.allowSpectators && socket) {
      this.registry.get(room.matchId)?.addSpectator(playerId, socket);
    }
    return { ok: true, value: this.state(room) };
  }

  update(code: string, playerId: string, settings: RoomSettings): RoomResult {
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: 'Room not found' };
    if (room.hostId !== playerId) return { ok: false, error: 'Only the host can change settings' };
    if (room.matchId) return { ok: false, error: 'Settings are locked during a match' };
    room.settings = this.normalise(settings);
    const cap = TEAM_SIZE_COUNT[room.settings.teamSize];
    for (const t of ['A', 'B'] as const) {
      while (room.teams[t].length > cap) room.spectators.push(room.teams[t].pop() as string);
    }
    this.broadcast(room);
    return { ok: true, value: this.state(room) };
  }

  setTeam(code: string, playerId: string, team: TeamId | 'spectator'): RoomResult {
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: 'Room not found' };
    if (room.matchId) return { ok: false, error: 'Teams are locked during a match' };
    const cap = TEAM_SIZE_COUNT[room.settings.teamSize];
    if (team === 'spectator' && !room.settings.allowSpectators) return { ok: false, error: 'Spectators are disabled' };
    if (team !== 'spectator' && room.teams[team].length >= cap && !room.teams[team].includes(playerId)) return { ok: false, error: 'That team is full' };
    room.teams.A = room.teams.A.filter((m) => m !== playerId);
    room.teams.B = room.teams.B.filter((m) => m !== playerId);
    room.spectators = room.spectators.filter((m) => m !== playerId);
    if (team === 'spectator') room.spectators.push(playerId);
    else room.teams[team].push(playerId);
    this.broadcast(room);
    return { ok: true, value: this.state(room) };
  }

  start(code: string, playerId: string): RoomResult<{ matchId: string }> {
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: 'Room not found' };
    if (room.hostId !== playerId) return { ok: false, error: 'Only the host can start' };
    if (room.matchId) return { ok: false, error: 'A match is already running' };
    if (!room.teams.A.length || !room.teams.B.length) return { ok: false, error: 'Both teams need at least one player' };
    const everyone = [...room.teams.A, ...room.teams.B];
    if (everyone.some((id) => !this.presence.isOnline(id))) return { ok: false, error: 'Everyone on a team must be online' };
    if (everyone.some((id) => this.registry.forPlayer(id))) return { ok: false, error: 'Someone is still in another match' };
    if (room.settings.useUploadedPhotos && this.photos.uploadCount(code) === 0) return { ok: false, error: 'Upload at least one photo or turn off uploaded photos' };
    if (MODE_PRESETS[room.settings.mode].teamOnly && TEAM_SIZE_COUNT[room.settings.teamSize] === 1) {
      return { ok: false, error: `${MODE_PRESETS[room.settings.mode].label} needs teams of 2 or 3` };
    }

    const seats: Record<TeamId, Seat[]> = { A: [], B: [] };
    for (const t of ['A', 'B'] as const) {
      for (const id of room.teams[t]) {
        const seat = seatFor(this.players, id, room.settings.teamSize);
        if (seat) seats[t].push(seat);
      }
    }
    const match = this.registry.create({
      rules: rulesForRoom(room.settings),
      teams: seats,
      spectatorIds: room.settings.allowSpectators ? room.spectators.filter((id) => this.presence.isOnline(id)) : [],
      uploadsKey: room.settings.useUploadedPhotos ? code : null,
      roomCode: code,
    });
    room.matchId = match.id;
    this.broadcast(room);
    return { ok: true, value: { matchId: match.id } };
  }

  leave(playerId: string): void {
    const room = this.forPlayer(playerId);
    if (!room) return;
    room.teams.A = room.teams.A.filter((m) => m !== playerId);
    room.teams.B = room.teams.B.filter((m) => m !== playerId);
    room.spectators = room.spectators.filter((m) => m !== playerId);
    this.byPlayer.delete(playerId);
    const socket = this.presence.socketOf(playerId);
    if (socket) {
      void socket.leave(RoomManager.channel(room.code));
      socket.emit('room:state', null);
    }
    const remaining = [...room.teams.A, ...room.teams.B, ...room.spectators];
    if (!remaining.length) {
      this.rooms.delete(room.code);
      this.photos.clearUploads(room.code);
      return;
    }
    if (room.hostId === playerId) room.hostId = [...room.teams.A, ...room.teams.B][0] ?? remaining[0];
    this.broadcast(room);
  }

  onMatchClosed(matchId: string): void {
    for (const room of this.rooms.values()) {
      if (room.matchId === matchId) {
        room.matchId = null;
        this.broadcast(room);
      }
    }
  }

  onMatchCreated(roomCode: string | null, matchId: string): void {
    if (!roomCode) return;
    const room = this.rooms.get(roomCode);
    if (room) {
      room.matchId = matchId;
      this.broadcast(room);
    }
  }

  notifyUploads(code: string): void {
    const room = this.rooms.get(code);
    if (room) this.broadcast(room);
  }

  listPublic(): RoomListing[] {
    return [...this.rooms.values()]
      .filter((r) => !r.settings.isPrivate)
      .map((r) => ({
        code: r.code,
        hostName: this.member(r.hostId).name,
        mode: r.settings.mode,
        teamSize: r.settings.teamSize,
        players: r.teams.A.length + r.teams.B.length,
        capacity: TEAM_SIZE_COUNT[r.settings.teamSize] * 2,
        inMatch: !!r.matchId,
      }))
      .slice(0, 50);
  }

  private sweep(): void {
    for (const room of this.rooms.values()) {
      const members = [...room.teams.A, ...room.teams.B, ...room.spectators];
      const anyoneOnline = members.some((id) => this.presence.isOnline(id));
      if (!room.matchId && !anyoneOnline && Date.now() - room.createdAt > ROOM_IDLE_MS) {
        for (const m of members) this.byPlayer.delete(m);
        this.rooms.delete(room.code);
        this.photos.clearUploads(room.code);
      }
    }
  }
}
