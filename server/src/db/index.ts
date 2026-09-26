import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';
import { log } from '../util/logger';
import { migrations } from './migrations';

export type DB = Database.Database;

let instance: DB | null = null;

export function openDb(file = config.databasePath): DB {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}

export function migrate(db: DB): number {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL
  )`);
  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>).map((r) => r.version),
  );
  let count = 0;
  for (const m of migrations) {
    if (applied.has(m.version)) continue;
    db.transaction(() => {
      db.exec(m.up);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(m.version, m.name, Date.now());
    })();
    log.info('migration applied', { version: m.version, name: m.name });
    count++;
  }
  return count;
}

export function getDb(): DB {
  if (!instance) {
    instance = openDb();
    migrate(instance);
  }
  return instance;
}
