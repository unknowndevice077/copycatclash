/**
 * Downloads additional photos per category from the Unsplash API into photos/library/<category>/,
 * writing an attribution sidecar for each, then rebuilds photos.json.
 * Requires UNSPLASH_ACCESS_KEY. Review new photos by hand and delete any showing identifiable people.
 * Usage: npm run photos:unsplash -- --per-category 20
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { PHOTO_CATEGORIES, type PhotoCategory } from '@ccc/shared';
import { config } from '../config';
import { normalizePhoto } from '../photos/preprocess';
import { buildManifest } from './seedManifest';

const QUERIES: Record<PhotoCategory, string> = {
  animals: 'wild animal',
  landscapes: 'landscape',
  food: 'food flat lay',
  buildings: 'architecture exterior',
  objects: 'object still life',
  vehicles: 'vintage car',
  abstract: 'abstract texture',
};

const SearchResult = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      alt_description: z.string().nullable().optional(),
      urls: z.object({ regular: z.string().url() }),
      links: z.object({ html: z.string().url(), download_location: z.string().url() }),
      user: z.object({ name: z.string() }),
    }),
  ),
});

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

async function main(): Promise<void> {
  const key = config.photos.unsplashKey;
  if (!key) throw new Error('Set UNSPLASH_ACCESS_KEY in .env first');
  const perCategory = Math.min(30, arg('per-category', 15));
  const headers = { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' };
  const utm = `utm_source=${encodeURIComponent(config.photos.unsplashAppName)}&utm_medium=referral`;

  for (const category of PHOTO_CATEGORIES) {
    const q = new URLSearchParams({ query: QUERIES[category], orientation: 'landscape', content_filter: 'high', per_page: String(perCategory) });
    const res = await fetch(`https://api.unsplash.com/search/photos?${q.toString()}`, { headers });
    if (!res.ok) throw new Error(`Unsplash search failed: ${res.status}`);
    const { results } = SearchResult.parse(await res.json());
    const dir = path.join(config.photos.dir, 'library', category);
    await fs.mkdir(dir, { recursive: true });
    let saved = 0;
    for (const photo of results) {
      const file = path.join(dir, `unsplash-${photo.id}.jpg`);
      try {
        await fs.access(file);
        continue;
      } catch {
        // Not downloaded yet.
      }
      const img = await fetch(`${photo.urls.regular}&w=1280`);
      if (!img.ok) continue;
      await fs.writeFile(file, await normalizePhoto(Buffer.from(await img.arrayBuffer()), false));
      // Required by the Unsplash API guidelines whenever a photo is downloaded.
      await fetch(photo.links.download_location, { headers });
      const title = photo.alt_description ?? `${category} photo`;
      await fs.writeFile(
        `${file}.json`,
        JSON.stringify(
          {
            title: title.charAt(0).toUpperCase() + title.slice(1),
            difficulty: 'medium',
            author: photo.user.name,
            sourceUrl: `${photo.links.html}?${utm}`,
            license: 'Unsplash License',
            licenseUrl: `https://unsplash.com/license?${utm}`,
          },
          null,
          2,
        ),
      );
      saved++;
    }
    console.log(`${category.padEnd(12)} +${saved}`);
  }
  const manifest = await buildManifest();
  console.log(`photos.json now lists ${manifest.count} photos. Review the new images and set difficulty in their .json sidecars.`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
