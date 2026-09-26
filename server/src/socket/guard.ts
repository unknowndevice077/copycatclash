import type { z } from 'zod';
import type { Ack } from '@ccc/shared';
import { TokenBucket } from '../util/concurrency';
import { errMessage, log } from '../util/logger';
import type { TypedSocket } from './types';

export type Bucket = 'draw' | 'cursor' | 'chat' | 'emote' | 'general';

const LIMITS: Record<Bucket, [rate: number, burst: number]> = {
  draw: [80, 160],
  cursor: [25, 40],
  chat: [1, 4],
  emote: [1, 3],
  general: [8, 20],
};

const MAX_VIOLATIONS_PER_MIN = 300;

/** Per-socket rate limiting with abuse disconnects. */
export class SocketLimiter {
  private readonly buckets = new Map<Bucket, TokenBucket>();
  private violations = 0;
  private windowStart = Date.now();

  constructor(private readonly socket: TypedSocket) {}

  allow(bucket: Bucket): boolean {
    let b = this.buckets.get(bucket);
    if (!b) {
      const [rate, burst] = LIMITS[bucket];
      b = new TokenBucket(rate, burst);
      this.buckets.set(bucket, b);
    }
    if (b.take()) return true;
    if (Date.now() - this.windowStart > 60_000) {
      this.windowStart = Date.now();
      this.violations = 0;
    }
    if (++this.violations > MAX_VIOLATIONS_PER_MIN) {
      log.warn('socket disconnected for flooding', { playerId: this.socket.data.playerId });
      this.socket.disconnect(true);
    }
    return false;
  }
}

type AckFn<T> = (res: Ack<T>) => void;

export function fail<T>(cb: AckFn<T> | undefined, error: string, code?: string): void {
  if (typeof cb === 'function') cb({ ok: false, error, code });
}

export function ok<T>(cb: AckFn<T> | undefined, data: T): void {
  if (typeof cb === 'function') cb({ ok: true, data });
}

/**
 * Wraps a payload handler with rate limiting, zod validation and error isolation.
 * Invalid payloads are dropped (and acked with an error when an ack callback exists).
 */
export function validated<S extends z.ZodTypeAny, R>(
  limiter: SocketLimiter,
  bucket: Bucket,
  schema: S,
  handler: (input: z.infer<S>, cb?: AckFn<R>) => void | Promise<void>,
): (payload: unknown, cb?: AckFn<R>) => void {
  return (payload, cb) => {
    if (!limiter.allow(bucket)) return fail(cb, 'Slow down a little', 'rate_limited');
    const parsed = schema.safeParse(payload);
    if (!parsed.success) return fail(cb, parsed.error.issues[0]?.message ?? 'Invalid request', 'invalid');
    Promise.resolve(handler(parsed.data, cb)).catch((err: unknown) => {
      log.error('socket handler failed', { error: errMessage(err) });
      fail(cb, 'Something went wrong');
    });
  };
}

/** Same as `validated` for events without a payload (only an optional ack). */
export function simple<R>(limiter: SocketLimiter, bucket: Bucket, handler: (cb?: AckFn<R>) => void | Promise<void>): (cb?: AckFn<R>) => void {
  return (cb) => {
    if (!limiter.allow(bucket)) return fail(cb, 'Slow down a little', 'rate_limited');
    Promise.resolve(handler(cb)).catch((err: unknown) => {
      log.error('socket handler failed', { error: errMessage(err) });
      fail(cb, 'Something went wrong');
    });
  };
}
