import { createServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { config } from './config';
import { createContext } from './context';
import { createApp } from './http/app';
import { MemoryQueueStore } from './matchmaking/MemoryQueueStore';
import type { QueueStore } from './matchmaking/QueueStore';
import { RedisQueueStore } from './matchmaking/RedisQueueStore';
import { attachSocketLayer, createIo } from './socket/io';
import { newId } from './util/ids';
import { errMessage, log } from './util/logger';

async function main(): Promise<void> {
  const httpServer = createServer();
  const io = createIo(httpServer);
  const instanceId = newId('i_');

  // Horizontal scaling: REDIS_URL swaps the queue store and enables the Socket.IO Redis adapter.
  let store: QueueStore = new MemoryQueueStore();
  if (config.redisUrl) {
    const pub = new Redis(config.redisUrl);
    const sub = pub.duplicate();
    io.adapter(createAdapter(pub, sub));
    store = new RedisQueueStore(pub, instanceId);
    log.info('redis enabled: shared queues + socket.io adapter');
  }

  const ctx = createContext(io, store);
  await ctx.photos.init();
  if (ctx.photos.libraryCount() === 0) {
    log.warn('photo library is empty. Run `npm run photos:fetch` before playing.');
  }

  const app = createApp(ctx);
  httpServer.on('request', app);
  attachSocketLayer(io, ctx);
  ctx.matchmaker.start();

  if (config.jwtSecretIsEphemeral) log.warn('JWT_SECRET not set: using a random dev secret (sessions reset on restart)');
  if (!config.ai.apiKey) log.warn('ANTHROPIC_API_KEY not set: every round will use the pixel fallback judge');

  httpServer.listen(config.port, config.host, () => {
    log.info('Copy Cat Clash server listening', { port: config.port, env: config.env, model: config.ai.model, instanceId });
  });

  const shutdown = (signal: string) => {
    log.info('shutting down', { signal });
    io.close();
    httpServer.close(() => {
      ctx.db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  log.error('fatal startup error', { error: errMessage(err) });
  process.exit(1);
});
