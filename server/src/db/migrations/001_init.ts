export const up = /* sql */ `
CREATE TABLE players (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  username         TEXT UNIQUE COLLATE NOCASE,
  password_hash    TEXT,
  guest_token_hash TEXT UNIQUE,
  is_guest         INTEGER NOT NULL DEFAULT 1,
  xp               INTEGER NOT NULL DEFAULT 0,
  win_streak       INTEGER NOT NULL DEFAULT 0,
  best_win_streak  INTEGER NOT NULL DEFAULT 0,
  daily_streak     INTEGER NOT NULL DEFAULT 0,
  last_daily_date  TEXT,
  queue_ban_until  INTEGER,
  created_at       INTEGER NOT NULL,
  last_seen_at     INTEGER NOT NULL
);

CREATE TABLE ratings (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  bucket    TEXT NOT NULL CHECK (bucket IN ('1v1','2v2','3v3')),
  elo       REAL NOT NULL DEFAULT 1000,
  games     INTEGER NOT NULL DEFAULT 0,
  wins      INTEGER NOT NULL DEFAULT 0,
  losses    INTEGER NOT NULL DEFAULT 0,
  draws     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, bucket)
);
CREATE INDEX idx_ratings_bucket_elo ON ratings(bucket, elo DESC);

CREATE TABLE matches (
  id          TEXT PRIMARY KEY,
  bucket      TEXT NOT NULL,
  mode        TEXT NOT NULL,
  ranked      INTEGER NOT NULL,
  ghost       INTEGER NOT NULL DEFAULT 0,
  custom      INTEGER NOT NULL DEFAULT 0,
  winner      TEXT,
  score_a     INTEGER NOT NULL DEFAULT 0,
  score_b     INTEGER NOT NULL DEFAULT 0,
  forfeit     INTEGER NOT NULL DEFAULT 0,
  ai_degraded INTEGER NOT NULL DEFAULT 0,
  rules_json  TEXT NOT NULL,
  started_at  INTEGER NOT NULL,
  ended_at    INTEGER
);
CREATE INDEX idx_matches_ended ON matches(ended_at);

CREATE TABLE match_players (
  match_id     TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id    TEXT NOT NULL,
  team         TEXT NOT NULL,
  is_ghost     INTEGER NOT NULL DEFAULT 0,
  elo_before   REAL,
  elo_after    REAL,
  delta        REAL NOT NULL DEFAULT 0,
  result       TEXT,
  mvp          INTEGER NOT NULL DEFAULT 0,
  contribution REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (match_id, player_id)
);
CREATE INDEX idx_match_players_player ON match_players(player_id);

CREATE TABLE rounds (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id     TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  round_no     INTEGER NOT NULL,
  photo_id     TEXT NOT NULL,
  photo_title  TEXT NOT NULL,
  mirrored     INTEGER NOT NULL DEFAULT 0,
  reveal_url   TEXT,
  attribution_json TEXT NOT NULL,
  score_a      REAL NOT NULL,
  score_b      REAL NOT NULL,
  source_a     TEXT NOT NULL,
  source_b     TEXT NOT NULL,
  reason_a     TEXT NOT NULL,
  reason_b     TEXT NOT NULL,
  winner       TEXT NOT NULL,
  estimated    INTEGER NOT NULL DEFAULT 0,
  draw_ms      INTEGER NOT NULL,
  ops_a        TEXT NOT NULL,
  ops_b        TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  UNIQUE (match_id, round_no)
);

CREATE TABLE ghosts (
  id          TEXT PRIMARY KEY,
  player_id   TEXT NOT NULL,
  player_name TEXT NOT NULL,
  elo         REAL NOT NULL,
  photo_id    TEXT NOT NULL,
  draw_ms     INTEGER NOT NULL,
  ops_json    TEXT NOT NULL,
  score       REAL NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_ghosts_elo ON ghosts(elo);

CREATE TABLE photos (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  category    TEXT NOT NULL,
  difficulty  TEXT NOT NULL,
  provider    TEXT NOT NULL,
  author      TEXT,
  source_url  TEXT,
  license     TEXT NOT NULL,
  times_used  INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE player_photo_history (
  player_id TEXT NOT NULL,
  photo_id  TEXT NOT NULL,
  seen_at   INTEGER NOT NULL
);
CREATE INDEX idx_pph_player ON player_photo_history(player_id, seen_at DESC);

CREATE TABLE reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id TEXT NOT NULL,
  reported_id TEXT NOT NULL,
  match_id    TEXT,
  reason      TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE rage_quits (
  player_id TEXT NOT NULL,
  match_id  TEXT NOT NULL,
  at        INTEGER NOT NULL
);
CREATE INDEX idx_rage_quits_player ON rage_quits(player_id, at);

CREATE TABLE scoring_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id   TEXT,
  round_no   INTEGER,
  team       TEXT,
  source     TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  score      REAL,
  error      TEXT,
  created_at INTEGER NOT NULL
);
`;
