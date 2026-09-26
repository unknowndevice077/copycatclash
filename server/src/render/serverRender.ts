import { createCanvas } from 'canvas';
import { CANVAS_H, CANVAS_W, clearCanvas, inkCoverage, renderOp, renderOps, type Contribution, type DrawOp } from '@ccc/shared';

/** Authoritative render of a team canvas from stored ops. Never trusts client pixels. */
export function renderTeamPng(ops: readonly DrawOp[]): { png: Buffer; coverage: number } {
  const canvas = createCanvas(CANVAS_W, CANVAS_H);
  const ctx = canvas.getContext('2d');
  renderOps(ctx, ops, CANVAS_W, CANVAS_H);
  const coverage = inkCoverage(ctx.getImageData(0, 0, CANVAS_W, CANVAS_H));
  return { png: canvas.toBuffer('image/png'), coverage };
}

/** Tiny preview for the optional "spectate opponent progress" feature. */
export function renderPreviewDataUrl(ops: readonly DrawOp[]): string {
  const w = 96;
  const h = 72;
  const canvas = createCanvas(w, h);
  renderOps(canvas.getContext('2d'), ops, w, h);
  return canvas.toDataURL('image/jpeg', 0.5);
}

const CW = 256;
const CH = 192;

/**
 * Contribution % per player, measured as the share of final visible pixels each player painted last.
 * Rendered at quarter resolution; each op's changed pixels are attributed to its author.
 */
export function computeContributions(ops: readonly DrawOp[], playerIds: string[]): Contribution[] {
  const canvas = createCanvas(CW, CH);
  const ctx = canvas.getContext('2d');
  clearCanvas(ctx, CW, CH);
  const owner = new Int8Array(CW * CH).fill(-1);
  const index = new Map(playerIds.map((id, i) => [id, i]));
  let prev = ctx.getImageData(0, 0, CW, CH).data.slice();

  for (const op of ops) {
    if (op.hidden) continue;
    const who = index.get(op.playerId);
    renderOp(ctx, op, CW, CH);
    const cur = ctx.getImageData(0, 0, CW, CH).data;
    if (who === undefined) {
      prev = cur.slice();
      continue;
    }
    for (let i = 0, px = 0; i < cur.length; i += 4, px++) {
      if (cur[i] !== prev[i] || cur[i + 1] !== prev[i + 1] || cur[i + 2] !== prev[i + 2]) owner[px] = who;
    }
    prev = cur.slice();
  }

  const counts = new Array<number>(playerIds.length).fill(0);
  const final = prev;
  for (let px = 0; px < owner.length; px++) {
    const o = owner[px];
    if (o < 0) continue;
    const i = px * 4;
    // Pixels that ended up white again (e.g. white paint on white) do not count.
    if (final[i] > 250 && final[i + 1] > 250 && final[i + 2] > 250) continue;
    counts[o]++;
  }
  const total = counts.reduce((a, b) => a + b, 0);
  return playerIds.map((id, i) => ({
    playerId: id,
    pct: total ? Math.round((counts[i] / total) * 1000) / 10 : playerIds.length ? Math.round(1000 / playerIds.length) / 10 : 0,
  }));
}
