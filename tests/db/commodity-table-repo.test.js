import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { initDb, getDb } from '../../src/db/database.js';
import {
  upsertCommodity,
  getCommodity,
  getAllCommodities,
  seedCommoditiesFromCategories,
} from '../../src/db/repositories/commodity-repo.js';
import { createConstruction } from '../../src/db/repositories/construction-repo.js';
import { upsertCommoditySlot, getCommoditySlots } from '../../src/db/repositories/slot-repo.js';

describe('commodity-repo (commodities table)', () => {
  beforeEach(() => initDb(':memory:'));
  afterEach(() => getDb()?.close());

  test('upsertCommodity inserts a new row', () => {
    upsertCommodity({ name_internal: '$polymers_Name;', name: 'Polymers', category: 'IndustrialMaterials' });
    const row = getCommodity('$polymers_Name;');
    expect(row).not.toBeNull();
    expect(row.name).toBe('Polymers');
    expect(row.category).toBe('IndustrialMaterials');
  });

  test('upsertCommodity updates an existing row', () => {
    upsertCommodity({ name_internal: '$polymers_Name;', name: 'Polymers', category: 'IndustrialMaterials' });
    upsertCommodity({ name_internal: '$polymers_Name;', name: 'Polymers', category: 'Chemicals' });
    const row = getCommodity('$polymers_Name;');
    expect(row.category).toBe('Chemicals');
  });

  test('getCommodity returns null for unknown commodity', () => {
    expect(getCommodity('$nonexistent_Name;')).toBeNull();
  });

  test('upsertCommodity derives name from name_internal when name not provided', () => {
    upsertCommodity({ name_internal: '$polymers_Name;' });
    const row = getCommodity('$polymers_Name;');
    expect(row.name).toBe('Polymers');
  });

  test('upsertCommodity computes inara_id from name_internal', () => {
    upsertCommodity({ name_internal: '$polymers_Name;', name: 'Polymers' });
    const row = getCommodity('$polymers_Name;');
    expect(row.inara_id).toBe('polymers');
  });

  test('seedCommoditiesFromCategories populates from COMMODITY_CATEGORIES map', () => {
    seedCommoditiesFromCategories();
    const all = getAllCommodities();
    expect(all.length).toBeGreaterThan(0);
    const polymers = getCommodity('$polymers_Name;');
    expect(polymers).not.toBeNull();
    expect(polymers.category).toBe('IndustrialMaterials');
  });

  test('seedCommoditiesFromCategories is idempotent', () => {
    seedCommoditiesFromCategories();
    const count1 = getAllCommodities().length;
    seedCommoditiesFromCategories();
    const count2 = getAllCommodities().length;
    expect(count1).toBe(count2);
  });

  test('seedCommoditiesFromCategories sets name derived from symbol', () => {
    seedCommoditiesFromCategories();
    const steel = getCommodity('$steel_Name;');
    expect(steel).not.toBeNull();
    expect(steel.name).toBe('Steel');
  });

  test('commodity_slots JOIN commodities returns category via commodity_ref', () => {
    seedCommoditiesFromCategories();
    createConstruction({ id: 'c1', system_name: 'Sol', station_name: 'Site A', station_type: 'SurfaceStation', market_id: 1, phase: 'scanning' });
    upsertCommoditySlot({ id: 's1', construction_id: 'c1', name: 'Polymers', name_internal: '$polymers_Name;', commodity_ref: '$polymers_Name;', amount_required: 100 });
    const db = getDb();
    const row = db.query(
      `SELECT cs.name, co.category FROM commodity_slots cs JOIN commodities co ON cs.commodity_ref = co.name_internal WHERE cs.id = ?`
    ).get('s1');
    expect(row).not.toBeNull();
    expect(row.name).toBe('Polymers');
    expect(row.category).toBe('IndustrialMaterials');
  });

  test('commodity_ref is backfilled from name_internal for existing slots', () => {
    seedCommoditiesFromCategories();
    createConstruction({ id: 'c2', system_name: 'Sol', station_name: 'Site B', station_type: 'SurfaceStation', market_id: 2, phase: 'scanning' });
    upsertCommoditySlot({ id: 's2', construction_id: 'c2', name: 'Polymers', name_internal: '$polymers_Name;', amount_required: 100 });
    const slots = getCommoditySlots('c2');
    expect(slots[0].commodity_ref).toBe('$polymers_Name;');
  });
});
