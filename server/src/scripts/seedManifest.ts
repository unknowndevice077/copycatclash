/**
 * Builds photos/photos.json from the files in photos/library/<category>/.
 * Metadata comes from photos/sources.json (curated starter set) or a sidecar <image>.json next to the file:
 *   { "title": "...", "difficulty": "easy|medium|hard", "author": "...", "sourceUrl": "...", "license": "...", "licenseUrl": "..." }
 * Usage: npm run photos:seed
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { z } from 'zod';
import { DIFFICULTIES, PHOTO_CATEGORIES, PHOTO_THEMES, type PhotoCategory } from '@ccc/shared';
import { config } from '../config';
import type { Manifest, ManifestEntry } from '../photos/types';
import { sha256 } from '../util/ids';

export const SourceEntry = z.object({
  id: z.string(),
  title: z.string(),
  category: z.enum(PHOTO_CATEGORIES),
  difficulty: z.enum(DIFFICULTIES),
  file: z.string(),
  source: z.object({
    provider: z.enum(['unsplash', 'local']),
    sourceUrl: z.string().url().nullable(),
    author: z.string().nullable(),
    license: z.string(),
    licenseUrl: z.string().url().nullable(),
    downloadUrl: z.string().url().optional(),
  }),
});
export type SourceEntry = z.infer<typeof SourceEntry>;

const Sidecar = z.object({
  title: z.string().optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  theme: z.enum(PHOTO_THEMES).optional(),
  author: z.string().nullable().optional(),
  sourceUrl: z.string().url().nullable().optional(),
  license: z.string().optional(),
  licenseUrl: z.string().url().nullable().optional(),
});

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

export async function readSources(dir = config.photos.dir): Promise<SourceEntry[]> {
  try {
    return z.array(SourceEntry).parse(JSON.parse(await fs.readFile(path.join(dir, 'sources.json'), 'utf8')));
  } catch {
    return [];
  }
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function buildManifest(dir = config.photos.dir): Promise<Manifest> {
  const sources = new Map((await readSources(dir)).map((s) => [s.file.replace(/\\/g, '/'), s]));
  const photos: ManifestEntry[] = [];
  const libraryDir = path.join(dir, 'library');

  for (const category of PHOTO_CATEGORIES) {
    const catDir = path.join(libraryDir, category);
    let files: string[] = [];
    try {
      files = await fs.readdir(catDir);
    } catch {
      continue;
    }
    for (const file of files.sort()) {
      if (!IMAGE_EXT.has(path.extname(file).toLowerCase())) continue;
      const rel = `library/${category}/${file}`;
      const abs = path.join(catDir, file);
      const buf = await fs.readFile(abs);
      const meta = await sharp(buf).metadata();
      const src = sources.get(rel);
      let sidecar: z.infer<typeof Sidecar> = {};
      try {
        sidecar = Sidecar.parse(JSON.parse(await fs.readFile(`${abs}.json`, 'utf8')));
      } catch {
        // No sidecar is fine.
      }
      const baseName = path.basename(file, path.extname(file));
      photos.push({
        id: src?.id ?? `${category.slice(0, 3)}-${slug(baseName)}`,
        title: sidecar.title ?? src?.title ?? baseName.replace(/[-_]+/g, ' '),
        category: category as PhotoCategory,
        difficulty: sidecar.difficulty ?? src?.difficulty ?? 'medium',
        theme: sidecar.theme ?? 'photos',
        file: rel,
        width: meta.width ?? 0,
        height: meta.height ?? 0,
        sha256: sha256(buf),
        author: sidecar.author ?? src?.source.author ?? null,
        sourceUrl: sidecar.sourceUrl ?? src?.source.sourceUrl ?? null,
        sourceProvider: src?.source.provider ?? (sidecar.sourceUrl?.includes('unsplash.com') ? 'unsplash' : 'local'),
        license: sidecar.license ?? src?.source.license ?? 'Unknown - verify before publishing',
        licenseUrl: sidecar.licenseUrl ?? src?.source.licenseUrl ?? null,
      });
    }
  }
  const manifest: Manifest = { generatedAt: new Date().toISOString(), count: photos.length, photos };
  await fs.writeFile(path.join(dir, 'photos.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  buildManifest()
    .then((m) => {
      const byCat = new Map<string, number>();
      for (const p of m.photos) byCat.set(`${p.theme ?? 'photos'}/${p.category}`, (byCat.get(`${p.theme ?? 'photos'}/${p.category}`) ?? 0) + 1);
      console.log(`photos.json written with ${m.count} photos`);
      for (const [c, n] of byCat) console.log(`  ${c.padEnd(12)} ${n}`);
      const unlicensed = m.photos.filter((p) => p.license.startsWith('Unknown'));
      if (unlicensed.length) console.warn(`WARNING: ${unlicensed.length} photo(s) have no license info. Add sidecar JSON files.`);
    })
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
