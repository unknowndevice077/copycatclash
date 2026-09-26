import sharp from 'sharp';

const N = 64;
const GRID = 8;
const H_BINS = 12;
const S_BINS = 3;
const V_BINS = 4;

export interface PixelBreakdown {
  score: number;
  histogram: number;
  edges: number;
  grid: number;
}

const WEIGHTS = { histogram: 0.3, edges: 0.25, grid: 0.45 };

async function rgb64(img: Buffer): Promise<Uint8Array> {
  const { data } = await sharp(img).flatten({ background: '#ffffff' }).resize(N, N, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return new Uint8Array(data.buffer, data.byteOffset, data.length);
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

function hsvHistogram(px: Uint8Array): Float64Array {
  const hist = new Float64Array(H_BINS * S_BINS * V_BINS);
  for (let i = 0; i < px.length; i += 3) {
    const [h, s, v] = rgbToHsv(px[i], px[i + 1], px[i + 2]);
    const hb = Math.min(H_BINS - 1, Math.floor(h / (360 / H_BINS)));
    const sb = Math.min(S_BINS - 1, Math.floor(s * S_BINS));
    const vb = Math.min(V_BINS - 1, Math.floor(v * V_BINS));
    // Low-saturation pixels have meaningless hue; pool them into hue bin 0.
    hist[(sb === 0 ? 0 : hb) * S_BINS * V_BINS + sb * V_BINS + vb] += 1;
  }
  const total = px.length / 3;
  for (let i = 0; i < hist.length; i++) hist[i] /= total;
  return hist;
}

/** Histogram intersection (1 = identical color distribution). */
function histogramSimilarity(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.min(a[i], b[i]);
  return s;
}

function sobelEdges(px: Uint8Array): Uint8Array {
  const gray = new Float64Array(N * N);
  for (let i = 0, p = 0; p < gray.length; i += 3, p++) gray[p] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  const mag = new Float64Array(N * N);
  for (let y = 1; y < N - 1; y++) {
    for (let x = 1; x < N - 1; x++) {
      const g = (dx: number, dy: number) => gray[(y + dy) * N + (x + dx)];
      const gx = -g(-1, -1) - 2 * g(-1, 0) - g(-1, 1) + g(1, -1) + 2 * g(1, 0) + g(1, 1);
      const gy = -g(-1, -1) - 2 * g(0, -1) - g(1, -1) + g(-1, 1) + 2 * g(0, 1) + g(1, 1);
      mag[y * N + x] = Math.hypot(gx, gy);
    }
  }
  // Keep the strongest 15% of edges (relative threshold makes photos and flat drawings comparable).
  const sorted = Array.from(mag).sort((a, b) => b - a);
  const threshold = Math.max(40, sorted[Math.floor(sorted.length * 0.15)]);
  const edges = new Uint8Array(N * N);
  for (let i = 0; i < mag.length; i++) edges[i] = mag[i] >= threshold ? 1 : 0;
  return edges;
}

function dilate(e: Uint8Array): Uint8Array {
  const out = new Uint8Array(e.length);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let on = 0;
      for (let dy = -1; dy <= 1 && !on; dy++) {
        for (let dx = -1; dx <= 1 && !on; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < N && ny < N && e[ny * N + nx]) on = 1;
        }
      }
      out[y * N + x] = on;
    }
  }
  return out;
}

/** IoU of dilated edge maps, so near-misses of a pixel or two still count. */
function edgeIoU(a: Uint8Array, b: Uint8Array): number {
  const da = dilate(a);
  const db = dilate(b);
  let inter = 0;
  let union = 0;
  for (let i = 0; i < da.length; i++) {
    if (da[i] && db[i]) inter++;
    if (da[i] || db[i]) union++;
  }
  return union === 0 ? 0 : inter / union;
}

function gridColors(px: Uint8Array): Float64Array {
  const cell = N / GRID;
  const out = new Float64Array(GRID * GRID * 3);
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let y = gy * cell; y < (gy + 1) * cell; y++) {
        for (let x = gx * cell; x < (gx + 1) * cell; x++) {
          const i = (y * N + x) * 3;
          r += px[i];
          g += px[i + 1];
          b += px[i + 2];
        }
      }
      const k = (gy * GRID + gx) * 3;
      const n = cell * cell;
      out[k] = r / n;
      out[k + 1] = g / n;
      out[k + 2] = b / n;
    }
  }
  return out;
}

/** 1 - mean normalised RGB distance across the 8x8 grid cells. */
function gridSimilarity(a: Float64Array, b: Float64Array): number {
  let sum = 0;
  const cells = a.length / 3;
  for (let i = 0; i < a.length; i += 3) {
    sum += Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1], a[i + 2] - b[i + 2]) / 441.673;
  }
  return 1 - sum / cells;
}

/** Stretches the raw blend so typical results use the whole 0-100 range. */
function calibrate(raw: number): number {
  const lo = 0.2;
  const hi = 0.85;
  return Math.round(Math.max(0, Math.min(1, (raw - lo) / (hi - lo))) * 1000) / 10;
}

/** Local, deterministic similarity used when the AI judge is unavailable. */
export async function pixelScore(reference: Buffer, drawing: Buffer): Promise<PixelBreakdown> {
  const [ref, drw] = await Promise.all([rgb64(reference), rgb64(drawing)]);
  const histogram = histogramSimilarity(hsvHistogram(ref), hsvHistogram(drw));
  const edges = edgeIoU(sobelEdges(ref), sobelEdges(drw));
  const grid = gridSimilarity(gridColors(ref), gridColors(drw));
  const raw = WEIGHTS.histogram * histogram + WEIGHTS.edges * edges + WEIGHTS.grid * grid;
  return { score: calibrate(raw), histogram, edges, grid };
}
