import type {
  Attribution,
  BestDrawing,
  DrawOp,
  GameMode,
  MatchHistoryItem,
  MatchRules,
  ReplayData,
  RoundSummary,
  ScoreSource,
  TeamId,
  TeamSize,
} from '@ccc/shared';
import type { DB } from '../index';

export function roundImageUrl(matchId: string, round: number, which: TeamId | 'ref'): string {
  return which === 'ref' ? `/api/rounds/${matchId}/${round}/ref.jpg` : `/api/rounds/${matchId}/${round}/${which}.png`;
}

export interface RoundInsert {
  matchId: string;
  round: number;
  photoId: string;
  photoTitle: string;
  mirrored: boolean;
  revealUrl: string | null;
  attribution: Attribution;
  teamIds: TeamId[];
  scores: Partial<Record<TeamId, { score: number; source: ScoreSource; reason: string }>>;
  winner: TeamId | 'draw';
  estimated: boolean;
  drawMs: number;
  ops: Partial<Record<TeamId, DrawOp[]>>;
}

/** Per-side round data stored in rounds.teams_json. */
type TeamsJson = Partial<Record<TeamId, { score: number; source: ScoreSource; reason: string; ops: DrawOp[] }>>;

export interface MatchPlayerInsert {
  playerId: string;
  team: TeamId;
  isGhost: boolean;
  eloBefore: number | null;
  eloAfter: number | null;
  delta: number;
  result: 'win' | 'loss' | 'draw';
  mvp: boolean;
  contribution: number;
}

interface RoundRow {
  round_no: number;
  photo_title: string;
  mirrored: number;
  reveal_url: string | null;
  attribution_json: string;
  score_a: number;
  score_b: number;
  winner: string;
  estimated: number;
  draw_ms: number;
  ops_a: string;
  ops_b: string;
  teams_json: string | null;
}

/** Round data for every side: from teams_json, or the A/B columns for rounds saved before it existed. */
function roundTeams(r: Pick<RoundRow, 'score_a' | 'score_b' | 'ops_a' | 'ops_b' | 'teams_json'>): Array<[TeamId, { score: number; ops: () => DrawOp[] }]> {
  if (r.teams_json) {
    const parsed = JSON.parse(r.teams_json) as TeamsJson;
    return (Object.keys(parsed) as TeamId[]).map((t) => [t, { score: parsed[t]?.score ?? 0, ops: () => parsed[t]?.ops ?? [] }]);
  }
  return [
    ['A', { score: r.score_a, ops: () => JSON.parse(r.ops_a) as DrawOp[] }],
    ['B', { score: r.score_b, ops: () => JSON.parse(r.ops_b) as DrawOp[] }],
  ];
}

/** SQL for a player's score in a round, whichever side they were on. */
const SIDE_SCORE = `COALESCE(json_extract(r.teams_json, '$.' || mp.team || '.score'), CASE mp.team WHEN 'A' THEN r.score_a ELSE r.score_b END)`;

export class MatchesRepo {
  constructor(private readonly db: DB) {}

  start(id: string, rules: MatchRules): void {
    this.db
      .prepare('INSERT INTO matches (id, bucket, mode, ranked, ghost, custom, rules_json, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, rules.teamSize, rules.mode, rules.ranked ? 1 : 0, rules.ghost ? 1 : 0, rules.custom ? 1 : 0, JSON.stringify(rules), Date.now());
  }

  finish(
    id: string,
    winner: TeamId | 'draw',
    score: Partial<Record<TeamId, number>>,
    forfeit: boolean,
    aiDegraded: boolean,
    players: MatchPlayerInsert[],
  ): void {
    this.db.transaction(() => {
      this.db
        .prepare('UPDATE matches SET winner = ?, score_a = ?, score_b = ?, scores_json = ?, forfeit = ?, ai_degraded = ?, ended_at = ? WHERE id = ?')
        .run(winner, score.A ?? 0, score.B ?? 0, JSON.stringify(score), forfeit ? 1 : 0, aiDegraded ? 1 : 0, Date.now(), id);
      const ins = this.db.prepare(
        `INSERT OR REPLACE INTO match_players (match_id, player_id, team, is_ghost, elo_before, elo_after, delta, result, mvp, contribution)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const p of players) {
        ins.run(id, p.playerId, p.team, p.isGhost ? 1 : 0, p.eloBefore, p.eloAfter, p.delta, p.result, p.mvp ? 1 : 0, p.contribution);
      }
    })();
  }

  insertRound(r: RoundInsert): void {
    const teams: TeamsJson = {};
    for (const t of r.teamIds) {
      const s = r.scores[t];
      if (s) teams[t] = { ...s, ops: r.ops[t] ?? [] };
    }
    this.db
      .prepare(
        `INSERT OR REPLACE INTO rounds (match_id, round_no, photo_id, photo_title, mirrored, reveal_url, attribution_json,
          score_a, score_b, source_a, source_b, reason_a, reason_b, winner, estimated, draw_ms, ops_a, ops_b, teams_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        r.matchId,
        r.round,
        r.photoId,
        r.photoTitle,
        r.mirrored ? 1 : 0,
        r.revealUrl,
        JSON.stringify(r.attribution),
        r.scores.A?.score ?? 0,
        r.scores.B?.score ?? 0,
        r.scores.A?.source ?? 'blank',
        r.scores.B?.source ?? 'blank',
        r.scores.A?.reason ?? '',
        r.scores.B?.reason ?? '',
        r.winner,
        r.estimated ? 1 : 0,
        r.drawMs,
        JSON.stringify(r.ops.A ?? []),
        JSON.stringify(r.ops.B ?? []),
        JSON.stringify(teams),
        Date.now(),
      );
  }

  roundExists(matchId: string, round: number): boolean {
    return !!this.db.prepare('SELECT 1 FROM rounds WHERE match_id = ? AND round_no = ?').get(matchId, round);
  }

  roundReveal(matchId: string, round: number): { revealUrl: string | null } | undefined {
    const row = this.db.prepare('SELECT reveal_url FROM rounds WHERE match_id = ? AND round_no = ?').get(matchId, round) as
      | { reveal_url: string | null }
      | undefined;
    return row ? { revealUrl: row.reveal_url } : undefined;
  }

  replay(matchId: string, round: number): ReplayData | undefined {
    const row = this.db.prepare('SELECT draw_ms, score_a, score_b, ops_a, ops_b, teams_json FROM rounds WHERE match_id = ? AND round_no = ?').get(matchId, round) as
      | Pick<RoundRow, 'draw_ms' | 'score_a' | 'score_b' | 'ops_a' | 'ops_b' | 'teams_json'>
      | undefined;
    if (!row) return undefined;
    const teams = roundTeams(row);
    return { drawMs: row.draw_ms, teamIds: teams.map(([t]) => t), ops: Object.fromEntries(teams.map(([t, v]) => [t, v.ops()])) };
  }

  roundSummaries(matchId: string): RoundSummary[] {
    const rows = this.db.prepare('SELECT * FROM rounds WHERE match_id = ? ORDER BY round_no').all(matchId) as RoundRow[];
    return rows.map((r) => {
      const teams = roundTeams(r);
      return {
        round: r.round_no,
        photoTitle: r.photo_title,
        referenceUrl: r.reveal_url ?? roundImageUrl(matchId, r.round_no, 'ref'),
        mirrored: r.mirrored === 1,
        images: Object.fromEntries(teams.map(([t]) => [t, roundImageUrl(matchId, r.round_no, t)])),
        scores: Object.fromEntries(teams.map(([t, v]) => [t, v.score])),
        winner: r.winner as TeamId | 'draw',
        estimated: r.estimated === 1,
      };
    });
  }

  history(playerId: string, limit = 20): MatchHistoryItem[] {
    const rows = this.db
      .prepare(
        `SELECT m.id, m.ended_at, m.bucket, m.mode, m.ranked, m.ghost, m.score_a, m.score_b, m.scores_json, mp.team, mp.result, mp.delta,
           (SELECT MAX(round_no) FROM rounds r WHERE r.match_id = m.id) AS last_round
         FROM match_players mp JOIN matches m ON m.id = mp.match_id
         WHERE mp.player_id = ? AND m.ended_at IS NOT NULL
         ORDER BY m.ended_at DESC LIMIT ?`,
      )
      .all(playerId, limit) as Array<{
      id: string;
      ended_at: number;
      bucket: TeamSize;
      mode: GameMode;
      ranked: number;
      ghost: number;
      score_a: number;
      score_b: number;
      scores_json: string | null;
      team: TeamId;
      result: 'win' | 'loss' | 'draw';
      delta: number;
      last_round: number | null;
    }>;
    return rows.map((r) => ({
      matchId: r.id,
      endedAt: r.ended_at,
      bucket: r.bucket,
      mode: r.mode,
      ranked: r.ranked === 1,
      ghost: r.ghost === 1,
      team: r.team,
      result: r.result,
      score: r.scores_json ? (JSON.parse(r.scores_json) as MatchHistoryItem['score']) : { A: r.score_a, B: r.score_b },
      delta: Math.round(r.delta),
      thumbnail: r.last_round ? roundImageUrl(r.id, r.last_round, r.team) : null,
    }));
  }

  bestDrawings(playerId: string, limit = 6): BestDrawing[] {
    const rows = this.db
      .prepare(
        `SELECT r.match_id, r.round_no, r.photo_title, r.reveal_url, mp.team,
           ${SIDE_SCORE} AS score
         FROM rounds r JOIN match_players mp ON mp.match_id = r.match_id
         WHERE mp.player_id = ?
         ORDER BY score DESC LIMIT ?`,
      )
      .all(playerId, limit) as Array<{ match_id: string; round_no: number; photo_title: string; reveal_url: string | null; team: TeamId; score: number }>;
    return rows.map((r) => ({
      matchId: r.match_id,
      round: r.round_no,
      score: Math.round(r.score),
      imageUrl: roundImageUrl(r.match_id, r.round_no, r.team),
      referenceUrl: r.reveal_url ?? roundImageUrl(r.match_id, r.round_no, 'ref'),
      photoTitle: r.photo_title,
    }));
  }

  totals(playerId: string): { matches: number; wins: number; roundsWon: number; avgScore: number } {
    const m = this.db
      .prepare(`SELECT COUNT(*) AS matches, SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS wins FROM match_players WHERE player_id = ?`)
      .get(playerId) as { matches: number; wins: number | null };
    const r = this.db
      .prepare(
        `SELECT SUM(CASE WHEN r.winner = mp.team THEN 1 ELSE 0 END) AS won,
                AVG(${SIDE_SCORE}) AS avg
         FROM rounds r JOIN match_players mp ON mp.match_id = r.match_id WHERE mp.player_id = ?`,
      )
      .get(playerId) as { won: number | null; avg: number | null };
    return { matches: m.matches, wins: m.wins ?? 0, roundsWon: r.won ?? 0, avgScore: Math.round(r.avg ?? 0) };
  }
}
