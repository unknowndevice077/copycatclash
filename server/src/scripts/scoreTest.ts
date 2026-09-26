/**
 * Runs the pixel fallback judge on sample reference/drawing pairs and checks that
 * good drawings outscore mediocre ones, which outscore bad ones.
 * Uses synthetic scenes (always) plus real library photos (when downloaded).
 * Usage: npm run test:scoring
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createCanvas, type CanvasRenderingContext2D } from 'canvas';
import sharp from 'sharp';
import { CANVAS_H, CANVAS_W, PALETTE_24, hexToRgb, type DrawOp } from '@ccc/shared';
import { config } from '../config';
import { toScoringJpeg } from '../photos/preprocess';
import type { Manifest } from '../photos/types';
import { renderTeamPng } from '../render/serverRender';
import { pixelScore } from '../scoring/pixelJudge';

// ------------------------------------------------------------------ op builders (what a player would draw)

let seq = 0;
const id = () => `test${(seq++).toString().padStart(4, '0')}`;

function fill(x: number, y: number, color: string): DrawOp {
  return { kind: 'fill', id: id(), playerId: 'p1', color, x, y, t: 0, hidden: false };
}

function stroke(points: Array<[number, number]>, color: string, size: number): DrawOp {
  return {
    kind: 'stroke',
    id: id(),
    playerId: 'p1',
    color,
    size,
    points: points.flatMap(([x, y]) => [x, y, 0.8]),
    times: points.map((_, i) => i * 16),
    done: true,
    hidden: false,
  };
}

/** A filled rectangle made of thick horizontal strokes, like a player scrubbing an area. */
function block(x0: number, y0: number, x1: number, y1: number, color: string, size = 44): DrawOp[] {
  const ops: DrawOp[] = [];
  for (let y = y0 + size / 2; y <= y1; y += size * 0.7) ops.push(stroke([[x0, y], [x1, y]], color, size));
  return ops;
}

function disc(cx: number, cy: number, r: number, color: string): DrawOp[] {
  const ops: DrawOp[] = [];
  for (let rr = r; rr > 0; rr -= 18) {
    const pts: Array<[number, number]> = [];
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.2) pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    ops.push(stroke(pts, color, 22));
  }
  return ops;
}

function scribbles(seed: number): DrawOp[] {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const ops: DrawOp[] = [];
  for (let i = 0; i < 14; i++) {
    const pts: Array<[number, number]> = [];
    let x = rnd() * CANVAS_W;
    let y = rnd() * CANVAS_H;
    for (let k = 0; k < 20; k++) {
      x = Math.max(0, Math.min(CANVAS_W, x + (rnd() - 0.5) * 160));
      y = Math.max(0, Math.min(CANVAS_H, y + (rnd() - 0.5) * 160));
      pts.push([x, y]);
    }
    ops.push(stroke(pts, PALETTE_24[Math.floor(rnd() * PALETTE_24.length)], 10));
  }
  return ops;
}

// ------------------------------------------------------------------ synthetic "photos"

type Painter = (ctx: CanvasRenderingContext2D) => void;

function photo(paint: Painter): Buffer {
  const c = createCanvas(CANVAS_W, CANVAS_H);
  const ctx = c.getContext('2d');
  paint(ctx);
  // Photographic noise so the reference isn't a flat vector image.
  const img = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 24;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  return c.toBuffer('image/jpeg');
}

function gradient(ctx: CanvasRenderingContext2D, y0: number, y1: number, top: string, bottom: string): void {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, y0, CANVAS_W, y1 - y0);
}

interface Scene {
  name: string;
  reference: Buffer;
  good: DrawOp[];
  mediocre: DrawOp[];
  bad: DrawOp[];
}

function scenes(): Scene[] {
  const sunset: Scene = {
    name: 'Beach sunset',
    reference: photo((ctx) => {
      gradient(ctx, 0, 420, '#ff8a3d', '#ffd27a');
      ctx.fillStyle = '#fff3b0';
      ctx.beginPath();
      ctx.arc(700, 300, 80, 0, Math.PI * 2);
      ctx.fill();
      gradient(ctx, 420, 580, '#1f6a96', '#154a6a');
      gradient(ctx, 580, CANVAS_H, '#e8c48a', '#d4a86a');
    }),
    good: [fill(10, 10, '#ff7043'), ...block(0, 180, CANVAS_W, 420, '#f4a261'), ...disc(700, 300, 80, '#ffd166'), ...block(0, 420, CANVAS_W, 580, '#0d47a1'), ...block(0, 580, CANVAS_W, CANVAS_H, '#c2a878')],
    mediocre: [fill(10, 10, '#c2a878'), ...block(0, 0, CANVAS_W, 200, '#0d47a1'), ...block(0, 200, CANVAS_W, CANVAS_H, '#f4a261'), ...disc(250, 600, 70, '#ffd166')],
    bad: scribbles(7),
  };
  const house: Scene = {
    name: 'Red house',
    reference: photo((ctx) => {
      gradient(ctx, 0, 520, '#7ec8f0', '#bfe6ff');
      gradient(ctx, 520, CANVAS_H, '#4caf50', '#2e7d32');
      ctx.fillStyle = '#c62828';
      ctx.fillRect(350, 330, 300, 230);
      ctx.fillStyle = '#4e342e';
      ctx.beginPath();
      ctx.moveTo(320, 340);
      ctx.lineTo(500, 200);
      ctx.lineTo(680, 340);
      ctx.fill();
      ctx.fillStyle = '#fff59d';
      ctx.fillRect(470, 460, 60, 100);
    }),
    good: [fill(10, 10, '#81d4fa'), ...block(0, 520, CANVAS_W, CANVAS_H, '#66bb6a'), ...block(350, 330, 650, 560, '#e53935'), ...block(340, 230, 660, 330, '#4a4a4a', 30), ...block(470, 460, 530, 560, '#fff59d', 20)],
    mediocre: [fill(10, 10, '#81d4fa'), ...block(0, 0, CANVAS_W, 240, '#66bb6a'), ...block(60, 420, 260, 700, '#e53935')],
    bad: scribbles(42),
  };
  const night: Scene = {
    name: 'Night city',
    reference: photo((ctx) => {
      gradient(ctx, 0, CANVAS_H, '#0b1638', '#1c2a55');
      ctx.fillStyle = '#f5f1c9';
      ctx.beginPath();
      ctx.arc(180, 150, 60, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 6; i++) {
        const x = 300 + i * 120;
        const h = 250 + ((i * 97) % 200);
        ctx.fillStyle = '#10131c';
        ctx.fillRect(x, CANVAS_H - h, 100, h);
        ctx.fillStyle = '#ffd54f';
        for (let wy = CANVAS_H - h + 20; wy < CANVAS_H - 20; wy += 40) ctx.fillRect(x + 20, wy, 20, 16);
      }
    }),
    good: [fill(10, 10, '#0d47a1'), ...disc(180, 150, 60, '#fff59d'), ...block(300, 320, 1000, CANVAS_H, '#000000'), ...block(320, 380, 340, 740, '#ffd166', 14), ...block(560, 360, 580, 740, '#ffd166', 14), ...block(800, 380, 820, 740, '#ffd166', 14)],
    mediocre: [fill(10, 10, '#1e88e5'), ...block(0, 0, 400, 300, '#000000'), ...disc(800, 600, 60, '#ffffff')],
    bad: scribbles(99),
  };
  return [sunset, house, night];
}

// ------------------------------------------------------------------ "drawings" of real photos

const PALETTE_RGB = PALETTE_24.map(hexToRgb);

/** Simulates a decent player: a 16x12 blocky, palette-snapped version of the photo. */
async function blockyDrawing(image: Buffer): Promise<Buffer> {
  const { data } = await sharp(image).resize(16, 12, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const snapped = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 3) {
    let best = PALETTE_RGB[0];
    let bestD = Infinity;
    for (const c of PALETTE_RGB) {
      const d = (c[0] - data[i]) ** 2 + (c[1] - data[i + 1]) ** 2 + (c[2] - data[i + 2]) ** 2;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    snapped[i] = best[0];
    snapped[i + 1] = best[1];
    snapped[i + 2] = best[2];
  }
  return sharp(snapped, { raw: { width: 16, height: 12, channels: 3 } }).resize(CANVAS_W, CANVAS_H, { kernel: 'nearest' }).png().toBuffer();
}

// ------------------------------------------------------------------ runner

async function score(reference: Buffer, drawing: Buffer): Promise<number> {
  const [ref, drw] = await Promise.all([toScoringJpeg(reference), toScoringJpeg(drawing)]);
  return (await pixelScore(ref, drw)).score;
}

async function main(): Promise<void> {
  let failures = 0;
  const check = (label: string, cond: boolean) => {
    if (!cond) {
      failures++;
      console.log(`  FAIL: ${label}`);
    }
  };

  console.log('Synthetic scenes (pixel fallback judge)');
  console.log('scene          good   mediocre   bad    blank');
  for (const s of scenes()) {
    const good = await score(s.reference, renderTeamPng(s.good).png);
    const mediocre = await score(s.reference, renderTeamPng(s.mediocre).png);
    const bad = await score(s.reference, renderTeamPng(s.bad).png);
    const blankRender = renderTeamPng([]);
    // The scoring service short-circuits blank canvases to 0 before any judge runs.
    const blank = blankRender.coverage < 0.004 ? 0 : await score(s.reference, blankRender.png);
    console.log(`${s.name.padEnd(14)} ${good.toFixed(1).padStart(5)}  ${mediocre.toFixed(1).padStart(8)}  ${bad.toFixed(1).padStart(5)}  ${blank.toFixed(1).padStart(6)}`);
    check(`${s.name}: good > mediocre`, good > mediocre);
    check(`${s.name}: mediocre > bad`, mediocre > bad);
    check(`${s.name}: bad >= blank`, bad >= blank);
  }

  try {
    const manifest = JSON.parse(await fs.readFile(path.join(config.photos.dir, 'photos.json'), 'utf8')) as Manifest;
    const sample = manifest.photos.filter((_, i) => i % Math.max(1, Math.floor(manifest.photos.length / 8)) === 0).slice(0, 8);
    if (sample.length >= 2) {
      console.log('\nLibrary photos: blocky copy of the right photo vs the wrong photo');
      let wins = 0;
      for (let i = 0; i < sample.length; i++) {
        const ref = await fs.readFile(path.join(config.photos.dir, sample[i].file));
        const wrong = await fs.readFile(path.join(config.photos.dir, sample[(i + 1) % sample.length].file));
        const right = await score(ref, await blockyDrawing(ref));
        const other = await score(ref, await blockyDrawing(wrong));
        if (right > other) wins++;
        console.log(`${sample[i].title.slice(0, 32).padEnd(33)} right ${right.toFixed(1).padStart(5)}   wrong ${other.toFixed(1).padStart(5)}`);
      }
      check(`right photo beats wrong photo in most cases (${wins}/${sample.length})`, wins >= Math.ceil(sample.length * 0.75));
    }
  } catch {
    console.log('\n(Photo library not downloaded; skipping real-photo checks. Run `npm run photos:fetch`.)');
  }

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll scoring checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
