/**
 * Downloads the curated starter library listed in photos/sources.json (Unsplash photos, served via
 * the Lorem Picsum mirror so no API key is needed), normalises them to 1024x768 4:3 JPEGs with
 * metadata stripped, then rebuilds photos.json.
 * Usage: npm run photos:fetch
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config';
import { normalizePhoto } from '../photos/preprocess';
import { Semaphore, sleep } from '../util/concurrency';
import { buildManifest, readSources, type SourceEntry } from './seedManifest';

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function download(entry: SourceEntry): Promise<'skipped' | 'ok' | 'failed'> {
  const target = path.join(config.photos.dir, entry.file);
  if (await exists(target)) return 'skipped';
  if (!entry.source.downloadUrl) return 'failed';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(entry.source.downloadUrl, { redirect: 'follow', signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const image = await normalizePhoto(Buffer.from(await res.arrayBuffer()), false);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, image);
      return 'ok';
    } catch (err) {
      if (attempt === 3) {
        console.warn(`  failed ${entry.id}: ${err instanceof Error ? err.message : String(err)}`);
        return 'failed';
      }
      await sleep(800 * attempt);
    }
  }
  return 'failed';
}

async function main(): Promise<void> {
  const sources = await readSources();
  if (!sources.length) throw new Error(`No sources.json found in ${config.photos.dir}`);
  console.log(`Fetching ${sources.length} starter photos into ${config.photos.dir} ...`);
  const sem = new Semaphore(8);
  const counts = { ok: 0, skipped: 0, failed: 0 };
  let done = 0;
  await Promise.all(
    sources.map((s) =>
      sem.run(async () => {
        counts[await download(s)]++;
        if (++done % 25 === 0) console.log(`  ${done}/${sources.length}`);
      }),
    ),
  );
  console.log(`Downloaded ${counts.ok}, already present ${counts.skipped}, failed ${counts.failed}`);
  const manifest = await buildManifest();
  console.log(`photos.json now lists ${manifest.count} photos`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
