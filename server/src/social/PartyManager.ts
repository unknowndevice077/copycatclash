import { MAX_PARTY_SIZE, type PartyMember, type PartyState } from '@ccc/shared';
import type { PlayersRepo } from '../db/repos/players';
import type { Presence } from '../socket/presence';
import { newCode } from '../util/ids';

interface Party {
  code: string;
  leaderId: string;
  members: string[];
}

export type PartyResult = { ok: true; party: PartyState } | { ok: false; error: string };

/** Pre-made teams that queue together. Parties live in memory on the instance that created them. */
export class PartyManager {
  private readonly parties = new Map<string, Party>();
  private readonly byPlayer = new Map<string, string>();

  constructor(
    private readonly players: PlayersRepo,
    private readonly presence: Presence,
  ) {}

  private member(id: string): PartyMember {
    const p = this.players.profile(id);
    return { id, name: p?.name ?? 'Player', level: p?.level ?? 1, online: this.presence.isOnline(id) };
  }

  stateOf(party: Party): PartyState {
    return { code: party.code, leaderId: party.leaderId, members: party.members.map((m) => this.member(m)) };
  }

  forPlayer(playerId: string): Party | null {
    const code = this.byPlayer.get(playerId);
    return code ? (this.parties.get(code) ?? null) : null;
  }

  broadcast(party: Party): void {
    const state = this.stateOf(party);
    for (const m of party.members) this.presence.socketOf(m)?.emit('party:state', state);
  }

  create(playerId: string): PartyResult {
    this.leave(playerId);
    let code = newCode();
    while (this.parties.has(code)) code = newCode();
    const party: Party = { code, leaderId: playerId, members: [playerId] };
    this.parties.set(code, party);
    this.byPlayer.set(playerId, code);
    return { ok: true, party: this.stateOf(party) };
  }

  join(code: string, playerId: string): PartyResult {
    const party = this.parties.get(code);
    if (!party) return { ok: false, error: 'Party not found' };
    if (party.members.includes(playerId)) return { ok: true, party: this.stateOf(party) };
    if (party.members.length >= MAX_PARTY_SIZE) return { ok: false, error: 'That party is full' };
    this.leave(playerId);
    party.members.push(playerId);
    this.byPlayer.set(playerId, code);
    this.broadcast(party);
    return { ok: true, party: this.stateOf(party) };
  }

  leave(playerId: string): void {
    const party = this.forPlayer(playerId);
    if (!party) return;
    party.members = party.members.filter((m) => m !== playerId);
    this.byPlayer.delete(playerId);
    this.presence.socketOf(playerId)?.emit('party:state', null);
    if (!party.members.length) {
      this.parties.delete(party.code);
      return;
    }
    if (party.leaderId === playerId) party.leaderId = party.members[0];
    this.broadcast(party);
  }

  /** Refresh member online flags when someone connects or drops. */
  touch(playerId: string): void {
    const party = this.forPlayer(playerId);
    if (party) this.broadcast(party);
  }
}
