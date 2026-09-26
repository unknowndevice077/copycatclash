import sharp from 'sharp';
import { CANVAS_H, CANVAS_W, SCORE_H, SCORE_W } from '@ccc/shared';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Normalises any photo to the 4:3 canvas size. Sharp drops EXIF/ICC metadata unless asked to keep it. */
export async function normalizePhoto(input: Buffer, mirror: boolean): Promise<Buffer> {
  let img = sharp(input, { failOn: 'error' }).rotate().resize(CANVAS_W, CANVAS_H, { fit: 'cover', position: 'attention' });
  if (mirror) img = img.flop();
  return img.jpeg({ quality: 86, mozjpeg: true }).toBuffer();
}

export async function toScoringJpeg(input: Buffer): Promise<Buffer> {
  return sharp(input).flatten({ background: '#ffffff' }).resize(SCORE_W, SCORE_H, { fit: 'fill' }).jpeg({ quality: 85 }).toBuffer();
}

export async function toThumbnail(input: Buffer, width = 512): Promise<Buffer> {
  return sharp(input).resize(width, Math.round((width * 3) / 4), { fit: 'cover' }).jpeg({ quality: 80 }).toBuffer();
}

type ImageKind = 'jpeg' | 'png' | 'webp';

/** Identifies an image by its magic bytes; the declared MIME type is never trusted. */
export function sniffImage(buf: Buffer): ImageKind | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

export type UploadCheck = { ok: true; image: Buffer } | { ok: false; error: string };

/** Validates and fully re-encodes a host upload so no original bytes are ever served. */
export async function processUpload(buf: Buffer): Promise<UploadCheck> {
  if (buf.length > MAX_UPLOAD_BYTES) return { ok: false, error: 'Image must be 5MB or smaller' };
  const kind = sniffImage(buf);
  if (!kind) return { ok: false, error: 'Only JPEG, PNG or WebP images are allowed' };
  try {
    const meta = await sharp(buf, { failOn: 'error', limitInputPixels: 40_000_000 }).metadata();
    if (!meta.width || !meta.height || meta.width < 200 || meta.height < 150) return { ok: false, error: 'Image is too small' };
    const image = await normalizePhoto(buf, false);
    return { ok: true, image };
  } catch {
    return { ok: false, error: 'Could not read that image' };
  }
}

export { MAX_UPLOAD_BYTES };
