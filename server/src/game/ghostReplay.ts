import type { DrawOp, FillOp, StrokeOp } from '@ccc/shared';

export interface GhostEvent {
  at: number;
  /** Either a new/extended stroke chunk or a fill. */
  op: DrawOp;
  appendPoints?: number[];
  appendTimes?: number[];
  done?: boolean;
}

const CHUNK_MS = 120;

/**
 * Turns a recorded drawing into a timeline of chunks, rescaled to the current draw window,
 * so the ghost appears to draw live. Hidden (undone) ops are skipped.
 */
export function buildGhostTimeline(ops: DrawOp[], recordedDrawMs: number, drawMs: number, ghostPlayerId: string): GhostEvent[] {
  const scale = Math.min(1, drawMs / Math.max(1, recordedDrawMs)) * 0.97;
  const events: GhostEvent[] = [];
  for (const src of ops) {
    if (src.hidden) continue;
    if (src.kind === 'fill') {
      const op: FillOp = { ...src, playerId: ghostPlayerId, t: src.t * scale };
      events.push({ at: op.t, op });
      continue;
    }
    const n = src.points.length / 3;
    if (!n) continue;
    const base: StrokeOp = { ...src, playerId: ghostPlayerId, points: [], times: [], done: false };
    let chunkStart = 0;
    while (chunkStart < n) {
      const t0 = (src.times[chunkStart] ?? 0) * scale;
      let end = chunkStart + 1;
      while (end < n && (src.times[end] ?? 0) * scale - t0 < CHUNK_MS) end++;
      events.push({
        at: t0,
        op: base,
        appendPoints: src.points.slice(chunkStart * 3, end * 3),
        appendTimes: src.times.slice(chunkStart, end).map((t) => t * scale),
        done: end >= n,
      });
      chunkStart = end;
    }
  }
  return events.sort((a, b) => a.at - b.at);
}
