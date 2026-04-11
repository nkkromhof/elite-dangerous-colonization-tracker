import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { initDb, getDb } from '../../src/db/database.js';
import { createConstruction } from '../../src/db/repositories/construction-repo.js';
import { upsertCommoditySlot, getCommoditySlots, deleteCommoditySlot } from '../../src/db/repositories/slot-repo.js';

const now = () => new Date().toISOString();

describe('slot-repo', () => {
  beforeEach(() => initDb(':memory:'));
  afterEach(() => getDb()?.close());

  test('deleteCommoditySlot removes the named slot from a construction', () => {
    createConstruction({ id: 'c1', system_name: null, station_name: 'Test', station_type: null, market_id: null, phase: 'collection', type: 'manual' });
    upsertCommoditySlot({ id: 's1', construction_id: 'c1', name: 'Steel', name_internal: null, amount_required: 100 });
    upsertCommoditySlot({ id: 's2', construction_id: 'c1', name: 'Aluminium', name_internal: null, amount_required: 200 });
    expect(getCommoditySlots('c1')).toHaveLength(2);
    deleteCommoditySlot('c1', 'Steel');
    const remaining = getCommoditySlots('c1');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe('Aluminium');
  });

  test('deleteCommoditySlot is a no-op for a nonexistent slot', () => {
    createConstruction({ id: 'c1', system_name: null, station_name: 'Test', station_type: null, market_id: null, phase: 'collection', type: 'manual' });
    expect(() => deleteCommoditySlot('c1', 'Nonexistent')).not.toThrow();
  });

  test('deleteCommoditySlot does not remove slots from other constructions with the same commodity name', () => {
    createConstruction({ id: 'c1', system_name: null, station_name: 'Site A', station_type: null, market_id: null, phase: 'collection', type: 'manual' });
    createConstruction({ id: 'c2', system_name: null, station_name: 'Site B', station_type: null, market_id: null, phase: 'collection', type: 'manual' });
    upsertCommoditySlot({ id: 's1', construction_id: 'c1', name: 'Steel', name_internal: null, amount_required: 100 });
    upsertCommoditySlot({ id: 's2', construction_id: 'c2', name: 'Steel', name_internal: null, amount_required: 200 });
    deleteCommoditySlot('c1', 'Steel');
    expect(getCommoditySlots('c1')).toHaveLength(0);
    expect(getCommoditySlots('c2')).toHaveLength(1);
  });
});
