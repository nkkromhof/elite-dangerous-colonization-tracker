import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { initDb, getDb } from '../../src/db/database.js';
import {
  createConstruction,
  getConstruction,
  getAllConstructions,
  getArchivedConstructions,
  updateConstructionPhase,
  archiveConstruction,
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

  test('getAllConstructions returns only non-archived rows', () => {
    createConstruction(sample);
    createConstruction({ ...sample, id: 'c2', station_name: 'Another Site' });
    expect(getAllConstructions()).toHaveLength(2);
    archiveConstruction('c1');
    expect(getAllConstructions()).toHaveLength(1);
    expect(getAllConstructions()[0].id).toBe('c2');
  });

  test('archiveConstruction sets is_archived and retains data', () => {
    createConstruction(sample);
    archiveConstruction('c1');
    const row = getConstruction('c1');
    expect(row.is_archived).toBe(1);
    expect(row.station_name).toBe('Sol Construction Site');
  });

  test('getArchivedConstructions returns only archived rows', () => {
    createConstruction(sample);
    createConstruction({ ...sample, id: 'c2', station_name: 'Another Site' });
    archiveConstruction('c1');
    const archived = getArchivedConstructions();
    expect(archived).toHaveLength(1);
    expect(archived[0].id).toBe('c1');
  });

  test('updateConstructionPhase changes phase', () => {
    createConstruction(sample);
    updateConstructionPhase('c1', 'collection');
    expect(getConstruction('c1').phase).toBe('collection');
  });


});
