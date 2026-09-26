import { create } from 'zustand';
import type { PlayerProfile } from '@ccc/shared';
import { api, ApiError, setSessionToken, type AuthResponse } from '../net/api';

/**
 * `?profile=name` in the URL gives a tab its own guest identity (separate localStorage key, no cookie),
 * which makes local multi-tab playtests possible in one browser.
 */
const profileKey = new URLSearchParams(window.location.search).get('profile');
const GUEST_KEY = profileKey ? `ccc.guest.${profileKey}` : 'ccc.guest';
const SESSION_KEY = profileKey ? `ccc.session.${profileKey}` : 'ccc.session';
const useCookie = !profileKey;

interface SessionState {
  status: 'loading' | 'ready' | 'error';
  player: PlayerProfile | null;
  token: string | null;
  error: string | null;
  boot: () => Promise<void>;
  setPlayer: (p: PlayerProfile) => void;
  rename: (name: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

function store(res: AuthResponse): void {
  setSessionToken(res.sessionToken);
  sessionStorage.setItem(SESSION_KEY, res.sessionToken);
  if (res.guestToken) localStorage.setItem(GUEST_KEY, res.guestToken);
}

export const useSession = create<SessionState>((set) => ({
  status: 'loading',
  player: null,
  token: null,
  error: null,

  boot: async () => {
    set({ status: 'loading', error: null });
    const accept = (res: AuthResponse) => {
      store(res);
      set({ status: 'ready', player: res.player, token: res.sessionToken });
    };
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) setSessionToken(saved);
      if (saved || useCookie) {
        try {
          return accept(await api.me());
        } catch (err) {
          if (!(err instanceof ApiError) || err.status !== 401) throw err;
          setSessionToken(null);
        }
      }
      const guestToken = localStorage.getItem(GUEST_KEY) ?? undefined;
      accept(await api.guest({ guestToken, setCookie: useCookie }));
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : 'Could not reach the server' });
    }
  },

  setPlayer: (player) => set({ player }),

  rename: async (name) => {
    const res = await api.rename(name);
    set({ player: res.player });
  },

  register: async (username, password) => {
    const res = await api.register(username, password, useCookie);
    store(res);
    set({ player: res.player, token: res.sessionToken });
  },

  login: async (username, password) => {
    const res = await api.login(username, password, useCookie);
    store(res);
    set({ player: res.player, token: res.sessionToken });
  },

  logout: async () => {
    await api.logout();
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(GUEST_KEY);
    setSessionToken(null);
    window.location.reload();
  },
}));
