import { randomInt } from 'node:crypto';
import type { PhotoRecord, PickCriteria } from './types';

/**
 * Filters by criteria, preferring photos nobody has seen recently.
 * When a filter leaves nothing, relax difficulty/category first but keep the picture style.
 */
export function pickFrom(all: PhotoRecord[], c: PickCriteria): PhotoRecord | null {
  const unused = all.filter((p) => !c.exclude.has(p.id));
  const themed = unused.filter((p) => c.themes.includes(p.theme));
  const eligible = themed.filter((p) => c.categories.includes(p.category) && c.difficulties.includes(p.difficulty));
  const fresh = eligible.filter((p) => !c.avoid.has(p.id));
  const pool = fresh.length ? fresh : eligible.length ? eligible : themed.length ? themed : unused;
  if (!pool.length) return null;
  return pool[randomInt(pool.length)];
}
