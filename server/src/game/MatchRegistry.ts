import { GHOST_ELO_FACTOR, maxRounds, rulesForQueue, type MatchRules, type TeamId, type TeamSize } from '@ccc/shared';
import type { PlayersRepo } from '../db/repos/players';
import { log } from '../util/logger';
import { Match, type MatchDeps, type MatchOptions, type Seat } from './Match';

export type RegistryDeps = Omit<MatchDeps, 'hooks'> & {
  onRageQuit(playerId: string, matchId: string): void;
  onMatchClosed(match: Match): void;
  onMatchCreated(match: Match): void;
};

export function seatFor(players: PlayersRepo, playerId: string, bucket: TeamSize): Seat | null {
  const row = players.byId(playerId);
  if (!row) return null;
  const rating = players.rating(playerId, bucket);
  const profile = players.profile(playerId);
  return { id: row.id, name: row.name, level: profile?.level ?? 1, elo: rating.elo, games: rating.games, isGhost: false };
}

/** Owns every live match on this instance and the player -> match index. */
export class MatchRegistry {
  private readonly matches = new Map<string, Match>();
  private readonly byPlayer = new Map<string, string>();

  constructor(private readonly deps: RegistryDeps) {
    setInterval(() => this.sweep(), 60_000).unref();
  }

  private matchDeps(): MatchDeps {
    return {
      ...this.deps,
      hooks: {
        onClosed: (m) => this.onClosed(m),
        onRematch: (m) => this.rematch(m),
        onRageQuit: (pid, mid) => this.deps.onRageQuit(pid, mid),
      },
    };
  }

  create(opts: MatchOptions): Match {
    const match = new Match(this.matchDeps(), opts);
    this.matches.set(match.id, match);
    for (const id of match.humanIds()) this.byPlayer.set(id, match.id);
    for (const id of match.spectatorIds()) this.byPlayer.set(id, match.id);
    match.start();
    this.deps.onMatchCreated(match);
    return match;
  }

  /** Builds a 1v1 against a recorded ghost near the player's Elo. */
  createGhostMatch(playerId: string, ranked: boolean): Match | { error: string } {
    const seat = seatFor(this.deps.players, playerId, '1v1');
    if (!seat) return { error: 'Unknown player' };
    const base: MatchRules = rulesForQueue('classic', '1v1', ranked);
    const plan = this.deps.ghosts.near(seat.elo, 300, playerId, maxRounds(base.roundsToWin) + 3);
    if (plan.length < 3) return { error: 'Not enough ghost recordings near your rating yet' };
    const lead = plan[0];
    const ghostSeat: Seat = { id: `ghost_${lead.id}`, name: `👻 ${lead.playerName}`, level: 1, elo: lead.elo, games: 99, isGhost: true };
    const rules: MatchRules = {
      ...base,
      ghost: true,
      opponentPreview: true,
      // Keep enough ghost rounds available even with draws.
      roundsToWin: Math.min(base.roundsToWin, Math.ceil((plan.length + 1) / 2)),
    };
    log.info('ghost match created', { playerId, ghostElo: lead.elo, eloFactor: GHOST_ELO_FACTOR });
    return this.create({ rules, teams: { A: [seat], B: [ghostSeat] }, ghostPlan: plan });
  }

  get(id: string): Match | undefined {
    return this.matches.get(id);
  }

  forPlayer(playerId: string): Match | undefined {
    const id = this.byPlayer.get(playerId);
    return id ? this.matches.get(id) : undefined;
  }

  /** Detaches a player from their match index (after leaving a finished match). */
  release(playerId: string): void {
    this.byPlayer.delete(playerId);
  }

  count(): number {
    return this.matches.size;
  }

  playersInMatches(): number {
    return this.byPlayer.size;
  }

  private rematch(old: Match): void {
    const teams = old.teamSeats();
    const ffa = old.rules.format === 'ffa';
    const refreshed: Partial<Record<TeamId, Seat[]>> = {};
    for (const t of old.rules.teamIds) {
      for (const s of teams[t] ?? []) {
        // In a free-for-all, players who walked away sit the rematch out instead of forfeiting it.
        if (ffa && !s.isGhost && !this.deps.presence.isOnline(s.id)) continue;
        (refreshed[t] ??= []).push(s.isGhost ? s : (seatFor(this.deps.players, s.id, old.rules.teamSize) ?? s));
      }
    }
    const rules = ffa ? { ...old.rules, teamIds: old.rules.teamIds.filter((t) => refreshed[t]?.length) } : old.rules;
    if (old.rules.ghost) {
      const human = refreshed.A?.find((s) => !s.isGhost) ?? refreshed.B?.find((s) => !s.isGhost);
      old.close('rematch');
      if (human) {
        const res = this.createGhostMatch(human.id, old.rules.ranked);
        if ('error' in res) this.deps.presence.socketOf(human.id)?.emit('notice', { kind: 'warn', code: 'ghost_unavailable', message: res.error });
      }
      return;
    }
    const spectators = old.spectatorIds();
    old.close('rematch');
    if (rules.teamIds.length < 2) return;
    this.create({ rules, teams: refreshed, spectatorIds: spectators, roomCode: old.roomCode });
  }

  private onClosed(match: Match): void {
    this.matches.delete(match.id);
    for (const [pid, mid] of this.byPlayer) if (mid === match.id) this.byPlayer.delete(pid);
    this.deps.onMatchClosed(match);
  }

  /** Safety net for matches that somehow outlive their timers. */
  private sweep(): void {
    const maxAge = 60 * 60_000;
    for (const m of this.matches.values()) {
      if (Date.now() - m.createdAt > maxAge) {
        log.warn('closing stale match', { matchId: m.id });
        m.abort('This match expired.');
      }
    }
  }
}
