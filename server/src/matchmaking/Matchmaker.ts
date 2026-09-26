import {
  GHOST_OFFER_AFTER_MS,
  MATCHMAKING,
  MODE_PRESETS,
  RANKED_MODE,
  TEAM_SIZE_COUNT,
  rulesForQueue,
  teamRecord,
  type QueueJoinInput,
  type QueueStatus,
  type TeamId,
} from '@ccc/shared';
import type { GhostsRepo } from '../db/repos/misc';
import type { PlayersRepo } from '../db/repos/players';
import { seatFor, type MatchRegistry } from '../game/MatchRegistry';
import type { Seat } from '../game/Match';
import type { Presence } from '../socket/presence';
import { newId } from '../util/ids';
import { errMessage, log } from '../util/logger';
import { average } from '../ranking/elo';
import { queueKey, type QueueEntry, type QueueStore } from './QueueStore';

export interface MatchmakerDeps {
  store: QueueStore;
  registry: MatchRegistry;
  presence: Presence;
  players: PlayersRepo;
  ghosts: GhostsRepo;
}

export type JoinResult = { ok: true; status: QueueStatus } | { ok: false; error: string };

export function eloWindow(waitedMs: number): number {
  const steps = Math.floor(waitedMs / MATCHMAKING.widenEveryMs);
  return Math.min(MATCHMAKING.maxWindow, MATCHMAKING.baseWindow + steps * MATCHMAKING.widenBy);
}

/** Splits entries (parties stay together) into two full, Elo-balanced teams, or returns null. */
export function packTeams(entries: QueueEntry[], perTeam: number): Record<TeamId, QueueEntry[]> | null {
  const teams: Record<TeamId, QueueEntry[]> = teamRecord(() => []);
  const size = { A: 0, B: 0 };
  const eloSum = { A: 0, B: 0 };
  const sorted = [...entries].sort((a, b) => b.playerIds.length - a.playerIds.length || b.elo - a.elo);
  for (const e of sorted) {
    const n = e.playerIds.length;
    const fitsA = size.A + n <= perTeam;
    const fitsB = size.B + n <= perTeam;
    if (!fitsA && !fitsB) return null;
    const avgA = size.A ? eloSum.A / size.A : 0;
    const avgB = size.B ? eloSum.B / size.B : 0;
    const target: TeamId = fitsA && fitsB ? (size.A === size.B ? (avgA <= avgB ? 'A' : 'B') : size.A < size.B ? 'A' : 'B') : fitsA ? 'A' : 'B';
    teams[target].push(e);
    size[target] += n;
    eloSum[target] += e.elo * n;
  }
  return size.A === perTeam && size.B === perTeam ? teams : null;
}

export class Matchmaker {
  private readonly recentWaits = new Map<string, number[]>();
  private running = false;

  constructor(private readonly deps: MatchmakerDeps) {}

  start(): void {
    setInterval(() => void this.tick(), MATCHMAKING.tickMs).unref();
  }

  async join(leaderId: string, input: QueueJoinInput, partyMembers: string[] | null): Promise<JoinResult> {
    const teamSize = input.teamSize;
    const mode = input.ranked ? RANKED_MODE : input.mode;
    const perTeam = TEAM_SIZE_COUNT[teamSize];
    const members = partyMembers ?? [leaderId];
    if (members.length > perTeam) return { ok: false, error: `Your party is too big for ${teamSize}` };
    if (MODE_PRESETS[mode].teamOnly && perTeam === 1) return { ok: false, error: `${MODE_PRESETS[mode].label} needs teams of 2 or 3` };

    for (const id of members) {
      if (!this.deps.presence.isOnline(id)) return { ok: false, error: 'Everyone in your party must be online' };
      if (this.deps.registry.forPlayer(id)) return { ok: false, error: 'Someone in your party is already in a match' };
      const profile = this.deps.players.profile(id);
      if (profile?.queueBanUntil) {
        const mins = Math.ceil((profile.queueBanUntil - Date.now()) / 60_000);
        return { ok: false, error: `${profile.name} is queue-banned for ${mins} more minute(s) for leaving matches` };
      }
      const existing = await this.deps.store.findByPlayer(id);
      if (existing) await this.deps.store.removeEntry(existing.entryId);
    }

    const elo = average(members.map((id) => this.deps.players.rating(id, teamSize).elo));
    const entry: QueueEntry = {
      entryId: newId('q_'),
      playerIds: members,
      partyCode: partyMembers ? leaderId : null,
      teamSize,
      mode,
      ranked: input.ranked,
      elo,
      joinedAt: Date.now(),
    };
    await this.deps.store.add(entry);
    log.info('queue join', { key: queueKey(entry), players: members.length, elo: Math.round(elo) });
    const status = await this.statusFor(entry);
    for (const id of members) this.deps.presence.socketOf(id)?.emit('queue:status', status);
    return { ok: true, status };
  }

  async leave(playerId: string): Promise<void> {
    const entry = await this.deps.store.findByPlayer(playerId);
    if (!entry) return;
    await this.deps.store.removeEntry(entry.entryId);
    for (const id of entry.playerIds) this.deps.presence.socketOf(id)?.emit('queue:status', idleStatus());
  }

  async entryFor(playerId: string): Promise<QueueEntry | null> {
    return this.deps.store.findByPlayer(playerId);
  }

  private estimate(key: string, queued: number, perTeam: number): number {
    const waits = this.recentWaits.get(key);
    if (waits?.length) return Math.round(waits.reduce((a, b) => a + b, 0) / waits.length);
    const missing = Math.max(1, perTeam * 2 - queued);
    return 8_000 + missing * 6_000;
  }

  private recordWait(key: string, ms: number): void {
    const list = this.recentWaits.get(key) ?? [];
    list.push(ms);
    if (list.length > 20) list.shift();
    this.recentWaits.set(key, list);
  }

  private async statusFor(entry: QueueEntry, queuedInKey = 0): Promise<QueueStatus> {
    const waited = Date.now() - entry.joinedAt;
    const ghostAvailable =
      entry.teamSize === '1v1' &&
      entry.playerIds.length === 1 &&
      waited >= GHOST_OFFER_AFTER_MS &&
      this.deps.ghosts.countNear(entry.elo, 300, entry.playerIds[0]) >= 3;
    return {
      state: 'searching',
      teamSize: entry.teamSize,
      mode: entry.mode,
      ranked: entry.ranked,
      since: entry.joinedAt,
      estimatedWaitMs: this.estimate(queueKey(entry), queuedInKey, TEAM_SIZE_COUNT[entry.teamSize]),
      eloWindow: eloWindow(waited),
      ghostAvailable,
      partySize: entry.playerIds.length,
    };
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      if (!(await this.deps.store.tryLock('matchmaker', MATCHMAKING.tickMs - 50))) return;
      for (const key of await this.deps.store.keys()) await this.matchKey(key);
    } catch (err) {
      log.error('matchmaking tick failed', { error: errMessage(err) });
    } finally {
      this.running = false;
    }
  }

  private async matchKey(key: string): Promise<void> {
    let entries = (await this.deps.store.list(key)).sort((a, b) => a.joinedAt - b.joinedAt);
    // Drop entries whose players went offline.
    for (const e of entries) {
      if (e.playerIds.some((id) => !this.deps.presence.isOnline(id))) {
        await this.deps.store.removeEntry(e.entryId);
        for (const id of e.playerIds) this.deps.presence.socketOf(id)?.emit('queue:status', idleStatus());
      }
    }
    entries = entries.filter((e) => e.playerIds.every((id) => this.deps.presence.isOnline(id)));
    if (!entries.length) return;
    const perTeam = TEAM_SIZE_COUNT[entries[0].teamSize];

    let formed = true;
    while (formed) {
      formed = false;
      for (const anchor of entries) {
        const window = eloWindow(Date.now() - anchor.joinedAt);
        const candidates = entries
          .filter((e) => e !== anchor && Math.abs(e.elo - anchor.elo) <= window)
          .sort((a, b) => Math.abs(a.elo - anchor.elo) - Math.abs(b.elo - anchor.elo));
        const chosen = [anchor];
        let total = anchor.playerIds.length;
        for (const c of candidates) {
          if (total + c.playerIds.length > perTeam * 2) continue;
          chosen.push(c);
          total += c.playerIds.length;
          if (total === perTeam * 2) break;
        }
        if (total !== perTeam * 2) continue;
        const teams = packTeams(chosen, perTeam);
        if (!teams) continue;
        await this.launch(key, teams);
        entries = entries.filter((e) => !chosen.includes(e));
        formed = true;
        break;
      }
    }

    for (const e of entries) {
      const status = await this.statusFor(e, entries.reduce((n, x) => n + x.playerIds.length, 0));
      for (const id of e.playerIds) this.deps.presence.socketOf(id)?.emit('queue:status', status);
    }
  }

  private async launch(key: string, teams: Record<TeamId, QueueEntry[]>): Promise<void> {
    const any = teams.A[0];
    const seats: Record<TeamId, Seat[]> = teamRecord(() => []);
    for (const t of ['A', 'B'] as const) {
      for (const e of teams[t]) {
        await this.deps.store.removeEntry(e.entryId);
        this.recordWait(key, Date.now() - e.joinedAt);
        for (const id of e.playerIds) {
          const seat = seatFor(this.deps.players, id, e.teamSize);
          if (seat) seats[t].push(seat);
          this.deps.presence.socketOf(id)?.emit('queue:status', idleStatus());
        }
      }
    }
    const rules = rulesForQueue(any.mode, any.teamSize, any.ranked);
    const match = this.deps.registry.create({ rules, teams: seats });
    log.info('match formed from queue', { key, matchId: match.id });
  }

  /** Player accepts the ghost offer: leave the queue and start a ghost match. */
  async acceptGhost(playerId: string): Promise<{ ok: true; matchId: string } | { ok: false; error: string }> {
    const entry = await this.deps.store.findByPlayer(playerId);
    if (!entry) return { ok: false, error: 'You are not in the queue' };
    const status = await this.statusFor(entry);
    if (!status.ghostAvailable) return { ok: false, error: 'Ghost matches unlock after 20 seconds in the 1v1 queue' };
    await this.deps.store.removeEntry(entry.entryId);
    const res = this.deps.registry.createGhostMatch(playerId, entry.ranked);
    if ('error' in res) {
      await this.deps.store.add(entry);
      return { ok: false, error: res.error };
    }
    this.deps.presence.socketOf(playerId)?.emit('queue:status', idleStatus());
    return { ok: true, matchId: res.id };
  }
}

export function idleStatus(): QueueStatus {
  return {
    state: 'idle',
    teamSize: null,
    mode: null,
    ranked: false,
    since: 0,
    estimatedWaitMs: 0,
    eloWindow: MATCHMAKING.baseWindow,
    ghostAvailable: false,
    partySize: 0,
  };
}
