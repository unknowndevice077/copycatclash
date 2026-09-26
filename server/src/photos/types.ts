import type { Attribution, Difficulty, PhotoCategory, PhotoTheme } from '@ccc/shared';

export interface PhotoRecord {
  id: string;
  title: string;
  category: PhotoCategory;
  difficulty: Difficulty;
  theme: PhotoTheme;
  attribution: Attribution;
  /** Public hotlink to show at the showdown (Unsplash requires hotlinking). Null means we serve our own copy. */
  revealUrl: string | null;
}

export interface PickCriteria {
  themes: PhotoTheme[];
  categories: PhotoCategory[];
  difficulties: Difficulty[];
  /** Never pick these (already used this match). */
  exclude: Set<string>;
  /** Prefer to avoid these (recently seen by players); relaxed when nothing else matches. */
  avoid: Set<string>;
}

export interface PhotoProvider {
  readonly name: string;
  init(): Promise<void>;
  count(): number;
  pick(criteria: PickCriteria): Promise<PhotoRecord | null>;
  byId(id: string): PhotoRecord | null;
  /** Raw image bytes for preprocessing. */
  load(photo: PhotoRecord): Promise<Buffer>;
  /** Called once when a photo is actually shown in a round (e.g. Unsplash download tracking). */
  onUsed(photo: PhotoRecord): Promise<void>;
}

export interface ManifestEntry {
  id: string;
  title: string;
  category: PhotoCategory;
  difficulty: Difficulty;
  /** Missing in older manifests; treated as "photos". */
  theme?: PhotoTheme;
  file: string;
  width: number;
  height: number;
  sha256: string;
  author: string | null;
  sourceUrl: string | null;
  sourceProvider: 'unsplash' | 'local';
  license: string;
  licenseUrl: string | null;
}

export interface Manifest {
  generatedAt: string;
  count: number;
  photos: ManifestEntry[];
}
