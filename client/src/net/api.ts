import type { LeaderboardEntry, PlayerProfile, ProfileResponse, ReplayData, TeamSize } from '@ccc/shared';

let sessionToken: string | null = null;

export function setSessionToken(token: string | null): void {
  sessionToken = token;
}

export function getSessionToken(): string | null {
  return sessionToken;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (sessionToken) headers.set('Authorization', `Bearer ${sessionToken}`);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const res = await fetch(path, { ...init, headers, credentials: 'include' });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Non-JSON error body.
    }
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as T;
}

export interface AuthResponse {
  player: PlayerProfile;
  sessionToken: string;
  guestToken?: string;
}

export const api = {
  me: () => request<AuthResponse>('/api/auth/me'),
  guest: (body: { name?: string; guestToken?: string; setCookie: boolean }) =>
    request<AuthResponse>('/api/auth/guest', { method: 'POST', body: JSON.stringify(body) }),
  rename: (name: string) => request<{ player: PlayerProfile }>('/api/auth/name', { method: 'POST', body: JSON.stringify({ name }) }),
  register: (username: string, password: string, setCookie: boolean) =>
    request<AuthResponse>('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, password, setCookie }) }),
  login: (username: string, password: string, setCookie: boolean) =>
    request<AuthResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password, setCookie }) }),
  /** Addresses other devices on the local network can use (empty when hosted). */
  network: () => request<{ urls: string[] }>('/api/network'),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  leaderboard: (bucket: TeamSize, period: 'all' | 'weekly', search: string) =>
    request<{ entries: LeaderboardEntry[] }>(`/api/leaderboard?${new URLSearchParams({ bucket, period, ...(search ? { search } : {}) }).toString()}`),
  profile: (id: string) => request<ProfileResponse>(`/api/profile/${encodeURIComponent(id)}`),
  replay: (matchId: string, round: number) => request<ReplayData>(`/api/rounds/${encodeURIComponent(matchId)}/${round}/replay`),
  uploadRoomPhoto: (code: string, file: File, title: string) => {
    const form = new FormData();
    form.append('title', title);
    form.append('photo', file);
    return request<{ count: number }>(`/api/rooms/${code}/photos`, { method: 'POST', body: form });
  },
  /** Fetches a one-time photo URL with the session attached and returns an object URL. */
  photoBlobUrl: async (url: string): Promise<string> => {
    const headers = new Headers();
    if (sessionToken) headers.set('Authorization', `Bearer ${sessionToken}`);
    const res = await fetch(url, { headers, credentials: 'include', cache: 'no-store' });
    if (!res.ok) throw new ApiError('Photo expired', res.status);
    return URL.createObjectURL(await res.blob());
  },
};
