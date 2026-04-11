import { describe, test, expect, afterEach } from 'bun:test';
import { initDb, getDb } from '../../src/db/database.js';

describe('database', () => {
  afterEach(() => {
    getDb()?.close();
  });

  test('initDb creates all required tables for a fresh install', () => {
    const db = initDb(':memory:');
    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map(r => r.name);

    // Core domain tables
    expect(tables).toContain('constructions');
    expect(tables).toContain('commodity_slots');
    expect(tables).toContain('commodities');
    expect(tables).toContain('cargo_items');
    expect(tables).toContain('deliveries');
    expect(tables).toContain('journal_state');
    expect(tables).toContain('slot_lookup_cache');

    // Market cache tables
    expect(tables).toContain('system_coordinates');
    expect(tables).toContain('station_market_cache');
    expect(tables).toContain('market_inventory_index');
    expect(tables).toContain('commodity_station_results');

    // Version tracking
    expect(tables).toContain('_schema_version');

    // Dead tables should NOT exist in fresh installs
    expect(tables).not.toContain('cargo_state');
  });

  test('initDb is idempotent', () => {
    initDb(':memory:');
    expect(() => initDb(':memory:')).not.toThrow();
  });

  test('fresh install sets schema version to current', () => {
    const db = initDb(':memory:');
    const row = db.query('SELECT version FROM _schema_version').get();
    expect(row.version).toBeGreaterThan(0);
  });

  test('constructions table has type column after fresh install', () => {
    const db = initDb(':memory:');
    const cols = db.query('PRAGMA table_info(constructions)').all().map(r => r.name);
    expect(cols).toContain('type');
  });

  test('constructions.system_name accepts NULL after fresh install', () => {
    const db = initDb(':memory:');
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO constructions (id, system_name, station_name, phase, type, created_at, updated_at)
       VALUES ('t1', NULL, 'Test Station', 'collection', 'manual', ?, ?)`,
      [now, now]
    );
    const row = db.query("SELECT * FROM constructions WHERE id = 't1'").get();
    expect(row.system_name).toBeNull();
    expect(row.type).toBe('manual');
  });
});
