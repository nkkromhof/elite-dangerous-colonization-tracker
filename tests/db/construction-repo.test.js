import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { initDb, getDb } from '../../src/db/database.js';
import {
  createConstruction,
  getConstruction,
  getAllConstructions,
  updateConstructionPhase,
  deleteConstruction,
} from '../../src/db/repositories/construction-repo.js';

const sample = {
  id: 'c1',
  system_name: 'Sol',
  station_name: 'Sol Construction Site',
  station_type: 'SurfaceStation',
  market_id: 12345,
  phase: 'scanning',
};

describe('construction-repo', () => {
  beforeEach(() => initDb(':memory:'));
  afterEach(() => getDb()?.close());

  test('createConstruction inserts and getConstruction retrieves', () => {
    createConstruction(sample);
    const row = getConstruction('c1');
    expect(row.id).toBe('c1');
    expect(row.system_name).toBe('Sol');
    expect(row.phase).toBe('scanning');
  });

  test('getAllConstructions returns all rows', () => {
    createConstruction(sample);
    createConstruction({ ...sample, id: 'c2', station_name: 'Another Site' });
    expect(getAllConstructions()).toHaveLength(2);
  });

  test('updateConstructionPhase changes phase', () => {
    createConstruction(sample);
    updateConstructionPhase('c1', 'collection');
    expect(getConstruction('c1').phase).toBe('collection');
  });

  test('deleteConstruction removes the row', () => {
    createConstruction(sample);
    deleteConstruction('c1');
    expect(getConstruction('c1')).toBeNull();
  });
});
