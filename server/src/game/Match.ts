import {
  GHOST_ELO_FACTOR,
  MATCH_TIMINGS,
  RECONNECT_WINDOW_MS,
  TEAM_IDS,
  TEAMMATE_LABEL_COLORS,
  teamRecord,
  allowedColorsFor,
  customColorAllowed,
  rankFromElo,
  type CursorInput,
  type DrawOp,
  type EloChange,
  type EraseInput,
  type FillInput,
  type MatchPhase,
  type MatchPlayer,
  type MatchResultPayload,
  type MatchRules,
  type MatchSnapshot,
  type PhaseInfo,
  type RelayState,
  type RoundSummary,
  type ShowdownPayload,
  type StrokeBatchInput,
  type TeamId,
} from '@ccc/shared';
import { config } from '../config';
import type { MatchesRepo, MatchPlayerInsert } from '../db/repos/matches';
import { roundImageUrl } from '../db/repos/matches';
import type { GhostRecording, GhostsRepo, ModerationRepo } from '../db/repos/misc';
import type { PlayersRepo } from '../db/repos/players';
import type { PhotoService, PreparedPhoto } from '../photos/photoService';
import { average, eloDelta } from '../ranking/elo';
import { applyMatchProgress } from '../ranking/progression';
import { computeContributions, renderPreviewDataUrl, renderTeamPng } from '../render/serverRender';
import type { ScoringService } from '../scoring/scoringService';
import type { Presence } from '../socket/presence';
import type { TypedServer, TypedSocket } from '../socket/types';
import { newId } from '../util/ids';
import { errMessage, log } from '../util/logger';
import { buildGhostTimeline } from './ghostReplay';
import { decideRound, matchProgress } from './outcome';
import { archiveRound } from './roundArchive';
import { TeamCanvas } from './TeamCanvas';

export interface Seat {
  id: string;
  name: string;
  level: number;
  elo: number;
  games: number;
  isGhost: boolean;
}

export interface MatchHooks {
  onClosed(match: Match): void;
  onRematch(match: Match): void;
  onRageQuit(playerId: string, matchId: string): void;
}

export interface MatchDeps {
  io: TypedServer;
  presence: Presence;
  photos: PhotoService;
  scoring: ScoringService;
  players: PlayersRepo;
  matches: MatchesRepo;
  ghosts: GhostsRepo;
  moderation: ModerationRepo;
  hooks: MatchHooks;
}

export interface MatchOptions {
  rules: MatchRules;
  teams: Partial<Record<TeamId, Seat[]>>;
  ghostPlan?: GhostRecording[];
  uploadsKey?: string | null;
  spectatorIds?: string[];
  roomCode?: string | null;
}

interface Participant extends MatchPlayer {
  games: number;
  left: boolean;
  dcTimer: NodeJS.Timeout | null;
}

interface RoundState {
  photo: PreparedPhoto;
  canvases: Record<TeamId, TeamCanvas>;
  drawStartedAt: number;
  ghost: GhostRecording | null;
}

export class Match {
  readonly id = newId('m_');
  readonly rules: MatchRules;
  readonly roomCode: string | null;
  readonly createdAt = Date.now();
  private readonly players = new Map<string, Participant>();
  private readonly spectators = new Set<string>();
  private readonly accepted = new Set<string>();
  private readonly rematchVotes = new Set<string>();
  private readonly ghostPlan: GhostRecording[];
  private readonly uploadsKey: string | null;

  private phase: MatchPhase = 'MATCH_FOUND';
  private phaseEndsAt = 0;
  private phaseTimer: NodeJS.Timeout | null = null;
  private roundTimers: NodeJS.Timeout[] = [];
  private relayTimers: Partial<Record<TeamId, NodeJS.Timeout>> = {};
  private relay: Record<TeamId, RelayState | null> = teamRecord(() => null);
  private round = 0;
  private suddenDeath = false;
  private suddenDeathRounds = 0;
  private score: Record<TeamId, number> = teamRecord(() => 0);
  private readonly usedPhotos = new Set<string>();
  private current: RoundState | null = null;
  private readonly history: RoundSummary[] = [];
  private readonly roundContribs: Array<Record<string, number>> = [];
  private lastShowdown: ShowdownPayload | null = null;
  private result: MatchResultPayload | null = null;
  private aiDegraded = false;
  private finishing = false;
  private closed = false;

  constructor(
    private readonly deps: MatchDeps,
    opts: MatchOptions,
  ) {
    this.rules = opts.rules;
    this.ghostPlan = opts.ghostPlan ?? [];
    this.uploadsKey = opts.uploadsKey ?? null;
    this.roomCode = opts.roomCode ?? null;
    for (const team of this.rules.teamIds) {
      (opts.teams[team] ?? []).forEach((seat, slot) => {
        this.players.set(seat.id, {
          id: seat.id,
          name: seat.name,
          level: seat.level,
          elo: Math.round(seat.elo),
          rank: rankFromElo(seat.elo),
          isGhost: seat.isGhost,
          team,
          slot,
          labelColor: TEAMMATE_LABEL_COLORS[slot % TEAMMATE_LABEL_COLORS.length],
          connected: seat.isGhost,
          allowedColors: allowedColorsFor(this.rules, slot),
          games: seat.games,
          left: false,
          dcTimer: null,
        });
      });
    }
    for (const s of opts.spectatorIds ?? []) this.spectators.add(s);
  }

  // ---------------------------------------------------------------- rooms & helpers

  private get room(): string {
    return `m:${this.id}`;
  }
  /** Sides taking part in this match. */
  private get teams(): TeamId[] {
    return this.rules.teamIds;
  }
  private teamRoom(t: TeamId): string {
    return `m:${this.id}:${t}`;
  }
  private get specRoom(): string {
    return `m:${this.id}:spec`;
  }

  humans(): Participant[] {
    return [...this.players.values()].filter((p) => !p.isGhost);
  }

  humanIds(): string[] {
    return this.humans().map((p) => p.id);
  }

  spectatorIds(): string[] {
    return [...this.spectators];
  }

  teamSeats(): Partial<Record<TeamId, Seat[]>> {
    const out: Partial<Record<TeamId, Seat[]>> = {};
    for (const p of [...this.players.values()].sort((a, b) => a.slot - b.slot)) {
      (out[p.team] ??= []).push({ id: p.id, name: p.name, level: p.level, elo: p.elo, games: p.games, isGhost: p.isGhost });
    }
    return out;
  }

  isFinished(): boolean {
    return this.finishing || this.closed;
  }

  get currentPhase(): MatchPhase {
    return this.phase;
  }

  hasPlayer(id: string): boolean {
    return this.players.has(id);
  }

  hasSpectator(id: string): boolean {
    return this.spectators.has(id);
  }

  private publicPlayers(): MatchPlayer[] {
    return [...this.players.values()].map(({ games: _g, left: _l, dcTimer: _d, ...pub }) => pub);
  }

  private phaseInfo(): PhaseInfo {
    return {
      phase: this.phase,
      phaseEndsAt: this.phaseEndsAt,
      serverNow: Date.now(),
      round: this.round,
      score: { ...this.score },
      suddenDeath: this.suddenDeath,
      relay: { ...this.relay },
      aiDegraded: this.aiDegraded,
    };
  }

  private setPhase(phase: MatchPhase, durationMs: number, next: (() => void) | null): void {
    if (this.closed) return;
    this.phase = phase;
    this.phaseEndsAt = Date.now() + durationMs;
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phaseTimer = next ? setTimeout(() => this.safely(next), durationMs) : null;
    this.deps.io.to(this.room).emit('match:phase', this.phaseInfo());
  }

  private safely(fn: () => void | Promise<void>): void {
    if (this.closed) return;
    Promise.resolve()
      .then(fn)
      .catch((err: unknown) => {
        log.error('match step failed', { matchId: this.id, phase: this.phase, error: errMessage(err), stack: err instanceof Error ? err.stack : undefined });
        this.abort('An internal error ended this match.');
      });
  }

  private socketsFor(ids: string[]): TypedSocket[] {
    return ids.map((id) => this.deps.presence.socketOf(id)).filter((s): s is TypedSocket => !!s);
  }

  // ---------------------------------------------------------------- lifecycle

  start(): void {
    this.deps.matches.start(this.id, this.rules);
    for (const id of [...this.humanIds(), ...this.spectators]) {
      const socket = this.deps.presence.socketOf(id);
      if (!socket) continue;
      this.joinRooms(socket, id);
      const p = this.players.get(id);
      if (p) p.connected = true;
    }
    // Anyone offline at kickoff gets the normal reconnect window.
    for (const p of this.humans()) if (!p.connected) this.handleDisconnectAtStart(p.id);
    const acceptBy = Date.now() + MATCH_TIMINGS.matchFoundMs;
    for (const id of [...this.humanIds(), ...this.spectators]) {
      this.deps.presence.socketOf(id)?.emit('match:found', {
        matchId: this.id,
        rules: this.rules,
        players: this.publicPlayers(),
        myTeam: this.players.get(id)?.team ?? null,
        acceptBy,
        serverNow: Date.now(),
      });
    }
    this.setPhase('MATCH_FOUND', MATCH_TIMINGS.matchFoundMs, () => this.teamIntro());
    log.info('match started', { matchId: this.id, mode: this.rules.mode, teamSize: this.rules.teamSize, ranked: this.rules.ranked, ghost: this.rules.ghost });
  }

  accept(playerId: string): void {
    if (this.phase !== 'MATCH_FOUND' || !this.players.has(playerId)) return;
    this.accepted.add(playerId);
    const allIn = this.humans().every((p) => this.accepted.has(p.id));
    const minShown = Date.now() - (this.phaseEndsAt - MATCH_TIMINGS.matchFoundMs) >= 1500;
    if (allIn && minShown) this.teamIntro();
  }

  private teamIntro(): void {
    if (this.phase !== 'MATCH_FOUND') return;
    this.setPhase('TEAM_INTRO', MATCH_TIMINGS.teamIntroMs, () => this.startRound());
  }

  private ghostTeam(): TeamId | null {
    for (const p of this.players.values()) if (p.isGhost) return p.team;
    return null;
  }

  private async startRound(): Promise<void> {
    this.round++;
    if (this.suddenDeath) this.suddenDeathRounds++;
    const ghost = this.ghostTeam() ? this.nextGhostRecording() : null;
    const photo = await this.deps.photos.prepareForRound({
      rules: this.rules,
      playerIds: this.humanIds(),
      usedInMatch: this.usedPhotos,
      uploadsKey: this.uploadsKey,
      forcedPhotoId: ghost?.photoId,
    });
    if (this.closed || this.finishing) return;
    this.usedPhotos.add(photo.record.id);
    this.current = { photo, canvases: teamRecord(() => new TeamCanvas()), drawStartedAt: 0, ghost };
    this.relay = teamRecord(() => null);

    this.setPhase('PEEK', this.rules.peekMs, () => this.startDraw());
    for (const id of [...this.humanIds(), ...this.spectators]) {
      const socket = this.deps.presence.socketOf(id);
      if (!socket) continue;
      socket.emit('round:peek', { round: this.round, photoUrl: this.deps.photos.issueToken(photo.image, id), mirrored: photo.mirrored });
    }
  }

  private nextGhostRecording(): GhostRecording | null {
    const plan = this.ghostPlan.filter((g) => !this.usedPhotos.has(g.photoId) && this.deps.photos.byId(g.photoId));
    return plan[0] ?? null;
  }

  private startDraw(): void {
    if (!this.current) return;
    this.current.drawStartedAt = Date.now();
    for (const team of this.teams) if (this.rules.relay) this.initRelay(team);
    this.setPhase('DRAW', this.rules.drawMs, () => this.endDraw());
    this.scheduleGhost();
    if (this.rules.opponentPreview) this.schedulePreviews();
  }

  // ---------------------------------------------------------------- relay

  private initRelay(team: TeamId): void {
    const order = this.humans()
      .filter((p) => p.team === team)
      .sort((a, b) => a.slot - b.slot)
      .map((p) => p.id);
    if (!order.length) return;
    this.relay[team] = { activePlayerId: null, turnEndsAt: 0, order };
    this.advanceRelay(team, -1);
  }

  private advanceRelay(team: TeamId, fromIndex: number): void {
    const state = this.relay[team];
    if (!state || this.phase !== 'DRAW') return;
    const n = state.order.length;
    let idx = -1;
    for (let step = 1; step <= n; step++) {
      const candidate = (fromIndex + step + n) % n;
      if (this.players.get(state.order[candidate])?.connected) {
        idx = candidate;
        break;
      }
    }
    const drawEnd = this.phaseEndsAt;
    state.activePlayerId = idx >= 0 ? state.order[idx] : null;
    state.turnEndsAt = Math.min(drawEnd, Date.now() + this.rules.relayTurnMs);
    const pending = this.relayTimers[team];
    if (pending) clearTimeout(pending);
    if (state.turnEndsAt < drawEnd) {
      this.relayTimers[team] = setTimeout(() => this.advanceRelay(team, idx), state.turnEndsAt - Date.now());
    }
    this.deps.io.to(this.room).emit('relay:turn', { team, relay: { ...state } });
  }

  // ---------------------------------------------------------------- ghost & previews

  private scheduleGhost(): void {
    const team = this.ghostTeam();
    const rec = this.current?.ghost;
    if (!team || !rec) return;
    const ghostId = [...this.players.values()].find((p) => p.isGhost)?.id ?? 'ghost';
    const timeline = buildGhostTimeline(rec.ops, rec.drawMs, this.rules.drawMs, ghostId);
    for (const ev of timeline) {
      this.roundTimers.push(
        setTimeout(() => {
          if (this.phase !== 'DRAW' || !this.current) return;
          const canvas = this.current.canvases[team];
          const existing = canvas.ops.find((o) => o.id === ev.op.id);
          if (ev.op.kind === 'fill') {
            if (!existing) canvas.insertRaw({ ...ev.op });
            this.deps.io.to(this.specRoom).emit('draw:fill', { ...ev.op, team });
            return;
          }
          const pts = ev.appendPoints ?? [];
          const times = ev.appendTimes ?? [];
          if (existing && existing.kind === 'stroke') {
            existing.points.push(...pts);
            existing.times.push(...times);
            existing.done = ev.done ?? existing.done;
          } else {
            canvas.insertRaw({ ...ev.op, points: [...pts], times: [...times], done: ev.done ?? false });
          }
          this.deps.io.to(this.specRoom).emit('draw:stroke', {
            team,
            playerId: ghostId,
            id: ev.op.id,
            color: ev.op.color,
            size: ev.op.size,
            points: pts,
            times,
            done: ev.done ?? false,
          });
        }, ev.at),
      );
    }
  }

  private schedulePreviews(): void {
    const tick = (): void => {
      if (this.phase !== 'DRAW' || !this.current) return;
      for (const team of this.teams) {
        const image = renderPreviewDataUrl(this.current.canvases[team].ops);
        const others = this.teams.filter((t) => t !== team).map((t) => this.teamRoom(t));
        this.deps.io.to(others).emit('match:preview', { team, image });
      }
      this.roundTimers.push(setTimeout(tick, 2500));
    };
    this.roundTimers.push(setTimeout(tick, 2500));
  }

  private clearRoundTimers(): void {
    for (const t of this.roundTimers) clearTimeout(t);
    this.roundTimers = [];
    for (const t of Object.values(this.relayTimers)) if (t) clearTimeout(t);
    this.relayTimers = {};
  }

  // ---------------------------------------------------------------- scoring & showdown

  private endDraw(): void {
    this.clearRoundTimers();
    this.relay = teamRecord(() => null);
    this.setPhase('SCORING', MATCH_TIMINGS.scoringMinMs, null);
    this.safely(() => this.scoreRound());
  }

  private async scoreRound(): Promise<void> {
    const cur = this.current;
    if (!cur) return;
    const started = Date.now();
    const teams = this.teams;
    const perTeam = <T>(fn: (t: TeamId) => T): Partial<Record<TeamId, T>> => Object.fromEntries(teams.map((t) => [t, fn(t)]));
    const ops = teamRecord((t) => (teams.includes(t) ? cur.canvases[t].finalOps() : []));
    const renders = perTeam((t) => renderTeamPng(ops[t]));
    const memberIds = (t: TeamId) => [...this.players.values()].filter((p) => p.team === t).sort((a, b) => a.slot - b.slot).map((p) => p.id);
    const contributions = teamRecord((t) => (teams.includes(t) ? computeContributions(ops[t], memberIds(t)) : []));

    const outcome = await this.deps.scoring.scoreRound({
      matchId: this.id,
      round: this.round,
      photoId: cur.photo.record.id,
      mirrored: cur.photo.mirrored,
      reference: cur.photo.image,
      drawings: renders,
    });
    if (this.closed || this.finishing) return;

    if (outcome.usedFallback && !this.aiDegraded) {
      this.aiDegraded = true;
      this.deps.io.to(this.room).emit('notice', {
        kind: 'warn',
        code: 'ai_fallback',
        message: 'The AI judge is unavailable, so this match is being scored by the pixel judge (estimated).',
      });
    }

    const wait = MATCH_TIMINGS.scoringMinMs - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    if (this.closed || this.finishing) return;

    const details = outcome.details;
    const decision = decideRound(details, teams, this.rules.tieBreakByPixels || config.scoring.tieBreakByPixels);
    for (const t of teams) this.score[t] += decision.points[t];

    const contribMap: Record<string, number> = {};
    for (const t of teams) for (const c of contributions[t]) contribMap[c.playerId] = c.pct;
    this.roundContribs.push(contribMap);

    const record = cur.photo.record;
    const referenceUrl = record.revealUrl ?? roundImageUrl(this.id, this.round, 'ref');
    const estimated = teams.some((t) => details[t]?.estimated);
    await archiveRound(this.id, this.round, cur.photo.image, perTeam((t) => renders[t]?.png ?? Buffer.alloc(0)));
    this.deps.matches.insertRound({
      matchId: this.id,
      round: this.round,
      photoId: record.id,
      photoTitle: record.title,
      mirrored: cur.photo.mirrored,
      revealUrl: record.revealUrl,
      attribution: record.attribution,
      teamIds: teams,
      scores: details,
      winner: decision.winner,
      estimated,
      drawMs: this.rules.drawMs,
      ops: perTeam((t) => ops[t]),
    });
    this.recordGhosts(ops, teamRecord((t) => details[t]?.score ?? 0));

    const summary: RoundSummary = {
      round: this.round,
      photoTitle: record.title,
      referenceUrl,
      mirrored: cur.photo.mirrored,
      images: perTeam((t) => roundImageUrl(this.id, this.round, t)),
      scores: perTeam((t) => details[t]?.score ?? 0),
      winner: decision.winner,
      estimated,
    };
    this.history.push(summary);
    this.lastShowdown = {
      round: this.round,
      suddenDeath: this.suddenDeath,
      referenceUrl,
      mirrored: cur.photo.mirrored,
      attribution: record.attribution,
      teams: Object.fromEntries(
        teams.flatMap((t) => {
          const detail = details[t];
          return detail ? [[t, { detail, imageUrl: roundImageUrl(this.id, this.round, t), contributions: contributions[t] }]] : [];
        }),
      ),
      winner: decision.winner,
      scoreAfter: { ...this.score },
    };
    this.deps.io.to(this.room).emit('round:showdown', this.lastShowdown);
    this.setPhase('SHOWDOWN', MATCH_TIMINGS.showdownMs, () => this.afterShowdown());
  }

  /** Stores 1v1 drawings of curated photos as ghosts for future "Play vs Ghost" matches. */
  private recordGhosts(ops: Record<TeamId, DrawOp[]>, scores: Record<TeamId, number>): void {
    const cur = this.current;
    if (!cur || this.rules.ghost || this.rules.format !== 'teams' || this.rules.teamSize !== '1v1' || this.rules.mirror || this.uploadsKey) return;
    if (!this.deps.photos.local.byId(cur.photo.record.id)) return;
    for (const team of this.teams) {
      const p = [...this.players.values()].find((x) => x.team === team && !x.isGhost);
      if (!p || scores[team] <= 5) continue;
      this.deps.ghosts.insert({
        id: newId('g_'),
        playerId: p.id,
        playerName: p.name,
        elo: p.elo,
        photoId: cur.photo.record.id,
        drawMs: this.rules.drawMs,
        opsJson: JSON.stringify(ops[team]),
        score: scores[team],
      });
    }
  }

  private afterShowdown(): void {
    const progress = matchProgress({
      score: this.score,
      teams: this.teams,
      roundsPlayed: this.round,
      roundsToWin: this.rules.roundsToWin,
      suddenDeathRoundsPlayed: this.suddenDeathRounds,
      inSuddenDeath: this.suddenDeath,
    });
    if (progress.kind === 'finished') {
      this.finish(progress.winner, false, null);
      return;
    }
    this.suddenDeath = progress.suddenDeath;
    this.safely(() => this.startRound());
  }

  // ---------------------------------------------------------------- finishing

  private finish(winner: TeamId | 'draw', forfeit: boolean, forfeitingTeam: TeamId | null): void {
    if (this.finishing || this.closed) return;
    this.finishing = true;
    this.clearRoundTimers();

    const all = [...this.players.values()];
    const teamElo = (t: TeamId) => average(all.filter((p) => p.team === t).map((p) => p.elo));
    const opponentElo = (t: TeamId) => average(all.filter((p) => p.team !== t).map((p) => p.elo));
    const eloChanges: Record<string, EloChange> = {};
    const xp: MatchResultPayload['xp'] = {};
    const contributions: Record<string, number> = {};
    const inserts: MatchPlayerInsert[] = [];

    for (const p of all) {
      const vals = this.roundContribs.map((r) => r[p.id]).filter((v): v is number => typeof v === 'number');
      contributions[p.id] = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : 0;
    }
    const mvpPool = all.filter((p) => !p.isGhost && (winner === 'draw' || p.team === winner));
    const mvp = mvpPool.sort((a, b) => contributions[b.id] - contributions[a.id])[0] ?? null;

    for (const p of all) {
      const result: 'win' | 'loss' | 'draw' = winner === 'draw' ? 'draw' : p.team === winner ? 'win' : 'loss';
      let before = p.elo;
      let after = p.elo;
      if (!p.isGhost) {
        const rating = this.deps.players.rating(p.id, this.rules.teamSize);
        before = rating.elo;
        after = rating.elo;
        if (this.rules.ranked) {
          let factor = this.rules.ghost ? GHOST_ELO_FACTOR : 1;
          // Teammates who stayed when their team forfeited lose less.
          if (forfeit && p.team === forfeitingTeam && p.connected && !p.left) factor *= 0.5;
          const actual = result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
          after = rating.elo + eloDelta({ teamElo: teamElo(p.team), opponentElo: opponentElo(p.team), actual, gamesPlayed: rating.games, factor });
          this.deps.players.applyRating(p.id, this.rules.teamSize, after, result);
        }
        const row = this.deps.players.byId(p.id);
        if (row) {
          const roundsWon = this.history.filter((h) => h.winner === p.team).length;
          const prog = applyMatchProgress(row, result, roundsWon, this.rules.ghost ? 0.5 : 1);
          this.deps.players.applyProgress(p.id, prog);
          xp[p.id] = { gained: prog.gained, level: prog.level, leveledUp: prog.leveledUp };
        }
        eloChanges[p.id] = {
          before: Math.round(before),
          after: Math.round(after),
          delta: Math.round(after - before),
          rankBefore: rankFromElo(before),
          rankAfter: rankFromElo(after),
        };
      }
      inserts.push({
        playerId: p.id,
        team: p.team,
        isGhost: p.isGhost,
        eloBefore: p.isGhost ? null : before,
        eloAfter: p.isGhost ? null : after,
        delta: after - before,
        result,
        mvp: mvp?.id === p.id,
        contribution: contributions[p.id],
      });
    }

    this.deps.matches.finish(this.id, winner, Object.fromEntries(this.teams.map((t) => [t, this.score[t]])), forfeit, this.aiDegraded, inserts);
    this.deps.scoring.releaseMatch(this.id);

    this.result = {
      winner,
      finalScore: { ...this.score },
      forfeit,
      mvpPlayerId: mvp?.id ?? null,
      eloChanges,
      xp,
      contributions,
      rounds: [...this.history],
      ranked: this.rules.ranked,
      ghost: this.rules.ghost,
    };
    this.deps.io.to(this.room).emit('match:result', this.result);
    for (const p of this.humans()) {
      const profile = this.deps.players.profile(p.id);
      if (profile) this.deps.presence.socketOf(p.id)?.emit('session:profile', profile);
    }
    this.setPhase('MATCH_RESULT', MATCH_TIMINGS.resultLingerMs, () => this.close('ended'));
    log.info('match finished', { matchId: this.id, winner, score: this.score, forfeit });
  }

  /** Ends the match without results (internal error or everyone abandoned). */
  abort(reason: string): void {
    if (this.closed) return;
    this.deps.io.to(this.room).emit('notice', { kind: 'error', code: 'match_aborted', message: reason });
    this.close(reason);
  }

  close(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    this.clearRoundTimers();
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    for (const p of this.players.values()) if (p.dcTimer) clearTimeout(p.dcTimer);
    this.deps.io.to(this.room).emit('match:closed', { matchId: this.id, reason });
    for (const room of [this.room, ...TEAM_IDS.map((t) => this.teamRoom(t)), this.specRoom]) this.deps.io.socketsLeave(room);
    this.deps.hooks.onClosed(this);
  }

  // ---------------------------------------------------------------- connections

  private joinRooms(socket: TypedSocket, playerId: string): void {
    const p = this.players.get(playerId);
    void socket.join(this.room);
    if (p) void socket.join(this.teamRoom(p.team));
    else void socket.join(this.specRoom);
  }

  attach(playerId: string, socket: TypedSocket): void {
    if (this.closed) return;
    this.joinRooms(socket, playerId);
    const p = this.players.get(playerId);
    if (p && !p.connected && !p.left) {
      p.connected = true;
      if (p.dcTimer) clearTimeout(p.dcTimer);
      p.dcTimer = null;
      this.deps.io.to(this.room).emit('player:status', { playerId, connected: true });
      if (this.rules.relay && this.phase === 'DRAW' && this.relay[p.team]?.activePlayerId === null) this.advanceRelay(p.team, -1);
    }
    socket.emit('match:snapshot', this.snapshotFor(playerId));
  }

  addSpectator(playerId: string, socket: TypedSocket): void {
    this.spectators.add(playerId);
    this.attach(playerId, socket);
  }

  private handleDisconnectAtStart(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p) return;
    p.dcTimer = setTimeout(() => this.safely(() => this.reconnectWindowExpired(playerId)), RECONNECT_WINDOW_MS);
  }

  handleDisconnect(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p) {
      this.spectators.delete(playerId);
      return;
    }
    if (!p.connected) return;
    p.connected = false;
    this.deps.io.to(this.room).emit('player:status', { playerId, connected: false });
    if (this.phase === 'MATCH_RESULT' || this.isFinished()) {
      this.rematchVotes.delete(playerId);
      return;
    }
    if (this.rules.relay && this.phase === 'DRAW' && this.relay[p.team]?.activePlayerId === playerId) {
      const idx = this.relay[p.team]?.order.indexOf(playerId) ?? -1;
      this.advanceRelay(p.team, idx);
    }
    p.dcTimer = setTimeout(() => this.safely(() => this.reconnectWindowExpired(playerId)), RECONNECT_WINDOW_MS);
    if (this.humans().every((h) => !h.connected)) {
      log.info('all players disconnected; waiting for reconnect window', { matchId: this.id });
    }
  }

  private reconnectWindowExpired(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p || p.connected || this.isFinished()) return;
    p.left = true;
    this.deps.hooks.onRageQuit(playerId, this.id);
    this.checkForfeit();
  }

  leave(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p) {
      this.spectators.delete(playerId);
      this.deps.presence.socketOf(playerId)?.leave(this.specRoom);
      return;
    }
    const socket = this.deps.presence.socketOf(playerId);
    if (socket) for (const room of [this.room, this.teamRoom(p.team)]) void socket.leave(room);
    if (this.phase === 'MATCH_RESULT' || this.isFinished()) {
      p.connected = false;
      this.rematchVotes.delete(playerId);
      this.deps.io.to(this.room).emit('player:status', { playerId, connected: false });
      if (this.humans().every((h) => !h.connected)) this.close('everyone left');
      return;
    }
    p.connected = false;
    p.left = true;
    if (p.dcTimer) clearTimeout(p.dcTimer);
    this.deps.io.to(this.room).emit('player:status', { playerId, connected: false });
    this.deps.hooks.onRageQuit(playerId, this.id);
    if (this.rules.relay && this.phase === 'DRAW' && this.relay[p.team]?.activePlayerId === playerId) {
      this.advanceRelay(p.team, this.relay[p.team]?.order.indexOf(playerId) ?? -1);
    }
    this.checkForfeit();
  }

  /**
   * A side whose every human has left (or timed out) is out. The others play on; once only one side
   * is left it wins by forfeit.
   */
  private checkForfeit(): void {
    const gone = (t: TeamId) => {
      const members = this.humans().filter((h) => h.team === t);
      return members.length > 0 && members.every((h) => h.left);
    };
    const out = this.teams.filter(gone);
    const remaining = this.teams.filter((t) => !gone(t));
    if (!out.length) return;
    if (remaining.length === 0) this.abort('Everyone left the match.');
    else if (remaining.length === 1) this.finish(remaining[0], true, out[out.length - 1]);
  }

  voteRematch(playerId: string): { ok: boolean; error?: string } {
    if (this.phase !== 'MATCH_RESULT' || !this.players.has(playerId)) return { ok: false, error: 'Rematch is only available after the match' };
    this.rematchVotes.add(playerId);
    const connectedHumans = this.humans().filter((h) => h.connected);
    const needed = connectedHumans.length;
    this.deps.io.to(this.room).emit('match:rematchVotes', { votes: [...this.rematchVotes], needed });
    const teamsPresent = this.teams.filter((t) => [...this.players.values()].some((p) => p.team === t && (p.isGhost || p.connected))).length >= 2;
    if (teamsPresent && connectedHumans.every((h) => this.rematchVotes.has(h.id))) this.deps.hooks.onRematch(this);
    return { ok: true };
  }

  snapshotFor(playerId: string): MatchSnapshot {
    const p = this.players.get(playerId);
    const spectator = !p;
    const cur = this.current;
    const visible = (t: TeamId): DrawOp[] => {
      if (!cur || (this.phase !== 'DRAW' && this.phase !== 'PEEK' && this.phase !== 'SCORING')) return [];
      if (spectator || p?.team === t) return cur.canvases[t].ops;
      return [];
    };
    const photoVisible = this.phase === 'PEEK' || (this.phase === 'DRAW' && this.rules.thumbnailVisible);
    return {
      ...this.phaseInfo(),
      matchId: this.id,
      rules: this.rules,
      players: this.publicPlayers(),
      myTeam: p?.team ?? null,
      spectator,
      ops: teamRecord(visible),
      photoUrl: cur && photoVisible ? this.deps.photos.issueToken(cur.photo.image, playerId) : null,
      rounds: [...this.history],
      lastShowdown: this.phase === 'SHOWDOWN' ? this.lastShowdown : null,
      result: this.phase === 'MATCH_RESULT' ? this.result : null,
      rematchVotes: [...this.rematchVotes],
    };
  }

  // ---------------------------------------------------------------- drawing input

  /** Common gate for all drawing input. Returns the participant when the input is allowed right now. */
  private drawer(playerId: string): Participant | string {
    const p = this.players.get(playerId);
    if (!p || p.isGhost) return 'not a player';
    if (this.phase !== 'DRAW' || !this.current) return 'drawing is closed';
    // Small grace window for batches in flight when the timer hits zero.
    if (Date.now() > this.phaseEndsAt + 300) return 'time is up';
    if (this.rules.relay) {
      const relay = this.relay[p.team];
      if (relay && relay.activePlayerId !== playerId) return 'not your turn';
    }
    return p;
  }

  private colorAllowed(p: Participant, color: string): boolean {
    const c = color.toLowerCase();
    if (p.allowedColors) return p.allowedColors.includes(c);
    return customColorAllowed(this.rules) || /^#[0-9a-f]{6}$/.test(c);
  }

  private emitToTeamAndSpecs(team: TeamId, exceptSocketId: string): ReturnType<TypedServer['to']> {
    return this.deps.io.to([this.teamRoom(team), this.specRoom]).except(exceptSocketId);
  }

  onStroke(playerId: string, socket: TypedSocket, batch: StrokeBatchInput): void {
    const p = this.drawer(playerId);
    const reject = (reason: string): void => void socket.emit('draw:reject', { id: batch.id, reason });
    if (typeof p === 'string') return reject(p);
    if (!this.colorAllowed(p, batch.color)) return reject('color not allowed');
    const cur = this.current as RoundState;
    const now = Date.now() - cur.drawStartedAt;
    const n = batch.points.length / 3;
    // Spread the batch across the ~30ms flush window so time-lapse playback is smooth.
    const times = Array.from({ length: n }, (_, i) => Math.max(0, Math.round(now - ((n - 1 - i) * 30) / Math.max(1, n))));
    const res = cur.canvases[p.team].addStrokeBatch(playerId, batch, times);
    if (!res.ok) return reject(res.error);
    this.emitToTeamAndSpecs(p.team, socket.id).emit('draw:stroke', {
      team: p.team,
      playerId,
      id: batch.id,
      color: res.value.color,
      size: res.value.size,
      points: batch.points,
      times,
      done: batch.done,
    });
  }

  onFill(playerId: string, socket: TypedSocket, input: FillInput): void {
    const p = this.drawer(playerId);
    const reject = (reason: string): void => void socket.emit('draw:reject', { id: input.id, reason });
    if (typeof p === 'string') return reject(p);
    if (!this.colorAllowed(p, input.color)) return reject('color not allowed');
    const cur = this.current as RoundState;
    const res = cur.canvases[p.team].addFill(playerId, input, Date.now() - cur.drawStartedAt);
    if (!res.ok) return reject(res.error);
    this.emitToTeamAndSpecs(p.team, socket.id).emit('draw:fill', { ...res.value, team: p.team });
  }

  private visibility(playerId: string, fn: (c: TeamCanvas, p: Participant) => { ids: string[]; hidden: boolean } | null): void {
    const p = this.drawer(playerId);
    if (typeof p === 'string' || !this.current) return;
    const change = fn(this.current.canvases[p.team], p);
    if (change) this.deps.io.to([this.teamRoom(p.team), this.specRoom]).emit('draw:visibility', { team: p.team, ...change });
  }

  onErase(playerId: string, input: EraseInput): void {
    this.visibility(playerId, (c) => c.hideOwn(playerId, input.ids));
  }
  onUndo(playerId: string): void {
    this.visibility(playerId, (c) => c.undo(playerId));
  }
  onRedo(playerId: string): void {
    this.visibility(playerId, (c) => c.redo(playerId));
  }
  onClear(playerId: string): void {
    this.visibility(playerId, (c) => c.clearOwn(playerId));
  }

  onCursor(playerId: string, socket: TypedSocket, input: CursorInput): void {
    const p = this.players.get(playerId);
    if (!p || this.phase !== 'DRAW') return;
    this.deps.io.to(this.teamRoom(p.team)).except(socket.id).emit('draw:cursor', { playerId, x: Math.round(input.x), y: Math.round(input.y) });
  }

  /** Emotes are allowed everywhere except while drawing. */
  canEmote(): boolean {
    return this.phase === 'MATCH_FOUND' || this.phase === 'TEAM_INTRO' || this.phase === 'SHOWDOWN' || this.phase === 'MATCH_RESULT';
  }

  canChat(): boolean {
    return this.phase === 'MATCH_RESULT';
  }

  roomName(): string {
    return this.room;
  }
}
