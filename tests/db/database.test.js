import { describe, test, expect, afterEach } from 'bun:test';
import { initDb, getDb } from '../../src/db/database.js';

describe('database', () => {
  afterEach(() => {
    getDb()?.close();
  });

  test('initDb creates all required tables', () => {
    const db = initDb(':memory:');
    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map(r => r.name);

    expect(tables).toContain('constructions');
    expect(tables).toContain('commodity_slots');
    expect(tables).toContain('deliveries');
    expect(tables).toContain('cargo_state');
    expect(tables).toContain('journal_state');
    expect(tables).toContain('commodities');
  });

  test('initDb is idempotent', () => {
    initDb(':memory:');
    expect(() => initDb(':memory:')).not.toThrow();
  });
});
