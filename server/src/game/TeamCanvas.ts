import { STROKE_LIMITS, type DrawOp, type FillInput, type FillOp, type StrokeBatchInput, type StrokeOp } from '@ccc/shared';

type Action = { kind: 'add'; ids: string[] } | { kind: 'hide'; ids: string[] };

export type CanvasResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface VisibilityChange {
  ids: string[];
  hidden: boolean;
}

/** Authoritative op store for one team's shared canvas during one round. */
export class TeamCanvas {
  readonly ops: DrawOp[] = [];
  private readonly byId = new Map<string, DrawOp>();
  private readonly undoStacks = new Map<string, Action[]>();
  private readonly redoStacks = new Map<string, Action[]>();

  private push(playerId: string, action: Action): void {
    const stack = this.undoStacks.get(playerId) ?? [];
    stack.push(action);
    if (stack.length > 200) stack.shift();
    this.undoStacks.set(playerId, stack);
    this.redoStacks.set(playerId, []);
  }

  addStrokeBatch(playerId: string, batch: StrokeBatchInput, times: number[]): CanvasResult<StrokeOp> {
    const existing = this.byId.get(batch.id);
    if (existing) {
      if (existing.kind !== 'stroke' || existing.playerId !== playerId) return { ok: false, error: 'stroke id conflict' };
      if (existing.done) return { ok: false, error: 'stroke already finished' };
      if (existing.points.length / 3 + batch.points.length / 3 > STROKE_LIMITS.maxPointsPerStroke) return { ok: false, error: 'stroke too long' };
      existing.points.push(...batch.points);
      existing.times.push(...times);
      existing.done = batch.done;
      return { ok: true, value: existing };
    }
    if (this.ops.length >= STROKE_LIMITS.maxOpsPerTeamRound) return { ok: false, error: 'canvas op limit reached' };
    const op: StrokeOp = {
      kind: 'stroke',
      id: batch.id,
      playerId,
      color: batch.color.toLowerCase(),
      size: batch.size,
      points: [...batch.points],
      times,
      done: batch.done,
      hidden: false,
    };
    this.ops.push(op);
    this.byId.set(op.id, op);
    this.push(playerId, { kind: 'add', ids: [op.id] });
    return { ok: true, value: op };
  }

  addFill(playerId: string, input: FillInput, t: number): CanvasResult<FillOp> {
    if (this.byId.has(input.id)) return { ok: false, error: 'fill id conflict' };
    if (this.ops.length >= STROKE_LIMITS.maxOpsPerTeamRound) return { ok: false, error: 'canvas op limit reached' };
    const op: FillOp = { kind: 'fill', id: input.id, playerId, color: input.color.toLowerCase(), x: input.x, y: input.y, t, hidden: false };
    this.ops.push(op);
    this.byId.set(op.id, op);
    this.push(playerId, { kind: 'add', ids: [op.id] });
    return { ok: true, value: op };
  }

  /** Inserts a fully-formed op (ghost replay). Not undoable. */
  insertRaw(op: DrawOp): void {
    this.ops.push(op);
    this.byId.set(op.id, op);
  }

  private setHidden(ids: string[], hidden: boolean): string[] {
    const changed: string[] = [];
    for (const id of ids) {
      const op = this.byId.get(id);
      if (op && op.hidden !== hidden) {
        op.hidden = hidden;
        changed.push(id);
      }
    }
    return changed;
  }

  /** Eraser and clear only ever touch the caller's own ops. */
  hideOwn(playerId: string, ids: string[]): VisibilityChange | null {
    const own = ids.filter((id) => this.byId.get(id)?.playerId === playerId);
    const changed = this.setHidden(own, true);
    if (!changed.length) return null;
    this.push(playerId, { kind: 'hide', ids: changed });
    return { ids: changed, hidden: true };
  }

  clearOwn(playerId: string): VisibilityChange | null {
    const ids = this.ops.filter((o) => o.playerId === playerId && !o.hidden).map((o) => o.id);
    return this.hideOwn(playerId, ids);
  }

  undo(playerId: string): VisibilityChange | null {
    const action = this.undoStacks.get(playerId)?.pop();
    if (!action) return null;
    const redo = this.redoStacks.get(playerId) ?? [];
    redo.push(action);
    this.redoStacks.set(playerId, redo);
    const hidden = action.kind === 'add';
    const changed = this.setHidden(action.ids, hidden);
    // A stroke still being drawn is closed when undone so late batches can't revive it.
    for (const id of action.ids) {
      const op = this.byId.get(id);
      if (op?.kind === 'stroke') op.done = true;
    }
    return changed.length ? { ids: changed, hidden } : null;
  }

  redo(playerId: string): VisibilityChange | null {
    const action = this.redoStacks.get(playerId)?.pop();
    if (!action) return null;
    const undo = this.undoStacks.get(playerId) ?? [];
    undo.push(action);
    this.undoStacks.set(playerId, undo);
    const hidden = action.kind === 'hide';
    const changed = this.setHidden(action.ids, hidden);
    return changed.length ? { ids: changed, hidden } : null;
  }

  /** Visible ops only, with in-progress strokes closed. Used for rendering, storage and replays. */
  finalOps(): DrawOp[] {
    return this.ops.filter((o) => !o.hidden).map((o) => (o.kind === 'stroke' ? { ...o, done: true } : { ...o }));
  }

  isEmpty(): boolean {
    return !this.ops.some((o) => !o.hidden);
  }
}
