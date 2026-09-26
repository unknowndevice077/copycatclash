/**
 * Deterministic op renderer shared by the browser canvas and the server (node-canvas).
 * The server render is authoritative for scoring; the client uses the same code for display.
 */
import { CANVAS_H, CANVAS_W, ERASER_RADIUS, FILL_TOLERANCE } from './constants';
import type { DrawOp, FillOp, StrokeOp } from './types';

export interface PixelBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Minimal 2D context surface implemented by both DOM canvas and node-canvas. */
export interface Ctx2D {
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  save(): void;
  restore(): void;
  scale(x: number, y: number): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  stroke(): void;
  fill(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  getImageData(x: number, y: number, w: number, h: number): PixelBuffer;
  putImageData(img: PixelBuffer, x: number, y: number): void;
}

export function pressureWidth(size: number, pressure: number): number {
  return Math.max(1, size * (0.45 + 0.55 * pressure));
}

/** Draws a stroke with quadratic smoothing through the midpoints of consecutive samples. */
export function drawStroke(ctx: Ctx2D, op: Pick<StrokeOp, 'points' | 'color' | 'size'>, scale = 1, fromPoint = 0): void {
  const pts = op.points;
  const n = pts.length / 3;
  if (n === 0) return;
  ctx.strokeStyle = op.color;
  ctx.fillStyle = op.color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (n === 1) {
    const r = pressureWidth(op.size, pts[2]) / 2;
    ctx.beginPath();
    ctx.arc(pts[0] * scale, pts[1] * scale, Math.max(0.5, r * scale), 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  const start = Math.max(0, fromPoint - 1);
  for (let i = start; i < n - 1; i++) {
    const x0 = pts[i * 3];
    const y0 = pts[i * 3 + 1];
    const x1 = pts[(i + 1) * 3];
    const y1 = pts[(i + 1) * 3 + 1];
    const p = (pts[i * 3 + 2] + pts[(i + 1) * 3 + 2]) / 2;
    ctx.lineWidth = pressureWidth(op.size, p) * scale;
    ctx.beginPath();
    if (i === 0) {
      ctx.moveTo(x0 * scale, y0 * scale);
    } else {
      const px = pts[(i - 1) * 3];
      const py = pts[(i - 1) * 3 + 1];
      ctx.moveTo(((px + x0) / 2) * scale, ((py + y0) / 2) * scale);
    }
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    if (i === n - 2) {
      ctx.quadraticCurveTo(x0 * scale, y0 * scale, x1 * scale, y1 * scale);
    } else {
      ctx.quadraticCurveTo(x0 * scale, y0 * scale, mx * scale, my * scale);
    }
    ctx.stroke();
  }
}

export function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/**
 * Scanline flood fill on a pixel buffer. Returns the number of pixels painted.
 * Tolerance is a max per-channel delta so anti-aliased stroke edges are absorbed.
 */
export function floodFill(img: PixelBuffer, sx: number, sy: number, color: [number, number, number], tolerance = FILL_TOLERANCE): number {
  const { width: w, height: h, data } = img;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  if (x0 < 0 || y0 < 0 || x0 >= w || y0 >= h) return 0;
  const i0 = (y0 * w + x0) * 4;
  const tr = data[i0];
  const tg = data[i0 + 1];
  const tb = data[i0 + 2];
  const [fr, fg, fb] = color;
  if (Math.abs(tr - fr) <= 2 && Math.abs(tg - fg) <= 2 && Math.abs(tb - fb) <= 2) return 0;

  const visited = new Uint8Array(w * h);
  const matches = (idx: number): boolean => {
    if (visited[idx]) return false;
    const p = idx * 4;
    return (
      Math.abs(data[p] - tr) <= tolerance &&
      Math.abs(data[p + 1] - tg) <= tolerance &&
      Math.abs(data[p + 2] - tb) <= tolerance
    );
  };
  const paint = (idx: number): void => {
    visited[idx] = 1;
    const p = idx * 4;
    data[p] = fr;
    data[p + 1] = fg;
    data[p + 2] = fb;
    data[p + 3] = 255;
  };

  let painted = 0;
  const stack: number[] = [x0, y0];
  while (stack.length) {
    const y = stack.pop() as number;
    let x = stack.pop() as number;
    let idx = y * w + x;
    while (x >= 0 && matches(idx)) {
      x--;
      idx--;
    }
    x++;
    idx++;
    let spanUp = false;
    let spanDown = false;
    while (x < w && matches(idx)) {
      paint(idx);
      painted++;
      if (y > 0) {
        const up = idx - w;
        if (matches(up)) {
          if (!spanUp) {
            stack.push(x, y - 1);
            spanUp = true;
          }
        } else spanUp = false;
      }
      if (y < h - 1) {
        const down = idx + w;
        if (matches(down)) {
          if (!spanDown) {
            stack.push(x, y + 1);
            spanDown = true;
          }
        } else spanDown = false;
      }
      x++;
      idx++;
    }
  }
  return painted;
}

export function applyFill(ctx: Ctx2D, op: Pick<FillOp, 'x' | 'y' | 'color'>, width: number, height: number, scale = 1): number {
  const img = ctx.getImageData(0, 0, width, height);
  const painted = floodFill(img, op.x * scale, op.y * scale, hexToRgb(op.color));
  if (painted > 0) ctx.putImageData(img, 0, 0);
  return painted;
}

export function clearCanvas(ctx: Ctx2D, width: number, height: number): void {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
}

export function renderOp(ctx: Ctx2D, op: DrawOp, width = CANVAS_W, height = CANVAS_H): void {
  if (op.hidden) return;
  const scale = width / CANVAS_W;
  if (op.kind === 'stroke') drawStroke(ctx, op, scale);
  else applyFill(ctx, op, width, height, scale);
}

/** Renders the whole op list onto a white background. */
export function renderOps(ctx: Ctx2D, ops: readonly DrawOp[], width = CANVAS_W, height = CANVAS_H): void {
  clearCanvas(ctx, width, height);
  for (const op of ops) renderOp(ctx, op, width, height);
}

/** Returns ids of the given player's visible ops touched by an eraser at (x, y). */
export function hitTestOps(ops: readonly DrawOp[], playerId: string, x: number, y: number, radius = ERASER_RADIUS): string[] {
  const hits: string[] = [];
  for (const op of ops) {
    if (op.hidden || op.playerId !== playerId) continue;
    if (op.kind === 'fill') {
      if (Math.hypot(op.x - x, op.y - y) <= radius * 1.5) hits.push(op.id);
      continue;
    }
    const reach = radius + op.size / 2;
    const r2 = reach * reach;
    const pts = op.points;
    for (let i = 0; i < pts.length; i += 3) {
      const dx = pts[i] - x;
      const dy = pts[i + 1] - y;
      if (dx * dx + dy * dy <= r2) {
        hits.push(op.id);
        break;
      }
    }
  }
  return hits;
}

/** Share of non-white pixels, used to detect blank canvases. */
export function inkCoverage(img: PixelBuffer): number {
  const { data } = img;
  let inked = 0;
  const total = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) inked++;
  }
  return inked / total;
}
