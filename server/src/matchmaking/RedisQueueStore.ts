import type { Redis } from 'ioredis';
import type { TeamSize } from '@ccc/shared';
import { queueKey, type QueueEntry, type QueueStore } from './QueueStore';

const ENTRIES = 'ccc:q:entries';
const PLAYERS = 'ccc:q:players';
const KEYS = 'ccc:q:keys';
const keySet = (k: string) => `ccc:q:key:${k}`;

/** Redis-backed queue so multiple server instances match from one pool. */
export class RedisQueueStore implements QueueStore {
  constructor(
    private readonly redis: Redis,
    private readonly instanceId: string,
  ) {}

  async add(entry: QueueEntry): Promise<void> {
    const k = queueKey(entry);
    const multi = this.redis.multi().hset(ENTRIES, entry.entryId, JSON.stringify(entry)).sadd(keySet(k), entry.entryId).sadd(KEYS, k);
    for (const p of entry.playerIds) multi.hset(PLAYERS, p, entry.entryId);
    await multi.exec();
  }

  private async get(entryId: string): Promise<QueueEntry | null> {
    const raw = await this.redis.hget(ENTRIES, entryId);
    return raw ? (JSON.parse(raw) as QueueEntry) : null;
  }

  async findByPlayer(playerId: string): Promise<QueueEntry | null> {
    const id = await this.redis.hget(PLAYERS, playerId);
    return id ? this.get(id) : null;
  }

  async removeEntry(entryId: string): Promise<QueueEntry | null> {
    const e = await this.get(entryId);
    if (!e) return null;
    const multi = this.redis.multi().hdel(ENTRIES, entryId).srem(keySet(queueKey(e)), entryId);
    for (const p of e.playerIds) multi.hdel(PLAYERS, p);
    await multi.exec();
    return e;
  }

  async list(key: string): Promise<QueueEntry[]> {
    const ids = await this.redis.smembers(keySet(key));
    if (!ids.length) return [];
    const raws = await this.redis.hmget(ENTRIES, ...ids);
    return raws.filter((r): r is string => !!r).map((r) => JSON.parse(r) as QueueEntry);
  }

  async keys(): Promise<string[]> {
    return this.redis.smembers(KEYS);
  }

  async counts(): Promise<Record<TeamSize, number>> {
    const out: Record<TeamSize, number> = { '1v1': 0, '2v2': 0, '3v3': 0 };
    const all = await this.redis.hvals(ENTRIES);
    for (const raw of all) {
      const e = JSON.parse(raw) as QueueEntry;
      out[e.teamSize] += e.playerIds.length;
    }
    return out;
  }

  async tryLock(name: string, ttlMs: number): Promise<boolean> {
    const res = await this.redis.set(`ccc:lock:${name}`, this.instanceId, 'PX', ttlMs, 'NX');
    return res === 'OK';
  }
}
