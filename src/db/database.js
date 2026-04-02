import { Database } from 'bun:sqlite';

/** @type {import('bun:sqlite').Database | null} */
let _db = null;

// Inlined schema for bundling with compiled executables
const SCHEMA_SQL = `PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS constructions (
  id           TEXT PRIMARY KEY,
  system_name  TEXT NOT NULL,
  station_name TEXT NOT NULL,
  station_type TEXT,
  market_id    INTEGER,
  phase        TEXT NOT NULL DEFAULT 'scanning',
  bound        INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS commodity_slots (
  id               TEXT PRIMARY KEY,
  construction_id  TEXT NOT NULL REFERENCES constructions(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  name_internal    TEXT,
  amount_required  INTEGER NOT NULL,
  amount_delivered INTEGER NOT NULL DEFAULT 0,
  updated_at       TEXT NOT NULL,
  UNIQUE(construction_id, name)
);

CREATE TABLE IF NOT EXISTS deliveries (
  id              TEXT PRIMARY KEY,
  construction_id TEXT NOT NULL REFERENCES constructions(id) ON DELETE CASCADE,
  commodity_name  TEXT NOT NULL,
  amount          INTEGER NOT NULL,
  source          TEXT,
  delivered_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cargo_state (
  id         TEXT PRIMARY KEY DEFAULT 'singleton',
  ship_cargo TEXT NOT NULL DEFAULT '[]',
  fc_cargo   TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS journal_state (
  id          TEXT PRIMARY KEY DEFAULT 'singleton',
  file_path   TEXT,
  byte_offset INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL
);`;

/** @returns {import('bun:sqlite').Database} */
export function getDb() {
  return _db;
}

/**
 * Initialise (or re-initialise) the SQLite database.
 * Safe to call multiple times — schema uses IF NOT EXISTS.
 * @param {string} dbPath  ':memory:' or a file path
 * @returns {import('bun:sqlite').Database}
 */
export function initDb(dbPath = ':memory:') {
  if (_db) _db.close();
  _db = new Database(dbPath, { create: true });
  _db.exec(SCHEMA_SQL);
  return _db;
}
