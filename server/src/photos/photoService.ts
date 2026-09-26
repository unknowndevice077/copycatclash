import type { MatchRules } from '@ccc/shared';
import { config } from '../config';
import type { PhotosRepo } from '../db/repos/misc';
import { newId, randomToken } from '../util/ids';
import { errMessage, log } from '../util/logger';
import { LocalProvider } from './LocalProvider';
import { UnsplashProvider } from './UnsplashProvider';
import { normalizePhoto } from './preprocess';
import type { PhotoProvider, PhotoRecord } from './types';

export interface PreparedPhoto {
  record: PhotoRecord;
  /** 1024x768 JPEG, already mirrored when the rules ask for it. This is also what gets scored. */
  image: Buffer;
  mirrored: boolean;
}

interface TokenEntry {
  image: Buffer;
  playerId: string;
  expiresAt: number;
}

interface UploadedPhoto {
  record: PhotoRecord;
  image: Buffer;
}

const TOKEN_TTL_MS = 2 * 60_000;
const MAX_UPLOADS_PER_ROOM = 30;

export class PhotoService {
  readonly local: LocalProvider;
  private readonly primary: PhotoProvider;
  private readonly tokens = new Map<string, TokenEntry>();
  private readonly uploads = new Map<string, UploadedPhoto[]>();

  constructor(private readonly repo: PhotosRepo) {
    this.local = new LocalProvider(config.photos.dir);
    this.primary =
      config.photos.provider === 'unsplash' && config.photos.unsplashKey
        ? new UnsplashProvider(config.photos.unsplashKey, config.photos.unsplashAppName)
        : this.local;
    setInterval(() => this.sweepTokens(), 30_000).unref();
  }

  async init(): Promise<void> {
    await this.local.init();
    if (this.primary !== this.local) await this.primary.init();
    this.repo.sync(
      this.local.all().map((p) => ({
        id: p.id,
        title: p.title,
        category: p.category,
        difficulty: p.difficulty,
        provider: p.attribution.provider,
        author: p.attribution.author,
        sourceUrl: p.attribution.sourceUrl,
        license: p.attribution.license,
      })),
    );
  }

  libraryCount(): number {
    return this.local.count();
  }

  /** Picks a fresh photo for a round and preprocesses it. Falls back to the local library if the primary provider fails. */
  async prepareForRound(opts: {
    rules: MatchRules;
    playerIds: string[];
    usedInMatch: Set<string>;
    uploadsKey: string | null;
    forcedPhotoId?: string;
  }): Promise<PreparedPhoto> {
    const { rules } = opts;
    if (opts.uploadsKey) {
      const uploaded = (this.uploads.get(opts.uploadsKey) ?? []).filter((u) => !opts.usedInMatch.has(u.record.id));
      if (uploaded.length) {
        const pick = uploaded[Math.floor(Math.random() * uploaded.length)];
        const image = rules.mirror ? await normalizePhoto(pick.image, true) : pick.image;
        return { record: pick.record, image, mirrored: rules.mirror };
      }
    }

    let record: PhotoRecord | null = opts.forcedPhotoId ? this.byId(opts.forcedPhotoId) : null;
    let provider: PhotoProvider = record && this.local.byId(record.id) ? this.local : this.primary;
    if (!record) {
      const avoid = new Set(opts.playerIds.flatMap((id) => this.repo.recentForPlayer(id, 20)));
      const criteria = { themes: rules.themes, categories: rules.categories, difficulties: rules.difficulties, exclude: opts.usedInMatch, avoid };
      // Unsplash only serves real photos; simple pictures always come from the local library.
      const usePrimary = this.primary !== this.local && rules.themes.includes('photos');
      if (usePrimary) record = await this.primary.pick({ ...criteria, themes: ['photos'] });
      else provider = this.local;
      if (!record) {
        provider = this.local;
        record = await this.local.pick(criteria);
      }
    }
    if (!record) throw new Error('No photos available. Run `npm run photos:fetch` to download the starter library.');

    let raw: Buffer;
    try {
      raw = await provider.load(record);
    } catch (err) {
      if (provider === this.local) throw err;
      log.warn('primary photo load failed; using local library', { error: errMessage(err) });
      const fallback = await this.local.pick({ themes: rules.themes, categories: rules.categories, difficulties: rules.difficulties, exclude: opts.usedInMatch, avoid: new Set() });
      if (!fallback) throw err;
      record = fallback;
      provider = this.local;
      raw = await this.local.load(record);
    }

    const image = await normalizePhoto(raw, rules.mirror);
    this.repo.markUsed(record.id, opts.playerIds);
    void provider.onUsed(record);
    return { record, image, mirrored: rules.mirror };
  }

  byId(id: string): PhotoRecord | null {
    return this.local.byId(id) ?? this.primary.byId(id);
  }

  /** One-time URL for the peek phase. The token is bound to a player and expires quickly. */
  issueToken(image: Buffer, playerId: string): string {
    const token = randomToken(24);
    this.tokens.set(token, { image, playerId, expiresAt: Date.now() + TOKEN_TTL_MS });
    return `/api/photo/${token}`;
  }

  consumeToken(token: string, playerId: string | null): Buffer | null {
    const entry = this.tokens.get(token);
    if (!entry) return null;
    this.tokens.delete(token);
    if (entry.expiresAt < Date.now()) return null;
    if (playerId && entry.playerId !== playerId) return null;
    return entry.image;
  }

  private sweepTokens(): void {
    const now = Date.now();
    for (const [k, v] of this.tokens) if (v.expiresAt < now) this.tokens.delete(k);
  }

  addUpload(key: string, image: Buffer, title: string): { ok: true; count: number } | { ok: false; error: string } {
    const list = this.uploads.get(key) ?? [];
    if (list.length >= MAX_UPLOADS_PER_ROOM) return { ok: false, error: `Rooms can hold up to ${MAX_UPLOADS_PER_ROOM} photos` };
    const id = newId('upload-');
    list.push({
      image,
      record: {
        id,
        title,
        category: 'objects',
        difficulty: 'medium',
        theme: 'photos',
        revealUrl: null,
        attribution: { provider: 'upload', title, author: null, sourceUrl: null, license: 'Uploaded by room host', licenseUrl: null },
      },
    });
    this.uploads.set(key, list);
    return { ok: true, count: list.length };
  }

  uploadCount(key: string): number {
    return this.uploads.get(key)?.length ?? 0;
  }

  clearUploads(key: string): void {
    this.uploads.delete(key);
  }
}
