import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SettingsState {
  volume: number;
  muted: boolean;
  brushSound: boolean;
  haptics: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  showOpponentPreview: boolean;
  cursorSkin: string;
  avatarFrame: string;
  bannerStyle: string;
  showdownEffect: string;
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void;
}

const prefersReduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      volume: 0.7,
      muted: false,
      brushSound: true,
      haptics: true,
      reducedMotion: Boolean(prefersReduced),
      highContrast: false,
      showOpponentPreview: true,
      cursorSkin: 'dot',
      avatarFrame: 'plain',
      bannerStyle: 'classic',
      showdownEffect: 'confetti',
      set: (patch) => set(patch),
    }),
    { name: 'ccc.settings' },
  ),
);
