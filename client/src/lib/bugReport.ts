import type { BugReportContext, BugReportInput } from '@ccc/shared';
import { useLobby } from '../store/lobby';
import { useMatch } from '../store/match';
import { recentErrors } from './errorLog';

/** Everything sent along with the player's own words. The form shows this before sending. */
export function collectContext(): BugReportContext {
  const room = useLobby.getState().room;
  const match = useMatch.getState();
  const inRoom = room ? Object.values(room.teams).reduce((n, members) => n + members.length, 0) : undefined;
  return {
    path: window.location.pathname,
    userAgent: navigator.userAgent.slice(0, 400),
    viewport: `${window.innerWidth}x${window.innerHeight}@${Math.round(window.devicePixelRatio * 100) / 100}`,
    language: navigator.language,
    roomCode: room?.code,
    phase: match.phase ?? (room ? 'ROOM' : undefined),
    players: match.matchId ? match.players.length : inRoom,
    errors: recentErrors(),
  };
}

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

export async function sendBugReport(report: BugReportInput): Promise<SendResult> {
  try {
    const res = await fetch('/api/bug-report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(report),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string };
    if (res.ok && data.ok && data.id) return { ok: true, id: data.id };
    return { ok: false, error: data.error ?? `The server answered ${res.status}. Please try again.` };
  } catch {
    return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
  }
}
