import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { config } from '../config';
import type { AppContext } from '../context';
import { errMessage, log } from '../util/logger';
import { bugReportRoutes } from './bugReports';
import { apiLimiter } from './middleware';
import { authRoutes } from './routes/auth';
import { gameRoutes } from './routes/game';

export function createApp(ctx: AppContext): express.Express {
  const app = express();
  if (config.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'img-src': ["'self'", 'data:', 'blob:', 'https://images.unsplash.com'],
          'connect-src': ["'self'", 'ws:', 'wss:', 'blob:'],
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com'],
          'script-src': ["'self'"],
          // Only force https when actually served over https; on plain-http LAN play this would
          // rewrite every asset URL to https and leave phones with a blank page.
          'upgrade-insecure-requests': config.cookieSecure ? [] : null,
        },
      },
      strictTransportSecurity: config.cookieSecure,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: '32kb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, photos: ctx.photos.libraryCount(), aiDegraded: ctx.scoring.aiDegraded });
  });

  app.use('/api', apiLimiter);
  app.use('/api/auth', authRoutes(ctx));
  app.use('/api', gameRoutes(ctx));
  app.use(bugReportRoutes({ game: 'Copy Cat Clash', ...config.bugReports }));
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // In production the server also hosts the built client (single deployable).
  const indexHtml = path.join(config.clientDist, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(config.clientDist, { index: false, maxAge: '7d', setHeaders: noCacheHtml }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtml);
    });
    log.info('serving client build', { dir: config.clientDist });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request' });
      return;
    }
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'Image must be 5MB or smaller' });
      return;
    }
    log.error('http error', { error: errMessage(err) });
    res.status(500).json({ error: 'Internal error' });
  });

  return app;
}

function noCacheHtml(res: Response, filePath: string): void {
  if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
}
