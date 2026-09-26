import fs from 'node:fs/promises';
import os from 'node:os';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { TEAM_SIZES, type TeamId } from '@ccc/shared';
import { config } from '../../config';
import type { AppContext } from '../../context';
import { roundFile } from '../../game/roundArchive';
import { MAX_UPLOAD_BYTES, processUpload } from '../../photos/preprocess';
import { cleanText } from '../../util/sanitize';
import { asyncRoute, playerIdOf, requireSession, sessionPlayerId, uploadLimiter } from '../middleware';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

const LeaderboardQuery = z.object({
  bucket: z.enum(TEAM_SIZES).default('1v1'),
  period: z.enum(['all', 'weekly']).default('all'),
  search: z.string().max(40).optional(),
});

export function gameRoutes(ctx: AppContext): Router {
  const r = Router();

  /** One-time photo delivery for the PEEK phase. Never cached anywhere. */
  r.get('/photo/:token', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    const token = String(req.params.token);
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) {
      res.status(404).end();
      return;
    }
    const image = ctx.photos.consumeToken(token, sessionPlayerId(req));
    if (!image) {
      res.status(404).json({ error: 'Photo link expired' });
      return;
    }
    res.type('image/jpeg').send(image);
  });

  r.get('/rounds/:matchId/:round/replay', (req, res) => {
    const replay = ctx.matches.replay(String(req.params.matchId), Number(req.params.round));
    if (!replay) {
      res.status(404).json({ error: 'Replay not found' });
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(replay);
  });

  /** Finished-round images: only exist once the round has been scored and archived. */
  r.get(
    '/rounds/:matchId/:round/:file',
    asyncRoute(async (req, res) => {
      const matchId = String(req.params.matchId);
      const round = Number(req.params.round);
      const file = String(req.params.file);
      const side = /^([A-E])\.png$/.exec(file)?.[1] as TeamId | undefined;
      const which = side ?? (file === 'ref.jpg' ? 'ref' : null);
      if (!which || !Number.isInteger(round) || round < 1 || !/^m_[A-Za-z0-9_-]+$/.test(matchId) || !ctx.matches.roundExists(matchId, round)) {
        res.status(404).end();
        return;
      }
      try {
        const data = await fs.readFile(roundFile(matchId, round, which));
        res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
        res.type(which === 'ref' ? 'image/jpeg' : 'image/png').send(data);
      } catch {
        res.status(404).end();
      }
    }),
  );

  r.get('/leaderboard', (req, res) => {
    const q = LeaderboardQuery.safeParse(req.query);
    if (!q.success) {
      res.status(400).json({ error: 'Invalid query' });
      return;
    }
    res.json({ entries: ctx.leaderboard.top(q.data.bucket, q.data.period, q.data.search ? cleanText(q.data.search, 40) : null) });
  });

  r.get('/profile/:id', (req, res) => {
    const id = String(req.params.id);
    const profile = ctx.players.profile(id);
    if (!profile) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }
    const { queueBanUntil: _ban, ...player } = profile;
    res.json({ player, history: ctx.matches.history(id), best: ctx.matches.bestDrawings(id), totals: ctx.matches.totals(id) });
  });

  r.get('/stats', (_req, res) => {
    res.json({ online: ctx.presence.count(), matches: ctx.registry.count(), photos: ctx.photos.libraryCount(), aiDegraded: ctx.scoring.aiDegraded });
  });

  /** Host-only photo uploads for custom rooms. Validated by magic bytes and fully re-encoded. */
  r.post(
    '/rooms/:code/photos',
    uploadLimiter,
    requireSession,
    upload.single('photo'),
    asyncRoute(async (req, res) => {
      const code = String(req.params.code);
      if (!ctx.rooms.isHost(code, playerIdOf(res))) {
        res.status(403).json({ error: 'Only the room host can upload photos' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'No file received' });
        return;
      }
      const checked = await processUpload(req.file.buffer);
      if (!checked.ok) {
        res.status(400).json({ error: checked.error });
        return;
      }
      const title = cleanText(String((req.body as Record<string, unknown>)?.title ?? 'Host photo'), 60) || 'Host photo';
      const added = ctx.photos.addUpload(code, checked.image, title);
      if (!added.ok) {
        res.status(400).json({ error: added.error });
        return;
      }
      ctx.rooms.notifyUploads(code);
      res.json({ count: added.count });
    }),
  );

  /**
   * Local-network play: the addresses other devices on the same Wi-Fi/LAN can use to reach this server.
   * Only exposed outside production; a hosted deploy just uses its public URL.
   */
  r.get('/network', (_req, res) => {
    res.json({ urls: config.isProd ? [] : lanUrls(config.port) });
  });

  if (!config.isProd) {
    /** Dev-only switch used by the playtest checklist to simulate an AI outage. */
    r.post('/dev/ai-failure', (req, res) => {
      const on = Boolean((req.body as { enabled?: unknown })?.enabled);
      ctx.scoring.setSimulatedFailure(on);
      res.json({ simulateFailure: on, aiDegraded: ctx.scoring.aiDegraded });
    });
  }

  return r;
}

// Virtual adapters (WSL, Docker, VPNs) aren't reachable from phones on the same Wi-Fi.
const VIRTUAL_ADAPTER = /vEthernet|WSL|Docker|Hyper-V|VirtualBox|VMware|ZeroTier|Tailscale|Loopback|utun|tun\d|br-|veth/i;

function isPrivateIpv4(ip: string): boolean {
  return /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
}

function lanUrls(port: number): string[] {
  const found: string[] = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (VIRTUAL_ADAPTER.test(name)) continue;
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal && isPrivateIpv4(a.address)) found.push(a.address);
    }
  }
  // Home routers almost always hand out 192.168.x.x, so list those first.
  found.sort((a, b) => Number(!a.startsWith('192.168.')) - Number(!b.startsWith('192.168.')));
  return found.map((ip) => `http://${ip}:${port}`);
}
