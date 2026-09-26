import { Router, type Response } from 'express';
import { z } from 'zod';
import { passwordSchema, usernameSchema } from '@ccc/shared';
import { checkPassword, hashPassword, SESSION_COOKIE, sessionCookieOptions, signSession } from '../../auth/session';
import type { AppContext } from '../../context';
import { newId, randomToken, sha256 } from '../../util/ids';
import { validateDisplayName } from '../../util/sanitize';
import { asyncRoute, authLimiter, playerIdOf, requireSession, sessionPlayerId } from '../middleware';

const GuestBody = z.object({
  name: z.string().max(40).optional(),
  guestToken: z.string().min(20).max(100).optional(),
  setCookie: z.boolean().default(true),
});
const NameBody = z.object({ name: z.string().max(40) });
const CredentialsBody = z.object({ username: usernameSchema, password: passwordSchema, setCookie: z.boolean().default(true) });

const GUEST_NAMES = ['Doodler', 'Sketcher', 'Scribbler', 'Inkling', 'Brushy', 'Pixel', 'Crayon', 'Swatch'];

export function authRoutes(ctx: AppContext): Router {
  const r = Router();

  const issue = (res: Response, playerId: string, setCookie: boolean, extra: Record<string, unknown> = {}) => {
    const sessionToken = signSession(playerId);
    if (setCookie) res.cookie(SESSION_COOKIE, sessionToken, sessionCookieOptions());
    res.json({ player: ctx.players.profile(playerId), sessionToken, ...extra });
  };

  /** Creates a guest, or restores one from the localStorage guest token. */
  r.post(
    '/guest',
    authLimiter,
    asyncRoute(async (req, res) => {
      const body = GuestBody.parse(req.body ?? {});
      if (body.guestToken) {
        const existing = ctx.players.byGuestTokenHash(sha256(body.guestToken));
        if (existing) {
          if (body.name) {
            const check = validateDisplayName(body.name);
            if (check.ok) ctx.players.rename(existing.id, check.name);
          }
          return issue(res, existing.id, body.setCookie, { guestToken: body.guestToken });
        }
      }
      let name = `${GUEST_NAMES[Math.floor(Math.random() * GUEST_NAMES.length)]}${Math.floor(100 + Math.random() * 900)}`;
      if (body.name) {
        const check = validateDisplayName(body.name);
        if (!check.ok) {
          res.status(400).json({ error: check.error });
          return;
        }
        name = check.name;
      }
      const guestToken = randomToken(32);
      const player = ctx.players.create(newId('p_'), name, sha256(guestToken));
      issue(res, player.id, body.setCookie, { guestToken });
    }),
  );

  r.get('/me', (req, res) => {
    const id = sessionPlayerId(req);
    const profile = id ? ctx.players.profile(id) : null;
    if (!id || !profile) {
      res.status(401).json({ error: 'Not signed in' });
      return;
    }
    res.json({ player: profile, sessionToken: signSession(id) });
  });

  r.post('/name', requireSession, (req, res) => {
    const body = NameBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'Invalid name' });
      return;
    }
    const check = validateDisplayName(body.data.name);
    if (!check.ok) {
      res.status(400).json({ error: check.error });
      return;
    }
    const id = playerIdOf(res);
    ctx.players.rename(id, check.name);
    const socket = ctx.presence.socketOf(id);
    if (socket) socket.data.name = check.name;
    res.json({ player: ctx.players.profile(id) });
  });

  /** Upgrades the current guest into a persistent username + password account. */
  r.post(
    '/register',
    authLimiter,
    requireSession,
    asyncRoute(async (req, res) => {
      const body = CredentialsBody.safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ error: body.error.issues[0]?.message ?? 'Invalid details' });
        return;
      }
      const id = playerIdOf(res);
      const row = ctx.players.byId(id);
      if (!row) {
        res.status(404).json({ error: 'Player not found' });
        return;
      }
      if (!row.is_guest) {
        res.status(400).json({ error: 'This account already has a login' });
        return;
      }
      if (ctx.players.byUsername(body.data.username)) {
        res.status(409).json({ error: 'That username is taken' });
        return;
      }
      ctx.players.upgrade(id, body.data.username, await hashPassword(body.data.password));
      issue(res, id, body.data.setCookie);
    }),
  );

  r.post(
    '/login',
    authLimiter,
    asyncRoute(async (req, res) => {
      const body = CredentialsBody.safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ error: 'Invalid username or password' });
        return;
      }
      const row = ctx.players.byUsername(body.data.username);
      // Always run bcrypt so response time doesn't reveal whether the username exists.
      const ok = await checkPassword(body.data.password, row?.password_hash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
      if (!row || !row.password_hash || !ok) {
        res.status(401).json({ error: 'Invalid username or password' });
        return;
      }
      issue(res, row.id, body.data.setCookie);
    }),
  );

  r.post('/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(), maxAge: undefined });
    res.json({ ok: true });
  });

  return r;
}
