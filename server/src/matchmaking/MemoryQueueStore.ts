import type { TeamSize } from '@ccc/shared';
import { queueKey, type QueueEntry, type QueueStore } from './QueueStore';

export class MemoryQueueStore implements QueueStore {
  private readonly entries = new Map<string, QueueEntry>();
  private readonly players = new Map<string, string>();

  async add(entry: QueueEntry): Promise<void> {
    this.entries.set(entry.entryId, entry);
    for (const p of entry.playerIds) this.players.set(p, entry.entryId);
  }

  async findByPlayer(playerId: string): Promise<QueueEntry | null> {
    const id = this.players.get(playerId);
    return id ? (this.entries.get(id) ?? null) : null;
  }

  async removeEntry(entryId: string): Promise<QueueEntry | null> {
    const e = this.entries.get(entryId);
    if (!e) return null;
    this.entries.delete(entryId);
    for (const p of e.playerIds) if (this.players.get(p) === entryId) this.players.delete(p);
    return e;
  }

  async list(key: string): Promise<QueueEntry[]> {
    return [...this.entries.values()].filter((e) => queueKey(e) === key);
  }

  async keys(): Promise<string[]> {
    return [...new Set([...this.entries.values()].map(queueKey))];
  }

  async counts(): Promise<Record<TeamSize, number>> {
    const out: Record<TeamSize, number> = { '1v1': 0, '2v2': 0, '3v3': 0 };
    for (const e of this.entries.values()) out[e.teamSize] += e.playerIds.length;
    return out;
  }

  async tryLock(): Promise<boolean> {
    return true;
  }
}
