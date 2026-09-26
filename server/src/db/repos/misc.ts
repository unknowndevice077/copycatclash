import { rankFromElo, type DrawOp, type LeaderboardEntry, type TeamSize, levelFromXp } from '@ccc/shared';
import type { DB } from '../index';

export interface GhostRow {
  id: string;
  player_id: string;
  player_name: string;
  elo: number;
  photo_id: string;
  draw_ms: number;
  ops_json: string;
  score: number;
}

export interface GhostRecording {
  id: string;
  playerId: string;
  playerName: string;
  elo: number;
  photoId: string;
  drawMs: number;
  ops: DrawOp[];
}

export class GhostsRepo {
  constructor(private readonly db: DB) {}

  insert(g: Omit<GhostRecording, 'ops'> & { opsJson: string; score: number }): void {
    this.db
      .prepare('INSERT INTO ghosts (id, player_id, player_name, elo, photo_id, draw_ms, ops_json, score, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(g.id, g.playerId, g.playerName, g.elo, g.photoId, g.drawMs, g.opsJson, g.score, Date.now());
  }

  /** Recordings near an Elo, one per photo, excluding the requesting player's own drawings. */
  near(elo: number, window: number, excludePlayerId: string, limit: number): GhostRecording[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM ghosts WHERE elo BETWEEN ? AND ? AND player_id != ? AND score > 5
         ORDER BY RANDOM() LIMIT ?`,
      )
      .all(elo - window, elo + window, excludePlayerId, limit * 4) as GhostRow[];
    const seen = new Set<string>();
    const out: GhostRecording[] = [];
    for (const r of rows) {
      if (seen.has(r.photo_id)) continue;
      seen.add(r.photo_id);
      out.push({
        id: r.id,
        playerId: r.player_id,
        playerName: r.player_name,
        elo: r.elo,
        photoId: r.photo_id,
        drawMs: r.draw_ms,
        ops: JSON.parse(r.ops_json) as DrawOp[],
      });
      if (out.length >= limit) break;
    }
    return out;
  }

  countNear(elo: number, window: number, excludePlayerId: string): number {
    const r = this.db
      .prepare('SELECT COUNT(DISTINCT photo_id) AS n FROM ghosts WHERE elo BETWEEN ? AND ? AND player_id != ? AND score > 5')
      .get(elo - window, elo + window, excludePlayerId) as { n: number };
    return r.n;
  }
}

export interface PhotoMetaInput {
  id: string;
  title: string;
  category: string;
  difficulty: string;
  provider: string;
  author: string | null;
  sourceUrl: string | null;
  license: string;
}

export class PhotosRepo {
  constructor(private readonly db: DB) {}

  sync(photos: PhotoMetaInput[]): void {
    const up = this.db.prepare(
      `INSERT INTO photos (id, title, category, difficulty, provider, author, source_url, license, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, category = excluded.category, difficulty = excluded.difficulty,
         provider = excluded.provider, author = excluded.author, source_url = excluded.source_url, license = excluded.license,
         updated_at = excluded.updated_at`,
    );
    const now = Date.now();
    this.db.transaction(() => {
      for (const p of photos) up.run(p.id, p.title, p.category, p.difficulty, p.provider, p.author, p.sourceUrl, p.license, now);
    })();
  }

  markUsed(photoId: string, playerIds: string[]): void {
    const now = Date.now();
    this.db.transaction(() => {
      this.db.prepare('UPDATE photos SET times_used = times_used + 1 WHERE id = ?').run(photoId);
      const ins = this.db.prepare('INSERT INTO player_photo_history (player_id, photo_id, seen_at) VALUES (?, ?, ?)');
      for (const p of playerIds) ins.run(p, photoId, now);
    })();
  }

  recentForPlayer(playerId: string, limit = 20): string[] {
    const rows = this.db
      .prepare('SELECT photo_id FROM player_photo_history WHERE player_id = ? ORDER BY seen_at DESC LIMIT ?')
      .all(playerId, limit) as Array<{ photo_id: string }>;
    return rows.map((r) => r.photo_id);
  }
}

export class ModerationRepo {
  constructor(private readonly db: DB) {}

  report(reporterId: string, reportedId: string, matchId: string | null, reason: string): void {
    this.db
      .prepare('INSERT INTO reports (reporter_id, reported_id, match_id, reason, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(reporterId, reportedId, matchId, reason, Date.now());
  }

  hasReported(reporterId: string, reportedId: string, matchId: string | null): boolean {
    return !!this.db
      .prepare('SELECT 1 FROM reports WHERE reporter_id = ? AND reported_id = ? AND match_id IS ?')
      .get(reporterId, reportedId, matchId);
  }

  recordRageQuit(playerId: string, matchId: string): number {
    const now = Date.now();
    this.db.prepare('INSERT INTO rage_quits (player_id, match_id, at) VALUES (?, ?, ?)').run(playerId, matchId, now);
    const r = this.db.prepare('SELECT COUNT(*) AS n FROM rage_quits WHERE player_id = ? AND at > ?').get(playerId, now - 86_400_000) as {
      n: number;
    };
    return r.n;
  }
}

export class ScoringLogRepo {
  constructor(private readonly db: DB) {}

  insert(e: { matchId: string | null; round: number | null; team: string | null; source: string; latencyMs: number; score: number | null; error: string | null }): void {
    this.db
      .prepare('INSERT INTO scoring_log (match_id, round_no, team, source, latency_ms, score, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(e.matchId, e.round, e.team, e.source, e.latencyMs, e.score, e.error, Date.now());
  }
}

interface BoardRow {
  player_id: string;
  name: string;
  xp: number;
  elo: number;
  games: number;
  wins: number;
  weekly: number | null;
}

export class LeaderboardRepo {
  constructor(private readonly db: DB) {}

  private weekStart(): number {
    const d = new Date();
    const day = (d.getUTCDay() + 6) % 7; // Monday = 0
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
  }

  top(bucket: TeamSize, period: 'all' | 'weekly', search: string | null, limit = 100): LeaderboardEntry[] {
    const since = this.weekStart();
    const weeklyExpr = `(SELECT SUM(mp.delta) FROM match_players mp JOIN matches m ON m.id = mp.match_id
        WHERE mp.player_id = r.player_id AND m.bucket = r.bucket AND m.ended_at >= @since AND mp.is_ghost = 0)`;
    const order = period === 'weekly' ? 'weekly DESC, r.elo DESC' : 'r.elo DESC';
    const where = period === 'weekly' ? `AND ${weeklyExpr} IS NOT NULL` : 'AND r.games > 0';
    const rows = this.db
      .prepare(
        `SELECT r.player_id, p.name, p.xp, r.elo, r.games, r.wins, ${weeklyExpr} AS weekly
         FROM ratings r JOIN players p ON p.id = r.player_id
         WHERE r.bucket = @bucket ${where}
         ORDER BY ${order} LIMIT 1000`,
      )
      .all({ bucket, since }) as BoardRow[];
    const ranked = rows.map((r, i) => this.toEntry(r, i + 1));
    const needle = search?.trim().toLowerCase();
    const filtered = needle ? ranked.filter((e) => e.name.toLowerCase().includes(needle)) : ranked;
    return filtered.slice(0, limit);
  }

  private toEntry(r: BoardRow, position: number): LeaderboardEntry {
    return {
      position,
      playerId: r.player_id,
      name: r.name,
      level: levelFromXp(r.xp).level,
      elo: Math.round(r.elo),
      rank: rankFromElo(r.elo),
      games: r.games,
      wins: r.wins,
      weeklyDelta: Math.round(r.weekly ?? 0),
    };
  }
}
