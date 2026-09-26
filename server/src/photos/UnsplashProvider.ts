import { z } from 'zod';
import type { PhotoCategory } from '@ccc/shared';
import { errMessage, log } from '../util/logger';
import type { PhotoProvider, PhotoRecord, PickCriteria } from './types';

const API = 'https://api.unsplash.com';

const QUERIES: Record<PhotoCategory, string> = {
  animals: 'animal wildlife',
  landscapes: 'landscape nature',
  food: 'food still life',
  buildings: 'architecture building exterior',
  objects: 'object still life',
  vehicles: 'vintage car vehicle',
  abstract: 'abstract pattern texture',
};

const UnsplashPhoto = z.object({
  id: z.string(),
  alt_description: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  urls: z.object({ regular: z.string().url() }),
  links: z.object({ html: z.string().url(), download_location: z.string().url() }),
  user: z.object({ name: z.string(), links: z.object({ html: z.string().url() }) }),
});
type UnsplashPhoto = z.infer<typeof UnsplashPhoto>;

/**
 * Pulls random photos from the Unsplash API.
 * Follows the API guidelines: images are hotlinked for display (revealUrl), the photographer and
 * Unsplash are credited with UTM-tagged links, and download_location is pinged when a photo is used.
 */
export class UnsplashProvider implements PhotoProvider {
  readonly name = 'unsplash';
  private readonly known = new Map<string, { record: PhotoRecord; raw: UnsplashPhoto }>();

  constructor(
    private readonly accessKey: string,
    private readonly appName: string,
  ) {}

  async init(): Promise<void> {
    log.info('unsplash provider enabled');
  }

  count(): number {
    return Number.POSITIVE_INFINITY;
  }

  private utm(url: string): string {
    const u = new URL(url);
    u.searchParams.set('utm_source', this.appName);
    u.searchParams.set('utm_medium', 'referral');
    return u.toString();
  }

  private async api(pathAndQuery: string): Promise<unknown> {
    const res = await fetch(`${API}${pathAndQuery}`, {
      headers: { Authorization: `Client-ID ${this.accessKey}`, 'Accept-Version': 'v1' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`unsplash ${res.status}`);
    return res.json();
  }

  async pick(c: PickCriteria): Promise<PhotoRecord | null> {
    const category = c.categories[Math.floor(Math.random() * c.categories.length)];
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const q = new URLSearchParams({ query: QUERIES[category], orientation: 'landscape', content_filter: 'high' });
        const raw = UnsplashPhoto.parse(await this.api(`/photos/random?${q.toString()}`));
        const id = `unsplash-${raw.id}`;
        if (c.exclude.has(id) || c.avoid.has(id)) continue;
        const title = (raw.alt_description ?? raw.description ?? `${category} photo`).slice(0, 80);
        const record: PhotoRecord = {
          id,
          title: title.charAt(0).toUpperCase() + title.slice(1),
          category,
          difficulty: c.difficulties[0] ?? 'medium',
          theme: 'photos',
          revealUrl: raw.urls.regular,
          attribution: {
            provider: 'unsplash',
            title,
            author: raw.user.name,
            sourceUrl: this.utm(raw.links.html),
            license: 'Unsplash License',
            licenseUrl: this.utm('https://unsplash.com/license'),
          },
        };
        this.known.set(id, { record, raw });
        return record;
      }
      return null;
    } catch (err) {
      log.warn('unsplash pick failed', { error: errMessage(err) });
      return null;
    }
  }

  byId(id: string): PhotoRecord | null {
    return this.known.get(id)?.record ?? null;
  }

  async load(photo: PhotoRecord): Promise<Buffer> {
    const entry = this.known.get(photo.id);
    if (!entry) throw new Error(`unknown unsplash photo ${photo.id}`);
    const url = new URL(entry.raw.urls.regular);
    url.searchParams.set('w', '1280');
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`unsplash image ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async onUsed(photo: PhotoRecord): Promise<void> {
    const entry = this.known.get(photo.id);
    if (!entry) return;
    try {
      await fetch(entry.raw.links.download_location, {
        headers: { Authorization: `Client-ID ${this.accessKey}` },
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      log.warn('unsplash download tracking failed', { error: errMessage(err) });
    }
  }
}
