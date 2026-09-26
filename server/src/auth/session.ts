import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { CookieOptions } from 'express';
import { config } from '../config';

export const SESSION_COOKIE = 'ccc_session';
const SESSION_TTL_SEC = 60 * 60 * 24 * 30;

interface SessionClaims {
  sub: string;
  v: 1;
}

export function signSession(playerId: string): string {
  const claims: SessionClaims = { sub: playerId, v: 1 };
  return jwt.sign(claims, config.jwtSecret, { algorithm: 'HS256', expiresIn: SESSION_TTL_SEC });
}

export function verifySession(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    if (typeof decoded === 'object' && decoded !== null && typeof decoded.sub === 'string') return decoded.sub;
    return null;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    maxAge: SESSION_TTL_SEC * 1000,
    path: '/',
  };
}

/** Parses a raw Cookie header (used during the Socket.IO handshake). */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}

export const hashPassword = (password: string): Promise<string> => bcrypt.hash(password, 12);
export const checkPassword = (password: string, hash: string): Promise<boolean> => bcrypt.compare(password, hash);
