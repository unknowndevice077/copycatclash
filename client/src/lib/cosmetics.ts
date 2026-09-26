/** Client-only cosmetics, unlocked by account level. */
export interface Cosmetic {
  id: string;
  label: string;
  level: number;
}

export const CURSOR_SKINS: Cosmetic[] = [
  { id: 'dot', label: 'Dot', level: 1 },
  { id: 'pencil', label: 'Pencil', level: 3 },
  { id: 'star', label: 'Star', level: 5 },
  { id: 'paw', label: 'Paw', level: 8 },
  { id: 'rainbow', label: 'Rainbow', level: 12 },
];

export const AVATAR_FRAMES: Cosmetic[] = [
  { id: 'plain', label: 'Plain', level: 1 },
  { id: 'sketch', label: 'Sketchy', level: 2 },
  { id: 'gold', label: 'Gold', level: 6 },
  { id: 'neon', label: 'Neon', level: 10 },
  { id: 'crown', label: 'Crown', level: 15 },
];

export const BANNER_STYLES: Cosmetic[] = [
  { id: 'classic', label: 'Classic', level: 1 },
  { id: 'comic', label: 'Comic', level: 4 },
  { id: 'graffiti', label: 'Graffiti', level: 9 },
];

export const SHOWDOWN_EFFECTS: Cosmetic[] = [
  { id: 'confetti', label: 'Confetti', level: 1 },
  { id: 'stars', label: 'Star burst', level: 7 },
  { id: 'splat', label: 'Paint splat', level: 11 },
];

export const CURSOR_GLYPH: Record<string, string> = { dot: '●', pencil: '✏️', star: '⭐', paw: '🐾', rainbow: '🌈' };

export function unlocked(list: Cosmetic[], level: number): Cosmetic[] {
  return list.filter((c) => c.level <= level);
}

export function frameClass(frame: string): string {
  switch (frame) {
    case 'sketch':
      return 'ring-4 ring-paper ring-offset-2 ring-offset-ink [border-style:dashed]';
    case 'gold':
      return 'ring-4 ring-sun shadow-[0_0_18px_rgb(var(--c-sun)/0.7)]';
    case 'neon':
      return 'ring-4 ring-mint shadow-[0_0_22px_rgb(var(--c-mint)/0.9)]';
    case 'crown':
      return 'ring-4 ring-grape shadow-[0_0_22px_rgb(var(--c-grape)/0.9)]';
    default:
      return 'ring-2 ring-ink';
  }
}
