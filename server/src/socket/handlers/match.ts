import {
  chatSendSchema,
  cursorSchema,
  emoteSchema,
  eraseSchema,
  fillSchema,
  reportSchema,
  strokeBatchSchema,
  CHAT_MAX_LEN,
  type EmoteId,
  type MatchSnapshot,
} from '@ccc/shared';
import type { AppContext } from '../../context';
import { newId } from '../../util/ids';
import { cleanChat } from '../../util/sanitize';
import { RoomManager } from '../../social/RoomManager';
import { fail, ok, simple, validated, type SocketLimiter } from '../guard';
import type { TypedSocket } from '../types';

export function registerMatchHandlers(ctx: AppContext, socket: TypedSocket, limiter: SocketLimiter): void {
  const me = socket.data.playerId;
  const match = () => ctx.registry.forPlayer(me);

  socket.on('match:accept', () => {
    if (limiter.allow('general')) match()?.accept(me);
  });

  socket.on(
    'match:resync',
    simple<MatchSnapshot>(limiter, 'general', (cb) => {
      const m = match();
      if (!m) return fail(cb, 'No active match', 'no_match');
      m.attach(me, socket);
      ok(cb, m.snapshotFor(me));
    }),
  );

  socket.on(
    'match:rematch',
    simple<undefined>(limiter, 'general', (cb) => {
      const m = match();
      if (!m) return fail(cb, 'No match to rematch');
      const res = m.voteRematch(me);
      if (!res.ok) return fail(cb, res.error ?? 'Rematch unavailable');
      ok(cb, undefined);
    }),
  );

  socket.on(
    'match:leave',
    simple<undefined>(limiter, 'general', (cb) => {
      const m = match();
      if (m) {
        m.leave(me);
        ctx.registry.release(me);
      }
      ok(cb, undefined);
    }),
  );

  // ------------------------------------------------------------------ drawing
  socket.on(
    'draw:stroke',
    validated(limiter, 'draw', strokeBatchSchema, (input) => match()?.onStroke(me, socket, input)),
  );
  socket.on(
    'draw:fill',
    validated(limiter, 'draw', fillSchema, (input) => match()?.onFill(me, socket, input)),
  );
  socket.on(
    'draw:erase',
    validated(limiter, 'draw', eraseSchema, (input) => match()?.onErase(me, input)),
  );
  socket.on('draw:undo', () => {
    if (limiter.allow('draw')) match()?.onUndo(me);
  });
  socket.on('draw:redo', () => {
    if (limiter.allow('draw')) match()?.onRedo(me);
  });
  socket.on('draw:clear', () => {
    if (limiter.allow('general')) match()?.onClear(me);
  });
  socket.on(
    'draw:cursor',
    validated(limiter, 'cursor', cursorSchema, (input) => match()?.onCursor(me, socket, input)),
  );

  // ------------------------------------------------------------------ social
  socket.on(
    'emote',
    validated(limiter, 'emote', emoteSchema, (input) => {
      const payload = { playerId: me, emote: input.emote as EmoteId, at: Date.now() };
      const m = match();
      if (m) {
        if (m.canEmote()) ctx.io.to(m.roomName()).emit('emote', payload);
        return;
      }
      // Emotes in the queue go to the player's party.
      const party = ctx.parties.forPlayer(me);
      if (party) for (const id of party.members) ctx.presence.socketOf(id)?.emit('emote', payload);
      else socket.emit('emote', payload);
    }),
  );

  socket.on(
    'chat:send',
    validated<typeof chatSendSchema, undefined>(limiter, 'chat', chatSendSchema, (input, cb) => {
      const text = cleanChat(input.text, CHAT_MAX_LEN);
      if (!text) return fail(cb, 'Empty message');
      const msg = { id: newId(), channel: input.channel, fromId: me, fromName: socket.data.name, text, at: Date.now() };
      if (input.channel === 'party') {
        const party = ctx.parties.forPlayer(me);
        if (!party) return fail(cb, 'You are not in a party');
        for (const id of party.members) ctx.presence.socketOf(id)?.emit('chat:message', msg);
      } else if (input.channel === 'match') {
        const m = match();
        if (!m || !m.canChat()) return fail(cb, 'Match chat opens after the match');
        ctx.io.to(m.roomName()).emit('chat:message', msg);
      } else {
        const room = ctx.rooms.forPlayer(me);
        if (!room) return fail(cb, 'You are not in a room');
        if (room.matchId) return fail(cb, 'Room chat is paused during the match');
        ctx.io.to(RoomManager.channel(room.code)).emit('chat:message', msg);
      }
      ok(cb, undefined);
    }),
  );

  socket.on(
    'report',
    validated<typeof reportSchema, undefined>(limiter, 'chat', reportSchema, (input, cb) => {
      const m = match();
      const res = ctx.moderation.report(me, input.playerId, m?.id ?? null, input.reason);
      if (!res.ok) return fail(cb, res.error ?? 'Could not report');
      ok(cb, undefined);
    }),
  );
}
