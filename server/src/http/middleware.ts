import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { SESSION_COOKIE, verifySession } from '../auth/session';

/** Resolves the session from `Authorization: Bearer` (per-tab sessions) or the httpOnly cookie. */
export function sessionPlayerId(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return verifySession(header.slice(7));
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  return verifySession(cookies?.[SESSION_COOKIE]);
}

export function requireSession(req: Request, res: Response, next: NextFunction): void {
  const id = sessionPlayerId(req);
  if (!id) {
    res.status(401).json({ error: 'Not signed in' });
    return;
  }
  res.locals.playerId = id;
  next();
}

export function playerIdOf(res: Response): string {
  return res.locals.playerId as string;
}

export const apiLimiter = rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: 'draft-7', legacyHeaders: false });
export const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 40, standardHeaders: 'draft-7', legacyHeaders: false });
export const uploadLimiter = rateLimit({ windowMs: 60_000, limit: 15, standardHeaders: 'draft-7', legacyHeaders: false });

/** Wraps async route handlers so rejections reach the error handler. */
export function asyncRoute(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };
}
