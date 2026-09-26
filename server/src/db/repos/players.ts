import { ELO, TEAM_SIZES, levelFromXp, rankFromElo, type PlayerProfile, type RatingSummary, type TeamSize } from '@ccc/shared';
import type { DB } from '../index';

export interface PlayerRow {
  id: string;
  name: string;
  username: string | null;
  password_hash: string | null;
  guest_token_hash: string | null;
  is_guest: number;
  xp: number;
  win_streak: number;
  best_win_streak: number;
  daily_streak: number;
  last_daily_date: string | null;
  queue_ban_until: number | null;
  created_at: number;
  last_seen_at: number;
}

interface RatingRow {
  bucket: TeamSize;
  elo: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
}

export class PlayersRepo {
  constructor(private readonly db: DB) {}

  create(id: string, name: string, guestTokenHash: string): PlayerRow {
    const now = Date.now();
    this.db.transaction(() => {
      this.db
        .prepare('INSERT INTO players (id, name, guest_token_hash, is_guest, created_at, last_seen_at) VALUES (?, ?, ?, 1, ?, ?)')
        .run(id, name, guestTokenHash, now, now);
      const ins = this.db.prepare('INSERT INTO ratings (player_id, bucket, elo) VALUES (?, ?, ?)');
      for (const b of TEAM_SIZES) ins.run(id, b, ELO.start);
    })();
    return this.byId(id) as PlayerRow;
  }

  byId(id: string): PlayerRow | undefined {
    return this.db.prepare('SELECT * FROM players WHERE id = ?').get(id) as PlayerRow | undefined;
  }

  byGuestTokenHash(hash: string): PlayerRow | undefined {
    return this.db.prepare('SELECT * FROM players WHERE guest_token_hash = ?').get(hash) as PlayerRow | undefined;
  }

  byUsername(username: string): PlayerRow | undefined {
    return this.db.prepare('SELECT * FROM players WHERE username = ?').get(username) as PlayerRow | undefined;
  }

  rename(id: string, name: string): void {
    this.db.prepare('UPDATE players SET name = ? WHERE id = ?').run(name, id);
  }

  upgrade(id: string, username: string, passwordHash: string): void {
    this.db.prepare('UPDATE players SET username = ?, password_hash = ?, is_guest = 0 WHERE id = ?').run(username, passwordHash, id);
  }

  touch(id: string): void {
    this.db.prepare('UPDATE players SET last_seen_at = ? WHERE id = ?').run(Date.now(), id);
  }

  setQueueBan(id: string, until: number | null): void {
    this.db.prepare('UPDATE players SET queue_ban_until = ? WHERE id = ?').run(until, id);
  }

  ratings(id: string): Record<TeamSize, RatingSummary> {
    const rows = this.db.prepare('SELECT bucket, elo, games, wins, losses, draws FROM ratings WHERE player_id = ?').all(id) as RatingRow[];
    const out = {} as Record<TeamSize, RatingSummary>;
    for (const b of TEAM_SIZES) {
      const r = rows.find((x) => x.bucket === b) ?? { bucket: b, elo: ELO.start, games: 0, wins: 0, losses: 0, draws: 0 };
      out[b] = { elo: Math.round(r.elo), games: r.games, wins: r.wins, losses: r.losses, draws: r.draws, rank: rankFromElo(r.elo) };
    }
    return out;
  }

  rating(id: string, bucket: TeamSize): { elo: number; games: number } {
    const r = this.db.prepare('SELECT elo, games FROM ratings WHERE player_id = ? AND bucket = ?').get(id, bucket) as
      | { elo: number; games: number }
      | undefined;
    return r ?? { elo: ELO.start, games: 0 };
  }

  applyRating(id: string, bucket: TeamSize, newElo: number, result: 'win' | 'loss' | 'draw'): void {
    this.db
      .prepare(
        `INSERT INTO ratings (player_id, bucket, elo, games, wins, losses, draws) VALUES (?, ?, ?, 1, ?, ?, ?)
         ON CONFLICT(player_id, bucket) DO UPDATE SET elo = excluded.elo, games = games + 1,
           wins = wins + excluded.wins, losses = losses + excluded.losses, draws = draws + excluded.draws`,
      )
      .run(id, bucket, newElo, result === 'win' ? 1 : 0, result === 'loss' ? 1 : 0, result === 'draw' ? 1 : 0);
  }

  applyProgress(id: string, fields: { xp: number; winStreak: number; bestWinStreak: number; dailyStreak: number; lastDailyDate: string }): void {
    this.db
      .prepare('UPDATE players SET xp = ?, win_streak = ?, best_win_streak = ?, daily_streak = ?, last_daily_date = ? WHERE id = ?')
      .run(fields.xp, fields.winStreak, fields.bestWinStreak, fields.dailyStreak, fields.lastDailyDate, id);
  }

  profile(id: string): PlayerProfile | null {
    const row = this.byId(id);
    if (!row) return null;
    const lvl = levelFromXp(row.xp);
    return {
      id: row.id,
      name: row.name,
      username: row.username,
      isGuest: row.is_guest === 1,
      level: lvl.level,
      xp: row.xp,
      xpIntoLevel: lvl.xpIntoLevel,
      xpForNextLevel: lvl.xpForNextLevel,
      winStreak: row.win_streak,
      bestWinStreak: row.best_win_streak,
      dailyStreak: row.daily_streak,
      ratings: this.ratings(id),
      queueBanUntil: row.queue_ban_until && row.queue_ban_until > Date.now() ? row.queue_ban_until : null,
    };
  }
}
