import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { TeamSize } from '@ccc/shared';
import { readCookie, SESSION_COOKIE, verifySession } from '../auth/session';
import { config } from '../config';
import type { AppContext } from '../context';
import { idleStatus } from '../matchmaking/Matchmaker';
import { RoomManager } from '../social/RoomManager';
import { log } from '../util/logger';
import { SocketLimiter } from './guard';
import { registerLobbyHandlers } from './handlers/lobby';
import { registerMatchHandlers } from './handlers/match';
import type { TypedServer, TypedSocket } from './types';

export function createIo(httpServer: HttpServer): TypedServer {
  return new Server(httpServer, {
    cors: { origin: config.corsOrigins, credentials: true },
    maxHttpBufferSize: 64 * 1024,
    pingInterval: 10_000,
    pingTimeout: 8_000,
    connectionStateRecovery: undefined,
  });
}

function clientIp(socket: TypedSocket): string {
  const fwd = socket.handshake.headers['x-forwarded-for'];
  if (config.trustProxy && typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return socket.handshake.address;
}

export function attachSocketLayer(io: TypedServer, ctx: AppContext): void {
  const perIp = new Map<string, number>();

  io.use((socket, next) => {
    if (io.engine.clientsCount > config.maxTotalConnections) {
      const err = new Error('server_full') as Error & { data?: unknown };
      err.data = { code: 'server_full' };
      return next(err);
    }
    const ip = clientIp(socket);
    if ((perIp.get(ip) ?? 0) >= config.maxConnPerIp) {
      const err = new Error('too_many_connections') as Error & { data?: unknown };
      err.data = { code: 'too_many_connections' };
      return next(err);
    }
    const auth = socket.handshake.auth as { token?: unknown } | undefined;
    const explicit = typeof auth?.token === 'string' ? auth.token : undefined;
    const token = explicit ?? readCookie(socket.handshake.headers.cookie, SESSION_COOKIE);
    const playerId = verifySession(token);
    const row = playerId ? ctx.players.byId(playerId) : undefined;
    if (!row) {
      const err = new Error('unauthorized') as Error & { data?: unknown };
      err.data = { code: 'unauthorized' };
      return next(err);
    }
    socket.data.playerId = row.id;
    socket.data.name = row.name;
    socket.data.ip = ip;
    next();
  });

  io.on('connection', (socket) => {
    const me = socket.data.playerId;
    perIp.set(socket.data.ip, (perIp.get(socket.data.ip) ?? 0) + 1);
    ctx.presence.register(me, socket);
    ctx.players.touch(me);

    const limiter = new SocketLimiter(socket);
    registerLobbyHandlers(ctx, socket, limiter);
    registerMatchHandlers(ctx, socket, limiter);

    const profile = ctx.players.profile(me);
    const match = ctx.registry.forPlayer(me);
    if (profile) socket.emit('session:ready', { player: profile, activeMatchId: match?.id ?? null });
    if (match) match.attach(me, socket);

    const party = ctx.parties.forPlayer(me);
    if (party) ctx.parties.touch(me);
    const room = ctx.rooms.forPlayer(me);
    if (room) {
      void socket.join(RoomManager.channel(room.code));
      ctx.rooms.join(room.code, me, false);
    }
    void ctx.matchmaker.entryFor(me).then((entry) => {
      if (!entry) socket.emit('queue:status', idleStatus());
    });
    socket.emit('lobby:stats', lobbySnapshot(ctx, queueCountsCache));

    socket.on('disconnect', () => {
      const n = (perIp.get(socket.data.ip) ?? 1) - 1;
      if (n <= 0) perIp.delete(socket.data.ip);
      else perIp.set(socket.data.ip, n);
      if (!ctx.presence.unregister(me, socket.id)) return;
      ctx.registry.forPlayer(me)?.handleDisconnect(me);
      ctx.parties.touch(me);
      log.debug('socket disconnected', { playerId: me });
    });
  });

  let queueCountsCache: Record<TeamSize, number> = { '1v1': 0, '2v2': 0, '3v3': 0 };
  setInterval(() => {
    void ctx.store.counts().then((c) => {
      queueCountsCache = c;
      io.emit('lobby:stats', lobbySnapshot(ctx, c));
    });
  }, 3000).unref();

  ctx.scoring.on('degraded', (degraded: boolean) => {
    io.emit('notice', {
      kind: degraded ? 'warn' : 'info',
      code: degraded ? 'ai_degraded' : 'ai_restored',
      message: degraded
        ? 'The AI judge is unavailable. Rounds are scored by the pixel judge for now (marked "estimated").'
        : 'The AI judge is back online.',
    });
  });
}

function lobbySnapshot(ctx: AppContext, queues: Record<TeamSize, number>) {
  return {
    online: ctx.presence.count(),
    inMatch: ctx.registry.playersInMatches(),
    queues,
    aiDegraded: ctx.scoring.aiDegraded,
  };
}
