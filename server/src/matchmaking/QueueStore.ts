import type { GameMode, TeamSize } from '@ccc/shared';

export interface QueueEntry {
  entryId: string;
  playerIds: string[];
  partyCode: string | null;
  teamSize: TeamSize;
  mode: GameMode;
  ranked: boolean;
  elo: number;
  joinedAt: number;
}

export function queueKey(e: Pick<QueueEntry, 'teamSize' | 'mode' | 'ranked'>): string {
  return `${e.teamSize}:${e.mode}:${e.ranked ? 'r' : 'c'}`;
}

/**
 * Storage for matchmaking queues. The in-memory store serves a single instance;
 * set REDIS_URL to switch to the Redis store so several instances share one queue.
 */
export interface QueueStore {
  add(entry: QueueEntry): Promise<void>;
  findByPlayer(playerId: string): Promise<QueueEntry | null>;
  removeEntry(entryId: string): Promise<QueueEntry | null>;
  list(key: string): Promise<QueueEntry[]>;
  keys(): Promise<string[]>;
  /** Number of queued players per team size. */
  counts(): Promise<Record<TeamSize, number>>;
  /** Cross-instance mutual exclusion for the matchmaking tick. */
  tryLock(name: string, ttlMs: number): Promise<boolean>;
}
