import {
  partyJoinSchema,
  pingSchema,
  queueJoinSchema,
  roomJoinSchema,
  roomSetTeamSchema,
  roomSettingsSchema,
  type PartyState,
  type QueueStatus,
  type RoomListing,
  type RoomState,
} from '@ccc/shared';
import type { AppContext } from '../../context';
import { fail, ok, simple, validated, type SocketLimiter } from '../guard';
import type { TypedSocket } from '../types';

export function registerLobbyHandlers(ctx: AppContext, socket: TypedSocket, limiter: SocketLimiter): void {
  const me = socket.data.playerId;

  socket.on('time:ping', (payload, cb) => {
    if (!limiter.allow('general') || typeof cb !== 'function') return;
    if (pingSchema.safeParse(payload).success) cb(Date.now());
  });

  // ------------------------------------------------------------------ queue
  socket.on(
    'queue:join',
    validated<typeof queueJoinSchema, QueueStatus>(limiter, 'general', queueJoinSchema, async (input, cb) => {
      if (ctx.registry.forPlayer(me)) return fail(cb, 'You are already in a match');
      if (ctx.rooms.forPlayer(me)) ctx.rooms.leave(me);
      const party = ctx.parties.forPlayer(me);
      if (party && party.leaderId !== me) return fail(cb, 'Only the party leader can start the queue');
      const res = await ctx.matchmaker.join(me, input, party ? party.members : null);
      if (!res.ok) return fail(cb, res.error);
      ok(cb, res.status);
    }),
  );

  socket.on(
    'queue:leave',
    simple<undefined>(limiter, 'general', async (cb) => {
      await ctx.matchmaker.leave(me);
      ok(cb, undefined);
    }),
  );

  socket.on(
    'queue:ghost',
    simple<{ matchId: string }>(limiter, 'general', async (cb) => {
      const res = await ctx.matchmaker.acceptGhost(me);
      if (!res.ok) return fail(cb, res.error);
      ok(cb, { matchId: res.matchId });
    }),
  );

  // ------------------------------------------------------------------ party
  socket.on(
    'party:create',
    simple<PartyState>(limiter, 'general', async (cb) => {
      await ctx.matchmaker.leave(me);
      const res = ctx.parties.create(me);
      if (!res.ok) return fail(cb, res.error);
      ok(cb, res.party);
    }),
  );

  socket.on(
    'party:join',
    validated<typeof partyJoinSchema, PartyState>(limiter, 'general', partyJoinSchema, async (input, cb) => {
      await ctx.matchmaker.leave(me);
      const res = ctx.parties.join(input.code, me);
      if (!res.ok) return fail(cb, res.error);
      ok(cb, res.party);
    }),
  );

  socket.on(
    'party:leave',
    simple<undefined>(limiter, 'general', async (cb) => {
      await ctx.matchmaker.leave(me);
      ctx.parties.leave(me);
      ok(cb, undefined);
    }),
  );

  // ------------------------------------------------------------------ custom rooms
  socket.on(
    'room:create',
    validated<typeof roomSettingsSchema, RoomState>(limiter, 'general', roomSettingsSchema, async (input, cb) => {
      if (ctx.registry.forPlayer(me)) return fail(cb, 'Finish your current match first');
      await ctx.matchmaker.leave(me);
      const res = ctx.rooms.create(me, input);
      if (!res.ok) return fail(cb, res.error);
      ok(cb, res.value);
    }),
  );

  socket.on(
    'room:join',
    validated<typeof roomJoinSchema, RoomState>(limiter, 'general', roomJoinSchema, async (input, cb) => {
      await ctx.matchmaker.leave(me);
      const res = ctx.rooms.join(input.code, me, input.asSpectator);
      if (!res.ok) return fail(cb, res.error);
      ok(cb, res.value);
    }),
  );

  socket.on(
    'room:update',
    validated<typeof roomSettingsSchema, RoomState>(limiter, 'general', roomSettingsSchema, (input, cb) => {
      const room = ctx.rooms.forPlayer(me);
      if (!room) return fail(cb, 'You are not in a room');
      const res = ctx.rooms.update(room.code, me, input);
      if (!res.ok) return fail(cb, res.error);
      ok(cb, res.value);
    }),
  );

  socket.on(
    'room:setTeam',
    validated<typeof roomSetTeamSchema, RoomState>(limiter, 'general', roomSetTeamSchema, (input, cb) => {
      const room = ctx.rooms.forPlayer(me);
      if (!room) return fail(cb, 'You are not in a room');
      const res = ctx.rooms.setTeam(room.code, me, input.team);
      if (!res.ok) return fail(cb, res.error);
      ok(cb, res.value);
    }),
  );

  socket.on(
    'room:start',
    simple<{ matchId: string }>(limiter, 'general', (cb) => {
      const room = ctx.rooms.forPlayer(me);
      if (!room) return fail(cb, 'You are not in a room');
      const res = ctx.rooms.start(room.code, me);
      if (!res.ok) return fail(cb, res.error);
      ok(cb, res.value);
    }),
  );

  socket.on(
    'room:leave',
    simple<undefined>(limiter, 'general', (cb) => {
      ctx.rooms.leave(me);
      ok(cb, undefined);
    }),
  );

  socket.on(
    'room:list',
    simple<RoomListing[]>(limiter, 'general', (cb) => {
      ok(cb, ctx.rooms.listPublic());
    }),
  );
}
