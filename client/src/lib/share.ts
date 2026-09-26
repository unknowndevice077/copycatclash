import { GAME_NAME, TEAM_COLORS, type RoundSummary, type TeamId } from '@ccc/shared';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });
}

function roundedImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, x: number, y: number, w: number, h: number, flip = false): void {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 18);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.clip();
  if (img) {
    if (flip) {
      ctx.translate(x + w, y);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, w, h);
    } else ctx.drawImage(img, x, y, w, h);
  }
  ctx.restore();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#140a2b';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 18);
  ctx.stroke();
}

/**
 * Builds a 1200x630 share card: logo, reference and two drawings with their scores. In a
 * free-for-all the two drawings are yours and the round's best.
 */
export async function buildShareImage(r: RoundSummary, finalLine: string, sides: [TeamId, TeamId], names: Record<string, string>): Promise<Blob> {
  const W = 1200;
  const H = 630;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');

  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#1b1036');
  g.addColorStop(1, '#2c1858');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  await document.fonts.load('64px "Lilita One"').catch(() => undefined);
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  const title = (text: string, x: number, y: number, size: number, fill: string) => {
    ctx.font = `${size}px "Lilita One", "Bangers", sans-serif`;
    ctx.lineWidth = size / 6;
    ctx.strokeStyle = '#140a2b';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  };
  title(GAME_NAME, W / 2, 78, 64, '#ffd23f');

  const [sa, sb] = sides;
  const [ref, a, b] = await Promise.all([r.referenceUrl, r.images[sa] ?? '', r.images[sb] ?? ''].map((u) => loadImage(u).catch(() => null)));
  const pw = 360;
  const ph = 270;
  const top = 130;
  const xs = [30, 420, 810];
  roundedImage(ctx, ref, xs[0], top, pw, ph, r.mirrored && r.referenceUrl.startsWith('http'));
  roundedImage(ctx, a, xs[1], top, pw, ph);
  roundedImage(ctx, b, xs[2], top, pw, ph);

  title('Reference', xs[0] + pw / 2, top + ph + 56, 40, '#fff8e7');
  title(`${Math.round(r.scores[sa] ?? 0)}%`, xs[1] + pw / 2, top + ph + 62, 56, TEAM_COLORS[sa].main);
  title(`${Math.round(r.scores[sb] ?? 0)}%`, xs[2] + pw / 2, top + ph + 62, 56, TEAM_COLORS[sb].main);
  const verdict = r.winner === 'draw' ? 'DRAW!' : `${TEAM_COLORS[r.winner].icon} ${names[r.winner] ?? TEAM_COLORS[r.winner].name} wins the round`;
  title(verdict, W / 2, H - 70, 40, '#fff8e7');
  title(`Final ${finalLine}`, W / 2, H - 22, 30, '#3bceac');

  return new Promise((resolve, reject) => c.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('export failed'))), 'image/png'));
}

/** Web Share API with files when available, otherwise a download. */
export async function shareOrDownload(blob: Blob): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], 'copycatclash.png', { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: GAME_NAME, text: 'Can you out-copy me? 🎨' });
      return 'shared';
    } catch {
      // User cancelled or share failed; fall back to download.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'copycatclash.png';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'downloaded';
}
