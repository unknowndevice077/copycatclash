import { TEAM_IDS, teamRecord, type DrawOp, type FillOp, type StrokeOp, type TeamId } from '@ccc/shared';
import type { StrokeRelay } from '@ccc/shared';

export type ChangeKind = 'append' | 'full';
type Listener = (team: TeamId, kind: ChangeKind) => void;

/**
 * Client-side mirror of the team canvases for the current round.
 * Holds ops outside React so high-frequency stroke updates don't re-render components.
 */
class DrawSession {
  private ops: Record<TeamId, DrawOp[]> = teamRecord(() => []);
  private index: Record<TeamId, Map<string, DrawOp>> = teamRecord(() => new Map());
  private readonly listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(team: TeamId, kind: ChangeKind): void {
    for (const l of this.listeners) l(team, kind);
  }

  get(team: TeamId): DrawOp[] {
    return this.ops[team];
  }

  reset(): void {
    this.ops = teamRecord(() => []);
    this.index = teamRecord(() => new Map());
    for (const t of TEAM_IDS) this.emit(t, 'full');
  }

  load(ops: Record<TeamId, DrawOp[]>): void {
    for (const t of TEAM_IDS) {
      this.ops[t] = (ops[t] ?? []).map((o) => (o.kind === 'stroke' ? { ...o, points: [...o.points], times: [...o.times] } : { ...o }));
      this.index[t] = new Map(this.ops[t].map((o) => [o.id, o]));
      this.emit(t, 'full');
    }
  }

  private add(team: TeamId, op: DrawOp): void {
    this.ops[team].push(op);
    this.index[team].set(op.id, op);
  }

  /** Stroke batch from a teammate (or a ghost, for spectators). */
  remoteStroke(r: StrokeRelay): void {
    const existing = this.index[r.team].get(r.id);
    if (existing && existing.kind === 'stroke') {
      existing.points.push(...r.points);
      existing.times.push(...r.times);
      existing.done = r.done;
    } else if (!existing) {
      const op: StrokeOp = { kind: 'stroke', id: r.id, playerId: r.playerId, color: r.color, size: r.size, points: [...r.points], times: [...r.times], done: r.done, hidden: false };
      this.add(r.team, op);
    }
    this.emit(r.team, 'append');
  }

  remoteFill(team: TeamId, op: FillOp): void {
    if (this.index[team].has(op.id)) return;
    this.add(team, { ...op });
    this.emit(team, 'append');
  }

  visibility(team: TeamId, ids: string[], hidden: boolean): void {
    for (const id of ids) {
      const op = this.index[team].get(id);
      if (op) op.hidden = hidden;
    }
    this.emit(team, 'full');
  }

  /** The server refused one of our ops (relay turn, color lock, time up); drop it locally. */
  reject(id: string): void {
    for (const t of TEAM_IDS) {
      if (!this.index[t].has(id)) continue;
      this.ops[t] = this.ops[t].filter((o) => o.id !== id);
      this.index[t].delete(id);
      this.emit(t, 'full');
    }
  }

  localStrokeBegin(team: TeamId, op: StrokeOp): void {
    this.add(team, op);
    this.emit(team, 'append');
  }

  localStrokeAppend(team: TeamId, id: string, points: number[], done: boolean): void {
    const op = this.index[team].get(id);
    if (!op || op.kind !== 'stroke') return;
    op.points.push(...points);
    op.done = done;
    this.emit(team, 'append');
  }

  localFill(team: TeamId, op: FillOp): void {
    this.add(team, op);
    this.emit(team, 'append');
  }
}

export const drawSession = new DrawSession();
