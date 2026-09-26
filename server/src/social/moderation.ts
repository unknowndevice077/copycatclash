import type { ModerationRepo } from '../db/repos/misc';
import type { PlayersRepo } from '../db/repos/players';
import type { Presence } from '../socket/presence';
import { log } from '../util/logger';

const FREE_QUITS_PER_DAY = 2;
const BASE_BAN_MS = 5 * 60_000;
const MAX_BAN_MS = 2 * 60 * 60_000;

/** Escalating temporary queue bans for repeated rage quits (leaving or never returning mid-match). */
export class Moderation {
  constructor(
    private readonly repo: ModerationRepo,
    private readonly players: PlayersRepo,
    private readonly presence: Presence,
  ) {}

  onRageQuit(playerId: string, matchId: string): void {
    const count = this.repo.recordRageQuit(playerId, matchId);
    if (count <= FREE_QUITS_PER_DAY) return;
    const ms = Math.min(MAX_BAN_MS, BASE_BAN_MS * 2 ** (count - FREE_QUITS_PER_DAY - 1));
    const until = Date.now() + ms;
    this.players.setQueueBan(playerId, until);
    log.warn('queue ban applied', { playerId, count, minutes: ms / 60_000 });
    const profile = this.players.profile(playerId);
    const socket = this.presence.socketOf(playerId);
    if (socket && profile) {
      socket.emit('session:profile', profile);
      socket.emit('notice', {
        kind: 'warn',
        code: 'queue_ban',
        message: `You left ${count} matches today. Queueing is paused for ${Math.round(ms / 60_000)} minutes.`,
      });
    }
  }

  report(reporterId: string, reportedId: string, matchId: string | null, reason: string): { ok: boolean; error?: string } {
    if (reporterId === reportedId) return { ok: false, error: 'You cannot report yourself' };
    if (this.repo.hasReported(reporterId, reportedId, matchId)) return { ok: false, error: 'Already reported' };
    this.repo.report(reporterId, reportedId, matchId, reason);
    log.info('player reported', { reporterId, reportedId, matchId, reason });
    return { ok: true };
  }
}
