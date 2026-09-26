import {
  FFA_MAX_PLAYERS,
  MODE_PRESETS,
  TEAM_IDS,
  TEAM_SIZE_COUNT,
  VERSUS_TEAMS,
  rulesForRoom,
  teamRecord,
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
  /** Team matches use A and B; a free-for-all seats one player on each of A..E. */
  teams: Record<TeamId, string[]>;
  spectators: string[];
  matchId: string | null;
  createdAt: number;
}

export type RoomResult<T = RoomState> = { ok: true; value: T } | { ok: false; error: string };

const ROOM_IDLE_MS = 30 * 60_000;

/** Seats a room offers in its current format. */
function seatsOf(s: RoomSettings): TeamId[] {
  return s.format === 'ffa' ? [...TEAM_IDS] : [...VERSUS_TEAMS];
}

/** Players per seat: one in a free-for-all, the team size otherwise. */
function capOf(s: RoomSettings): number {
  return s.format === 'ffa' ? 1 : TEAM_SIZE_COUNT[s.teamSize];
}

function capacityOf(s: RoomSettings): number {
  return s.format === 'ffa' ? FFA_MAX_PLAYERS : TEAM_SIZE_COUNT[s.teamSize] * 2;
}

function playersIn(room: Room): string[] {
  return TEAM_IDS.flatMap((t) => room.teams[t]);
}

/** Host-configured custom rooms with teams (or free-for-all seats), spectators and optional uploaded photos. */
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
      teams: teamRecord((t) => room.teams[t].map((m) => this.member(m))),
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
    const ffa = s.format === 'ffa';
    const multi = !ffa && TEAM_SIZE_COUNT[s.teamSize] > 1;
    return {
      ...s,
      teamSize: ffa ? '1v1' : s.teamSize,
      relay: s.relay && multi,
      colorLock: s.colorLock && multi,
      thumbnailVisible: s.thumbnailVisible && !s.memory,
    };
  }

  /** The emptiest seat with room left, or null when the room is full. */
  private openSeat(room: Room): TeamId | null {
    const cap = capOf(room.settings);
    const open = seatsOf(room.settings).filter((t) => room.teams[t].length < cap);
    if (!open.length) return null;
    return open.reduce((best, t) => (room.teams[t].length < room.teams[best].length ? t : best));
  }

  create(hostId: string, settings: RoomSettings): RoomResult {
    this.leave(hostId);
    let code = newCode();
    while (this.rooms.has(code)) code = newCode();
    const teams = teamRecord<string[]>(() => []);
    teams.A.push(hostId);
    const room: Room = { code, hostId, settings: this.normalise(settings), teams, spectators: [], matchId: null, createdAt: Date.now() };
    this.rooms.set(code, room);
    this.byPlayer.set(hostId, code);
    void this.presence.socketOf(hostId)?.join(RoomManager.channel(code));
    return { ok: true, value: this.state(room) };
  }

  join(code: string, playerId: string, asSpectator: boolean): RoomResult {
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: 'Room not found' };
    const already = [...playersIn(room), ...room.spectators].includes(playerId);
    if (!already) {
      this.leave(playerId);
      const seat = asSpectator ? null : this.openSeat(room);
      if (!seat) {
        if (!room.settings.allowSpectators) return { ok: false, error: 'This room is full and does not allow spectators' };
        room.spectators.push(playerId);
      } else {
        room.teams[seat].push(playerId);
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
    const before = room.teams;
    room.settings = this.normalise(settings);
    // Re-seat everyone for the (possibly new) format: keep seats that still exist, move the rest to
    // the emptiest open seat, and anyone left over watches.
    const seated = playersIn(room);
    const previous = new Map(TEAM_IDS.flatMap((t) => before[t].map((id) => [id, t] as const)));
    room.teams = teamRecord(() => []);
    const cap = capOf(room.settings);
    const valid = new Set(seatsOf(room.settings));
    const moved: string[] = [];
    for (const id of seated) {
      const t = previous.get(id);
      if (t && valid.has(t) && room.teams[t].length < cap) room.teams[t].push(id);
      else moved.push(id);
    }
    for (const id of moved) {
      const seat = this.openSeat(room);
      if (seat) room.teams[seat].push(id);
      else room.spectators.push(id);
    }
    this.broadcast(room);
    return { ok: true, value: this.state(room) };
  }

  setTeam(code: string, playerId: string, team: TeamId | 'spectator'): RoomResult {
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: 'Room not found' };
    if (room.matchId) return { ok: false, error: 'Teams are locked during a match' };
    if (team === 'spectator' && !room.settings.allowSpectators) return { ok: false, error: 'Spectators are disabled' };
    if (team !== 'spectator') {
      if (!seatsOf(room.settings).includes(team)) return { ok: false, error: 'That seat is not used in this format' };
      if (room.teams[team].length >= capOf(room.settings) && !room.teams[team].includes(playerId)) {
        return { ok: false, error: room.settings.format === 'ffa' ? 'That seat is taken' : 'That team is full' };
      }
    }
    for (const t of TEAM_IDS) room.teams[t] = room.teams[t].filter((m) => m !== playerId);
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
    const ffa = room.settings.format === 'ffa';
    const taken = seatsOf(room.settings).filter((t) => room.teams[t].length > 0);
    if (ffa && taken.length < 2) return { ok: false, error: 'A free-for-all needs at least 2 players' };
    if (!ffa && taken.length < 2) return { ok: false, error: 'Both teams need at least one player' };
    const everyone = playersIn(room);
    if (everyone.some((id) => !this.presence.isOnline(id))) return { ok: false, error: 'Every player must be online' };
    if (everyone.some((id) => this.registry.forPlayer(id))) return { ok: false, error: 'Someone is still in another match' };
    if (room.settings.useUploadedPhotos && this.photos.uploadCount(code) === 0) return { ok: false, error: 'Upload at least one photo or turn off uploaded photos' };
    if (MODE_PRESETS[room.settings.mode].teamOnly && (ffa || TEAM_SIZE_COUNT[room.settings.teamSize] === 1)) {
      return { ok: false, error: `${MODE_PRESETS[room.settings.mode].label} needs teams of 2 or 3` };
    }

    const seats: Partial<Record<TeamId, Seat[]>> = {};
    for (const t of taken) {
      for (const id of room.teams[t]) {
        const seat = seatFor(this.players, id, room.settings.teamSize);
        if (seat) (seats[t] ??= []).push(seat);
      }
    }
    const match = this.registry.create({
      rules: rulesForRoom(room.settings, taken),
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
    for (const t of TEAM_IDS) room.teams[t] = room.teams[t].filter((m) => m !== playerId);
    room.spectators = room.spectators.filter((m) => m !== playerId);
    this.byPlayer.delete(playerId);
    const socket = this.presence.socketOf(playerId);
    if (socket) {
      void socket.leave(RoomManager.channel(room.code));
      socket.emit('room:state', null);
    }
    const remaining = [...playersIn(room), ...room.spectators];
    if (!remaining.length) {
      this.rooms.delete(room.code);
      this.photos.clearUploads(room.code);
      return;
    }
    if (room.hostId === playerId) room.hostId = playersIn(room)[0] ?? remaining[0];
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
        format: r.settings.format,
        players: playersIn(r).length,
        capacity: capacityOf(r.settings),
        inMatch: !!r.matchId,
      }))
      .slice(0, 50);
  }

  private sweep(): void {
    for (const room of this.rooms.values()) {
      const members = [...playersIn(room), ...room.spectators];
      const anyoneOnline = members.some((id) => this.presence.isOnline(id));
      if (!room.matchId && !anyoneOnline && Date.now() - room.createdAt > ROOM_IDLE_MS) {
        for (const m of members) this.byPlayer.delete(m);
        this.rooms.delete(room.code);
        this.photos.clearUploads(room.code);
      }
    }
  }
}
