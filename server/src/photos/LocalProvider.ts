import fs from 'node:fs/promises';
import path from 'node:path';
import { log } from '../util/logger';
import { pickFrom } from './pickUtil';
import type { Manifest, ManifestEntry, PhotoProvider, PhotoRecord, PickCriteria } from './types';

/** Serves the curated library in PHOTOS_DIR, described by photos.json (built by `npm run photos:seed`). */
export class LocalProvider implements PhotoProvider {
  readonly name = 'local';
  private photos: PhotoRecord[] = [];
  private files = new Map<string, string>();

  constructor(private readonly dir: string) {}

  async init(): Promise<void> {
    const manifestPath = path.join(this.dir, 'photos.json');
    let manifest: Manifest;
    try {
      manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as Manifest;
    } catch {
      log.warn('photo manifest missing; run `npm run photos:fetch` to download the starter library', { manifestPath });
      return;
    }
    const present: ManifestEntry[] = [];
    for (const entry of manifest.photos) {
      const abs = path.resolve(this.dir, entry.file);
      // Manifest paths must stay inside the photos directory.
      if (!abs.startsWith(path.resolve(this.dir))) continue;
      try {
        await fs.access(abs);
        present.push(entry);
        this.files.set(entry.id, abs);
      } catch {
        log.warn('photo listed in manifest but missing on disk', { id: entry.id });
      }
    }
    this.photos = present.map(toRecord);
    log.info('local photo library loaded', { count: this.photos.length });
  }

  count(): number {
    return this.photos.length;
  }

  all(): PhotoRecord[] {
    return this.photos;
  }

  async pick(c: PickCriteria): Promise<PhotoRecord | null> {
    return pickFrom(this.photos, c);
  }

  byId(id: string): PhotoRecord | null {
    return this.photos.find((p) => p.id === id) ?? null;
  }

  async load(photo: PhotoRecord): Promise<Buffer> {
    const file = this.files.get(photo.id);
    if (!file) throw new Error(`photo ${photo.id} not in local library`);
    return fs.readFile(file);
  }

  async onUsed(): Promise<void> {
    // Local files need no usage tracking.
  }
}

function toRecord(e: ManifestEntry): PhotoRecord {
  return {
    id: e.id,
    title: e.title,
    category: e.category,
    difficulty: e.difficulty,
    theme: e.theme ?? 'photos',
    revealUrl: null,
    attribution: {
      provider: e.sourceProvider === 'unsplash' ? 'unsplash' : 'local',
      title: e.title,
      author: e.author,
      sourceUrl: e.sourceUrl,
      license: e.license,
      licenseUrl: e.licenseUrl,
    },
  };
}
