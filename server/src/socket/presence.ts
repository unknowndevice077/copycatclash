import type { TypedServer, TypedSocket } from './types';

/** Tracks the single live socket for each player. A newer connection replaces an older one. */
export class Presence {
  private readonly sockets = new Map<string, string>();

  constructor(private readonly io: TypedServer) {}

  register(playerId: string, socket: TypedSocket): void {
    const previous = this.sockets.get(playerId);
    if (previous && previous !== socket.id) {
      const old = this.io.sockets.sockets.get(previous);
      if (old) {
        old.emit('notice', { kind: 'warn', code: 'session_replaced', message: 'You connected from another tab.' });
        old.disconnect(true);
      }
    }
    this.sockets.set(playerId, socket.id);
  }

  unregister(playerId: string, socketId: string): boolean {
    if (this.sockets.get(playerId) !== socketId) return false;
    this.sockets.delete(playerId);
    return true;
  }

  socketOf(playerId: string): TypedSocket | undefined {
    const id = this.sockets.get(playerId);
    return id ? this.io.sockets.sockets.get(id) : undefined;
  }

  isOnline(playerId: string): boolean {
    return this.sockets.has(playerId);
  }

  count(): number {
    return this.sockets.size;
  }
}
