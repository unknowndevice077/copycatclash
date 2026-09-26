import { create } from 'zustand';
import type { Notice } from '@ccc/shared';

export type ConnState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'server_full' | 'unauthorized' | 'too_many';

export interface Toast extends Notice {
  id: number;
}

interface UiState {
  conn: ConnState;
  toasts: Toast[];
  announcement: string;
  setConn: (c: ConnState) => void;
  toast: (n: Notice, ttlMs?: number) => void;
  dismiss: (id: number) => void;
  announce: (text: string) => void;
}

let nextId = 1;

export const useUi = create<UiState>((set, get) => ({
  conn: 'idle',
  toasts: [],
  announcement: '',
  setConn: (conn) => set({ conn }),
  toast: (n, ttlMs = 5000) => {
    const id = nextId++;
    // Collapse duplicate notices.
    if (get().toasts.some((t) => t.code === n.code && t.message === n.message)) return;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...n, id }] }));
    setTimeout(() => get().dismiss(id), ttlMs);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  // Screen-reader announcements go through an aria-live region; toggling the text forces a re-read.
  announce: (text) => {
    set({ announcement: '' });
    setTimeout(() => set({ announcement: text }), 30);
  },
}));
