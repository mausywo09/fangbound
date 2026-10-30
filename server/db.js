// SQLite storage through node:sqlite (no native modules to build). Each player's game
// state is one JSON document; season, rating and games are copied into columns so the
// leaderboard is a plain indexed query.
import { DatabaseSync } from 'node:sqlite';

export function openDb(file = ':memory:') {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY,
      wallet TEXT UNIQUE,
      state TEXT NOT NULL,
      season INTEGER NOT NULL,
      rating INTEGER NOT NULL,
      games INTEGER NOT NULL DEFAULT 0,
      ranked_at INTEGER NOT NULL DEFAULT 0,
      created INTEGER NOT NULL,
      seen INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS players_board ON players (season, rating DESC, ranked_at) WHERE wallet IS NOT NULL;
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      player INTEGER NOT NULL,
      expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS nonces (
      nonce TEXT PRIMARY KEY,
      expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      player INTEGER NOT NULL,
      season INTEGER NOT NULL,
      created INTEGER NOT NULL,
      played INTEGER,
      seed INTEGER NOT NULL,
      ver INTEGER NOT NULL,
      a TEXT,
      b TEXT NOT NULL,
      winner TEXT,
      delta INTEGER,
      opp INTEGER,
      opp_delta INTEGER
    );
    CREATE INDEX IF NOT EXISTS matches_player ON matches (player, played DESC);
    CREATE TABLE IF NOT EXISTS standings (
      season INTEGER NOT NULL,
      rank INTEGER NOT NULL,
      wallet TEXT NOT NULL,
      name TEXT NOT NULL,
      rating INTEGER NOT NULL,
      PRIMARY KEY (season, rank)
    );
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    -- A player's squad, frozen into a link that friends can fight once each.
    CREATE TABLE IF NOT EXISTS challenges (
      id TEXT PRIMARY KEY,
      player INTEGER NOT NULL,
      created INTEGER NOT NULL,
      expires INTEGER NOT NULL,
      team TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS challenges_player ON challenges (player, created DESC);
  `);
  // Columns added after the first schema; older databases gain them here.
  addColumn(db, 'matches', 'opp', 'INTEGER');
  addColumn(db, 'matches', 'opp_delta', 'INTEGER');
  // kind: NULL for ranked, 'duel' for a challenge fight (with its challenge id).
  addColumn(db, 'matches', 'kind', 'TEXT');
  addColumn(db, 'matches', 'challenge', 'TEXT');
  // Each player's invite code (SQLite can't add a UNIQUE column, so a unique index).
  addColumn(db, 'players', 'code', 'TEXT');
  db.exec(`
    CREATE INDEX IF NOT EXISTS matches_opp ON matches (opp, played DESC) WHERE opp IS NOT NULL;
    CREATE INDEX IF NOT EXISTS matches_challenge ON matches (challenge, player) WHERE challenge IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS players_code ON players (code) WHERE code IS NOT NULL;
  `);
  return db;
}

function addColumn(db, table, column, type) {
  const has = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

// Runs fn inside one transaction; any throw rolls everything back.
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
