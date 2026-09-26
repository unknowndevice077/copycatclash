import 'dotenv/config';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === '1' || v?.toLowerCase() === 'true');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(3001),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  JWT_SECRET: z.string().optional(),
  COOKIE_SECURE: bool,
  TRUST_PROXY: bool,

  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-6'),
  AI_TIMEOUT_MS: z.coerce.number().int().default(6000),
  AI_MAX_CONCURRENCY: z.coerce.number().int().default(4),
  AI_MAX_CALLS_PER_MIN: z.coerce.number().int().default(60),
  AI_MAX_CALLS_PER_MATCH: z.coerce.number().int().default(40),
  AI_FAILURES_BEFORE_DEGRADED: z.coerce.number().int().default(3),
  AI_DEGRADED_COOLDOWN_MS: z.coerce.number().int().default(60_000),
  SCORING_SIMULATE_AI_FAILURE: bool,
  SCORING_TIE_BREAK_BY_PIXELS: bool,

  PHOTO_PROVIDER: z.enum(['local', 'unsplash']).default('local'),
  UNSPLASH_ACCESS_KEY: z.string().optional(),
  UNSPLASH_APP_NAME: z.string().default('copy_cat_clash'),

  DATA_DIR: z.string().default('./data'),
  PHOTOS_DIR: z.string().default('./photos'),
  DATABASE_PATH: z.string().optional(),
  CLIENT_DIST: z.string().default('../client/dist'),

  REDIS_URL: z.string().optional(),
  MAX_CONN_PER_IP: z.coerce.number().int().default(12),
  MAX_TOTAL_CONNECTIONS: z.coerce.number().int().default(5000),
});

const env = EnvSchema.parse(process.env);
const isProd = env.NODE_ENV === 'production';

if (isProd && !env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

const dataDir = path.resolve(env.DATA_DIR);

export const config = {
  env: env.NODE_ENV,
  isProd,
  port: env.PORT,
  host: env.HOST,
  corsOrigins: env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
  // Dev fallback secret is random per boot, so sessions never survive restarts without a real secret.
  jwtSecret: env.JWT_SECRET ?? randomBytes(32).toString('hex'),
  jwtSecretIsEphemeral: !env.JWT_SECRET,
  cookieSecure: env.COOKIE_SECURE || isProd,
  trustProxy: env.TRUST_PROXY,

  ai: {
    apiKey: env.ANTHROPIC_API_KEY,
    model: env.ANTHROPIC_MODEL,
    timeoutMs: env.AI_TIMEOUT_MS,
    maxConcurrency: env.AI_MAX_CONCURRENCY,
    maxCallsPerMinute: env.AI_MAX_CALLS_PER_MIN,
    maxCallsPerMatch: env.AI_MAX_CALLS_PER_MATCH,
    failuresBeforeDegraded: env.AI_FAILURES_BEFORE_DEGRADED,
    degradedCooldownMs: env.AI_DEGRADED_COOLDOWN_MS,
    simulateFailure: env.SCORING_SIMULATE_AI_FAILURE,
  },
  scoring: {
    tieBreakByPixels: env.SCORING_TIE_BREAK_BY_PIXELS,
  },
  photos: {
    provider: env.PHOTO_PROVIDER,
    dir: path.resolve(env.PHOTOS_DIR),
    unsplashKey: env.UNSPLASH_ACCESS_KEY,
    unsplashAppName: env.UNSPLASH_APP_NAME,
  },
  dataDir,
  roundsDir: path.join(dataDir, 'rounds'),
  databasePath: path.resolve(env.DATABASE_PATH ?? path.join(dataDir, 'copycatclash.sqlite')),
  clientDist: path.resolve(env.CLIENT_DIST),
  redisUrl: env.REDIS_URL,
  maxConnPerIp: env.MAX_CONN_PER_IP,
  maxTotalConnections: env.MAX_TOTAL_CONNECTIONS,
} as const;

export type AppConfig = typeof config;
