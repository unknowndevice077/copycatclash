import { io, type Socket } from 'socket.io-client';
import { MODE_PRESETS, type Ack, type ClientToServerEvents, type MatchPhase, type ServerToClientEvents, type TeamId, type TeamRoundResult } from '@ccc/shared';
import { sfx, vibrate } from '../audio/sfx';
import { drawSession } from '../canvas/drawSession';
import { sideName } from '../lib/sides';
import { useLobby } from '../store/lobby';
import { useMatch } from '../store/match';
import { useSession } from '../store/session';
import { useUi } from '../store/ui';
import { api } from './api';
import { noteError } from '../lib/errorLog';
import { recordSample, resetClock } from './clock';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: ClientSocket | null = null;
let syncTimer: ReturnType<typeof setInterval> | null = null;

export function getSocket(): ClientSocket | null {
  return socket;
}

/**
 * The free host sleeps when idle and restarts on every deploy, so a click often lands while the
 * socket is reconnecting. Wait for it to come back (the socket object may be replaced if the
 * session had to be renewed) instead of failing the action straight away.
 */
const RECONNECT_WAIT_MS = 15_000;

async function connectedSocket(): Promise<ClientSocket | null> {
  const deadline = Date.now() + RECONNECT_WAIT_MS;
  while (Date.now() < deadline) {
    if (socket?.connected) return socket;
    await new Promise((r) => setTimeout(r, 250));
  }
  return socket?.connected ? socket : null;
}

/** Wraps an ack-style emit in a promise with a timeout. */
export async function call<T>(send: (s: ClientSocket, cb: (res: Ack<T>) => void) => void, timeoutMs = 8000): Promise<Ack<T>> {
  const s = await connectedSocket();
  if (!s) return { ok: false, error: "Can't reach the game server right now. It may be waking up, so try again in a few seconds." };
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: 'The server did not answer in time' }), timeoutMs);
    send(s, (res) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

function syncClock(samples = 5): void {
  const s = socket;
  if (!s) return;
  for (let i = 0; i < samples; i++) {
    setTimeout(() => {
      const sent = Date.now();
      s.emit('time:ping', { clientTime: sent }, (serverTime) => recordSample(sent, serverTime, Date.now()));
    }, i * 150);
  }
}

const PHASE_ANNOUNCE: Record<MatchPhase, string> = {
  MATCH_FOUND: 'Match found.',
  TEAM_INTRO: 'Teams are ready.',
  PEEK: 'Study the photo now. Drawing starts soon.',
  DRAW: 'Draw now!',
  SCORING: 'Time is up. The judge is scoring.',
  SHOWDOWN: 'Showdown. Scores revealed.',
  MATCH_RESULT: 'Match over.',
};

async function loadPhoto(url: string | null, mirrored: boolean): Promise<void> {
  if (!url) return;
  try {
    useMatch.getState().setPhoto(await api.photoBlobUrl(url), mirrored);
  } catch {
    useUi.getState().toast({ kind: 'warn', code: 'photo', message: 'Could not load the reference photo.' });
  }
}

export function connectSocket(token: string): ClientSocket {
  if (socket) return socket;
  const ui = useUi.getState();
  ui.setConn('connecting');
  // WebSocket first for latency; tryAllTransports falls back to HTTP polling on networks that
  // block WebSockets (some school, office and mobile networks) instead of never connecting.
  const s: ClientSocket = io({
    auth: { token },
    transports: ['websocket', 'polling'],
    tryAllTransports: true,
    reconnectionDelay: 800,
    reconnectionDelayMax: 4000,
  });
  socket = s;

  s.on('connect', () => {
    useUi.getState().setConn('connected');
    resetClock();
    syncClock();
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = setInterval(() => syncClock(2), 20_000);
  });

  s.on('disconnect', (reason) => {
    if (reason !== 'io client disconnect') noteError(`Disconnected: ${reason}`);
    useUi.getState().setConn(reason === 'io client disconnect' ? 'offline' : 'reconnecting');
  });

  s.on('connect_error', (err) => {
    const code = (err as Error & { data?: { code?: string } }).data?.code ?? err.message;
    noteError(`Connection error: ${code}`);
    const setConn = useUi.getState().setConn;
    if (code === 'server_full') setConn('server_full');
    else if (code === 'too_many_connections') setConn('too_many');
    else if (code === 'unauthorized') {
      setConn('unauthorized');
      s.disconnect();
      socket = null;
      void useSession
        .getState()
        .boot()
        .then(() => {
          const t = useSession.getState().token;
          if (t) connectSocket(t);
        });
    } else setConn('reconnecting');
  });

  s.on('session:ready', ({ player, activeMatchId }) => {
    useSession.getState().setPlayer(player);
    const m = useMatch.getState();
    if (!activeMatchId && m.matchId && m.phase !== 'MATCH_RESULT') {
      drawSession.reset();
      m.reset();
    }
  });
  s.on('session:profile', (player) => useSession.getState().setPlayer(player));
  s.on('lobby:stats', (stats) => useLobby.getState().set({ stats }));
  s.on('queue:status', (queue) => useLobby.getState().set({ queue }));
  s.on('party:state', (party) => useLobby.getState().set({ party }));
  s.on('room:state', (room) => useLobby.getState().set({ room }));

  s.on('notice', (n) => {
    useUi.getState().toast(n, n.kind === 'error' ? 8000 : 6000);
    if (n.code === 'ai_fallback') useMatch.getState().set({ aiDegraded: true });
  });

  // ---------------------------------------------------------------- match lifecycle
  s.on('match:found', (p) => {
    drawSession.reset();
    const m = useMatch.getState();
    m.reset();
    m.set({ matchId: p.matchId, rules: p.rules, players: p.players, myTeam: p.myTeam, spectator: p.myTeam === null, phase: 'MATCH_FOUND', phaseEndsAt: p.acceptBy });
    useLobby.getState().set({ queue: null });
    sfx.matchFound();
    vibrate([60, 40, 60]);
    useUi.getState().announce(`Match found: ${MODE_PRESETS[p.rules.mode].label}, ${p.rules.teamSize}.`);
    s.emit('match:accept');
  });

  s.on('match:snapshot', (snap) => {
    const m = useMatch.getState();
    if (m.matchId !== snap.matchId) m.reset();
    m.set({
      matchId: snap.matchId,
      rules: snap.rules,
      players: snap.players,
      myTeam: snap.myTeam,
      spectator: snap.spectator,
      rounds: snap.rounds,
      showdown: snap.lastShowdown,
      result: snap.result,
      rematchVotes: snap.rematchVotes,
    });
    m.applyPhase(snap);
    drawSession.load(snap.ops);
    if (snap.photoUrl) void loadPhoto(snap.photoUrl, snap.rules.mirror);
  });

  s.on('match:phase', (p) => {
    const m = useMatch.getState();
    const previous = m.phase;
    m.applyPhase(p);
    if (p.phase === previous) return;
    if (p.phase === 'PEEK') {
      drawSession.reset();
      m.set({ showdown: null, previews: {}, cursors: {} });
    }
    if (p.phase === 'DRAW') {
      sfx.go();
      if (m.rules && !m.rules.thumbnailVisible) m.setPhoto(null, false);
    }
    if (p.phase === 'SCORING') sfx.drumroll(2.2);
    useUi.getState().announce(PHASE_ANNOUNCE[p.phase] + (p.phase === 'PEEK' ? ` Round ${p.round}.` : ''));
  });

  s.on('round:peek', (p) => void loadPhoto(p.photoUrl, p.mirrored));

  s.on('round:showdown', (sd) => {
    const m = useMatch.getState();
    m.set({
      showdown: sd,
      rounds: [
        ...m.rounds.filter((r) => r.round !== sd.round),
        {
          round: sd.round,
          photoTitle: sd.attribution.title,
          referenceUrl: sd.referenceUrl,
          mirrored: sd.mirrored,
          images: Object.fromEntries(Object.entries(sd.teams).map(([t, r]) => [t, r.imageUrl])),
          scores: Object.fromEntries(Object.entries(sd.teams).map(([t, r]) => [t, r.detail.score])),
          winner: sd.winner,
          estimated: Object.values(sd.teams).some((r) => r.detail.estimated),
        },
      ],
    });
    const mine = m.myTeam;
    const verdict = sd.winner === 'draw' ? 'It is a draw.' : mine ? (sd.winner === mine ? 'You win the round!' : 'Someone else wins the round.') : '';
    const scores = (Object.entries(sd.teams) as Array<[TeamId, TeamRoundResult]>).map(([t, r]) => `${sideName(t, m.rules, m.players, mine)} ${Math.round(r.detail.score)}`);
    useUi.getState().announce(`Scores: ${scores.join(', ')}. ${verdict}`);
  });

  s.on('match:result', (result) => useMatch.getState().set({ result, rounds: result.rounds }));
  s.on('match:rematchVotes', ({ votes }) => useMatch.getState().set({ rematchVotes: votes }));
  s.on('match:closed', ({ matchId, reason }) => {
    const m = useMatch.getState();
    if (m.matchId !== matchId) return;
    m.set({ closedReason: reason });
    if (reason !== 'rematch' && m.phase !== 'MATCH_RESULT') {
      drawSession.reset();
      m.reset();
    }
  });
  s.on('player:status', ({ playerId, connected }) => {
    const m = useMatch.getState();
    m.set({ players: m.players.map((p) => (p.id === playerId ? { ...p, connected } : p)) });
  });

  // ---------------------------------------------------------------- drawing
  s.on('draw:stroke', (r) => drawSession.remoteStroke(r));
  s.on('draw:fill', ({ team, ...op }) => drawSession.remoteFill(team, op));
  s.on('draw:visibility', ({ team, ids, hidden }) => drawSession.visibility(team, ids, hidden));
  s.on('draw:reject', ({ id, reason }) => {
    drawSession.reject(id);
    if (reason === 'not your turn' || reason === 'color not allowed') useUi.getState().toast({ kind: 'info', code: 'reject', message: reason === 'not your turn' ? 'Wait for your relay turn!' : 'That color belongs to a teammate.' }, 2500);
  });
  s.on('draw:cursor', ({ playerId, x, y }) => {
    const m = useMatch.getState();
    m.set({ cursors: { ...m.cursors, [playerId]: { x, y, at: Date.now() } } });
  });
  s.on('relay:turn', ({ team, relay }) => {
    const m = useMatch.getState();
    m.set({ relay: { ...m.relay, [team]: relay } });
    const me = useSession.getState().player?.id;
    if (relay.activePlayerId === me) {
      sfx.go();
      vibrate(80);
      useUi.getState().announce('Your relay turn! Draw now.');
    }
  });
  s.on('match:preview', ({ team, image }) => {
    const m = useMatch.getState();
    m.set({ previews: { ...m.previews, [team]: image } });
  });

  // ---------------------------------------------------------------- social
  s.on('emote', (e) => {
    if (useMatch.getState().matchId) useMatch.getState().set({ emotes: [...useMatch.getState().emotes.slice(-10), e] });
    else useLobby.getState().pushEmote(e);
  });
  s.on('chat:message', (msg) => {
    if (msg.channel === 'match') {
      const m = useMatch.getState();
      m.set({ chat: [...m.chat.slice(-80), msg] });
    } else useLobby.getState().pushChat(msg);
  });

  return s;
}
