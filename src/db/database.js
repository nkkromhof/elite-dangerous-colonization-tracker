import { Database } from 'bun:sqlite';
import { COMMODITY_DISPLAY_NAMES } from '../../public/inara-commodity-ids.js';

/** @type {import('bun:sqlite').Database | null} */
let _db = null;

// ── Current Schema ──────────────────────────────────────────────────────────
// This is the complete schema for a fresh install. When creating a new database,
// this runs directly — no migrations needed. Existing databases are upgraded
// incrementally via the migrations array below.
//
// Tables:
//   constructions      — colonization construction sites tracked by the player
//   commodity_slots    — per-construction commodity requirements and delivery progress
//   commodities        — canonical commodity reference data (name, category, inara ID)
//   cargo_items        — player's ship and fleet carrier cargo (one row per item)
//   deliveries         — log of recorded deliveries to construction sites
//   journal_state      — journal file read position for resume on restart
//   slot_lookup_cache  — cached Inara station lookup results per commodity slot
//   system_coordinates — cached star system positions for distance calculations
//   station_market_cache — cached market data from stations the player has visited
//   market_inventory_index — index of which commodities are available at cached markets
//   commodity_station_results — cached Inara search results for commodity sourcing

const CURRENT_SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS _schema_version (
  version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS constructions (
  id           TEXT PRIMARY KEY,
  system_name  TEXT,
  station_name TEXT NOT NULL,
  station_type TEXT,
  market_id    INTEGER,
  phase        TEXT NOT NULL DEFAULT 'scanning',
  bound        INTEGER NOT NULL DEFAULT 0,
  is_archived  INTEGER NOT NULL DEFAULT 0,
  type         TEXT NOT NULL DEFAULT 'auto',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS commodities (
  name_internal TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  category      TEXT,
  inara_id      TEXT,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS commodity_slots (
  id               TEXT PRIMARY KEY,
  construction_id  TEXT NOT NULL REFERENCES constructions(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  name_internal    TEXT,
  commodity_ref    TEXT REFERENCES commodities(name_internal),
  amount_required  INTEGER NOT NULL,
  amount_delivered INTEGER NOT NULL DEFAULT 0,
  updated_at       TEXT NOT NULL,
  UNIQUE(construction_id, name)
);

CREATE TABLE IF NOT EXISTS slot_lookup_cache (
  slot_id    TEXT PRIMARY KEY REFERENCES commodity_slots(id) ON DELETE CASCADE,
  station    TEXT,
  system     TEXT,
  supply     INTEGER,
  distance_ly REAL,
  queried_at TEXT
);

CREATE TABLE IF NOT EXISTS deliveries (
  id              TEXT PRIMARY KEY,
  construction_id TEXT NOT NULL REFERENCES constructions(id) ON DELETE CASCADE,
  commodity_name  TEXT NOT NULL,
  amount          INTEGER NOT NULL,
  source          TEXT,
  delivered_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cargo_items (
  id            TEXT PRIMARY KEY,
  location      TEXT NOT NULL,
  commodity_ref TEXT REFERENCES commodities(name_internal),
  name          TEXT NOT NULL,
  count         INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cargo_location ON cargo_items(location);

CREATE TABLE IF NOT EXISTS journal_state (
  id          TEXT PRIMARY KEY DEFAULT 'singleton',
  file_path   TEXT,
  byte_offset INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS system_coordinates (
  system_name TEXT PRIMARY KEY,
  x           REAL NOT NULL,
  y           REAL NOT NULL,
  z           REAL NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS station_market_cache (
  market_id    INTEGER PRIMARY KEY,
  station_name TEXT NOT NULL,
  station_type TEXT,
  system_name  TEXT NOT NULL,
  x            REAL,
  y            REAL,
  z            REAL,
  inventory    TEXT NOT NULL,
  recorded_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS market_inventory_index (
  market_id     INTEGER NOT NULL REFERENCES station_market_cache(market_id) ON DELETE CASCADE,
  name_internal TEXT NOT NULL,
  stock         INTEGER NOT NULL,
  PRIMARY KEY (market_id, name_internal)
);
CREATE INDEX IF NOT EXISTS idx_inventory_commodity ON market_inventory_index (name_internal, stock);

CREATE TABLE IF NOT EXISTS commodity_station_results (
  name_internal     TEXT NOT NULL,
  reference_system  TEXT NOT NULL,
  station           TEXT NOT NULL,
  system            TEXT NOT NULL,
  distance_ly       REAL NOT NULL,
  supply            INTEGER,
  queried_at        TEXT NOT NULL,
  PRIMARY KEY (name_internal, reference_system, station)
);
CREATE INDEX IF NOT EXISTS idx_csr_lookup ON commodity_station_results (name_internal, reference_system, distance_ly);
`;

const CURRENT_VERSION = 13;

// ── Legacy Migrations ───────────────────────────────────────────────────────
// These run only when upgrading an existing database from a previous version.
// Each migration receives the db handle and runs its ALTER/CREATE statements.
// For fresh installs CURRENT_SCHEMA_SQL creates everything directly.
//
// IMPORTANT: Never modify an existing migration. Always append a new one
// and bump CURRENT_VERSION.

const MIGRATIONS = [
  // v0 → v1: Original schema (constructions, commodity_slots, deliveries, cargo_state, journal_state)
  function v1_originalSchema(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS constructions (
        id TEXT PRIMARY KEY, system_name TEXT NOT NULL, station_name TEXT NOT NULL,
        station_type TEXT, market_id INTEGER, phase TEXT NOT NULL DEFAULT 'scanning',
        bound INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS commodity_slots (
        id TEXT PRIMARY KEY, construction_id TEXT NOT NULL REFERENCES constructions(id) ON DELETE CASCADE,
        name TEXT NOT NULL, name_internal TEXT, amount_required INTEGER NOT NULL,
        amount_delivered INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL,
        UNIQUE(construction_id, name)
      );
      CREATE TABLE IF NOT EXISTS deliveries (
        id TEXT PRIMARY KEY, construction_id TEXT NOT NULL REFERENCES constructions(id) ON DELETE CASCADE,
        commodity_name TEXT NOT NULL, amount INTEGER NOT NULL, source TEXT, delivered_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS cargo_state (
        id TEXT PRIMARY KEY DEFAULT 'singleton', ship_cargo TEXT NOT NULL DEFAULT '[]',
        fc_cargo TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS journal_state (
        id TEXT PRIMARY KEY DEFAULT 'singleton', file_path TEXT,
        byte_offset INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
      );
    `);
  },

  // v1 → v2: Add station lookup columns to commodity_slots
  function v2_nearestStation(db) {
    const cols = db.query('PRAGMA table_info(commodity_slots)').all().map(r => r.name);
    for (const [col, type] of [['nearest_station','TEXT'],['nearest_system','TEXT'],['nearest_supply','INTEGER'],['nearest_queried_at','TEXT']]) {
      if (!cols.includes(col)) db.run(`ALTER TABLE commodity_slots ADD COLUMN ${col} ${type}`);
    }
  },

  // v2 → v3: Add archive flag to constructions
  function v3_archived(db) {
    const cols = db.query('PRAGMA table_info(constructions)').all().map(r => r.name);
    if (!cols.includes('is_archived')) {
      db.run(`ALTER TABLE constructions ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0`);
    }
  },

  // v3 → v4: Market cache tables
  function v4_marketCache(db) {
    db.run(`CREATE TABLE IF NOT EXISTS system_coordinates (
      system_name TEXT PRIMARY KEY, x REAL NOT NULL, y REAL NOT NULL, z REAL NOT NULL, updated_at TEXT NOT NULL
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS station_market_cache (
      market_id INTEGER PRIMARY KEY, station_name TEXT NOT NULL, station_type TEXT,
      system_name TEXT NOT NULL, x REAL, y REAL, z REAL, inventory TEXT NOT NULL, recorded_at TEXT NOT NULL
    )`);
  },

  // v4 → v5: Market inventory index
  function v5_marketInventoryIndex(db) {
    db.run(`CREATE TABLE IF NOT EXISTS market_inventory_index (
      market_id INTEGER NOT NULL REFERENCES station_market_cache(market_id) ON DELETE CASCADE,
      name_internal TEXT NOT NULL, stock INTEGER NOT NULL, PRIMARY KEY (market_id, name_internal)
    )`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_inventory_commodity ON market_inventory_index (name_internal, stock)`);
  },

  // v5 → v6: Commodity station results cache
  function v6_commodityStationResults(db) {
    db.run(`CREATE TABLE IF NOT EXISTS commodity_station_results (
      name_internal TEXT NOT NULL, reference_system TEXT NOT NULL, station TEXT NOT NULL,
      system TEXT NOT NULL, distance_ly REAL NOT NULL, supply INTEGER, queried_at TEXT NOT NULL,
      PRIMARY KEY (name_internal, reference_system, station)
    )`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_csr_lookup ON commodity_station_results (name_internal, reference_system, distance_ly)`);
  },

  // v6 → v7: Commodities reference table
  function v7_commoditiesTable(db) {
    db.run(`CREATE TABLE IF NOT EXISTS commodities (
      name_internal TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT, inara_id TEXT, updated_at TEXT NOT NULL
    )`);
  },

  // v7 → v8: Add commodity_ref FK to commodity_slots
  function v8_commodityRef(db) {
    const cols = db.query('PRAGMA table_info(commodity_slots)').all().map(r => r.name);
    if (!cols.includes('commodity_ref')) {
      // Seed commodities from existing slots so the FK is valid
      const ts = new Date().toISOString();
      const rows = db.query(`SELECT DISTINCT name_internal, name FROM commodity_slots WHERE name_internal IS NOT NULL`).all();
      const ins = db.prepare(`INSERT OR IGNORE INTO commodities (name_internal, name, updated_at) VALUES (?, ?, ?)`);
      for (const row of rows) {
        const name = row.name || row.name_internal.replace(/^\$/, '').replace(/_[Nn]ame;$/, '').replace(/^[a-z]/, c => c.toUpperCase());
        ins.run(row.name_internal, name, ts);
      }
      db.run(`ALTER TABLE commodity_slots ADD COLUMN commodity_ref TEXT REFERENCES commodities(name_internal)`);
      db.run(`UPDATE commodity_slots SET commodity_ref = name_internal WHERE commodity_ref IS NULL AND name_internal IS NOT NULL`);
    }
  },

  // v8 → v9: Relational cargo_items table (replaces JSON blob in cargo_state)
  function v9_cargoItems(db) {
    db.run(`CREATE TABLE IF NOT EXISTS cargo_items (
      id TEXT PRIMARY KEY, location TEXT NOT NULL, commodity_ref TEXT REFERENCES commodities(name_internal),
      name TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
    )`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_cargo_location ON cargo_items(location)`);
    // Migrate existing data from cargo_state JSON blob
    const row = db.query("SELECT ship_cargo, fc_cargo FROM cargo_state WHERE id = 'singleton'").get();
    if (row) {
      try {
        const ship = JSON.parse(row.ship_cargo);
        const fc = JSON.parse(row.fc_cargo);
        const ts = new Date().toISOString();
        const ins = db.prepare(`INSERT OR IGNORE INTO cargo_items (id, location, commodity_ref, name, count, updated_at) VALUES (?, ?, ?, ?, ?, ?)`);
        for (const item of ship) ins.run(globalThis.crypto.randomUUID(), 'ship', null, item.name, item.count, ts);
        for (const item of fc) ins.run(globalThis.crypto.randomUUID(), 'fc', null, item.name, item.count, ts);
      } catch { /* cargo_state may be empty or corrupt */ }
    }
  },

  // v9 → v10: Extract station lookup data to slot_lookup_cache table
  function v10_slotLookupCache(db) {
    db.run(`CREATE TABLE IF NOT EXISTS slot_lookup_cache (
      slot_id TEXT PRIMARY KEY REFERENCES commodity_slots(id) ON DELETE CASCADE,
      station TEXT, system TEXT, supply INTEGER, queried_at TEXT
    )`);
    const cols = db.query('PRAGMA table_info(commodity_slots)').all().map(r => r.name);
    if (cols.includes('nearest_station')) {
      const rows = db.query(
        `SELECT id, nearest_station, nearest_system, nearest_supply, nearest_queried_at
         FROM commodity_slots WHERE nearest_station IS NOT NULL OR nearest_queried_at IS NOT NULL`
      ).all();
      if (rows.length > 0) {
        const ins = db.prepare(`INSERT OR IGNORE INTO slot_lookup_cache (slot_id, station, system, supply, queried_at) VALUES (?, ?, ?, ?, ?)`);
        for (const r of rows) ins.run(r.id, r.nearest_station, r.nearest_system, r.nearest_supply, r.nearest_queried_at);
      }
    }
  },

  // v10 → v11: Add type column; make system_name nullable (requires table recreation in SQLite)
  function v11_manualConstructions(db) {
    db.run('PRAGMA foreign_keys = OFF');
    db.run(`
      CREATE TABLE constructions_new (
        id           TEXT PRIMARY KEY,
        system_name  TEXT,
        station_name TEXT NOT NULL,
        station_type TEXT,
        market_id    INTEGER,
        phase        TEXT NOT NULL DEFAULT 'scanning',
        bound        INTEGER NOT NULL DEFAULT 0,
        is_archived  INTEGER NOT NULL DEFAULT 0,
        type         TEXT NOT NULL DEFAULT 'auto',
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      )
    `);
    db.run(`
      INSERT INTO constructions_new
      SELECT id, system_name, station_name, station_type, market_id,
             phase, bound, is_archived, 'auto', created_at, updated_at
      FROM constructions
    `);
    db.run('DROP TABLE constructions');
    db.run('ALTER TABLE constructions_new RENAME TO constructions');
    db.run('PRAGMA foreign_keys = ON');
  },

  // v11 → v12: Repair commodity display names seeded with raw internal-name fallback
  function v12_fixCommodityNames(db) {
    const stmt = db.prepare(`UPDATE commodities SET name = ?, updated_at = ? WHERE name_internal = ?`);
    const ts = new Date().toISOString();
    for (const [key, name] of Object.entries(COMMODITY_DISPLAY_NAMES)) {
      stmt.run(name, ts, `$${key}_Name;`);
    }
  },

  // v12 → v13: Add distance_ly to slot_lookup_cache
  function v13_addDistanceLy(db) {
    db.run(`ALTER TABLE slot_lookup_cache ADD COLUMN distance_ly REAL`);
  },
];

// ── Schema Version Management ───────────────────────────────────────────────

function _getVersion(db) {
  try {
    const row = db.query('SELECT version FROM _schema_version LIMIT 1').get();
    return row?.version ?? 0;
  } catch {
    return 0; // Table doesn't exist yet → version 0
  }
}

function _setVersion(db, version) {
  db.run('DELETE FROM _schema_version');
  db.run('INSERT INTO _schema_version (version) VALUES (?)', [version]);
}

/** @returns {import('bun:sqlite').Database} */
export function getDb() {
  return _db;
}

/**
 * Initialise (or re-initialise) the SQLite database.
 * - Fresh databases get CURRENT_SCHEMA_SQL directly (clean, no dead tables).
 * - Existing databases run incremental MIGRATIONS from their current version.
 * @param {string} dbPath  ':memory:' or a file path
 * @returns {import('bun:sqlite').Database}
 */
export function initDb(dbPath = ':memory:') {
  if (_db) _db.close();
  _db = new Database(dbPath, { create: true });
  _db.run('PRAGMA journal_mode = WAL');
  _db.run('PRAGMA foreign_keys = ON');

  const version = _getVersion(_db);

  if (version === 0) {
    // Check if this is a pre-versioned database (has tables but no _schema_version)
    const tables = _db.query("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
    const hasLegacyTables = tables.includes('constructions');

    if (hasLegacyTables) {
      // Existing database from before versioning — determine starting version
      // by checking which features exist, then run remaining migrations
      _db.run('CREATE TABLE IF NOT EXISTS _schema_version (version INTEGER NOT NULL)');
      const startVersion = _detectLegacyVersion(_db);
      _setVersion(_db, startVersion);
      _runMigrations(_db, startVersion);
    } else {
      // Brand new database — create everything from scratch
      _db.exec(CURRENT_SCHEMA_SQL);
      _setVersion(_db, CURRENT_VERSION);
    }
  } else {
    // Versioned database — run any pending migrations
    _runMigrations(_db, version);
  }

  return _db;
}

/**
 * Detect which migration version a pre-versioned database corresponds to
 * by checking for features added by each migration.
 */
function _detectLegacyVersion(db) {
  const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  const slotCols = db.query('PRAGMA table_info(commodity_slots)').all().map(r => r.name);
  const constrCols = db.query('PRAGMA table_info(constructions)').all().map(r => r.name);

  // Work backwards from latest to find the highest completed migration
  if (constrCols.includes('type')) return 11;
  if (tables.includes('slot_lookup_cache')) return 10;
  if (tables.includes('cargo_items')) return 9;
  if (slotCols.includes('commodity_ref')) return 8;
  if (tables.includes('commodities')) return 7;
  if (tables.includes('commodity_station_results')) return 6;
  if (tables.includes('market_inventory_index')) return 5;
  if (tables.includes('station_market_cache')) return 4;
  if (constrCols.includes('is_archived')) return 3;
  if (slotCols.includes('nearest_station')) return 2;
  return 1; // Has base tables only
}

function _runMigrations(db, fromVersion) {
  if (fromVersion >= CURRENT_VERSION) return;
  for (let v = fromVersion; v < CURRENT_VERSION; v++) {
    MIGRATIONS[v](db);
  }
  _setVersion(db, CURRENT_VERSION);
}
