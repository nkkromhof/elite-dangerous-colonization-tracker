import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { initDb, getDb } from '../../src/db/database.js';
import {
  saveCargoItems,
  loadCargoItems,
} from '../../src/db/repositories/cargo-repo.js';
import { seedCommoditiesFromCategories } from '../../src/db/repositories/commodity-repo.js';
import { createConstruction } from '../../src/db/repositories/construction-repo.js';
import { upsertCommoditySlot, getCommoditySlots } from '../../src/db/repositories/slot-repo.js';

describe('cargo_items', () => {
  beforeEach(() => initDb(':memory:'));
  afterEach(() => getDb()?.close());

  test('saveCargoItems persists ship items', () => {
    saveCargoItems('ship', [{ name: 'Liquid Oxygen', count: 50 }]);
    const { ship } = loadCargoItems();
    expect(ship).toEqual([{ name: 'Liquid Oxygen', count: 50 }]);
  });

  test('saveCargoItems persists fc items', () => {
    saveCargoItems('fc', [{ name: 'Steel', count: 200 }]);
    const { fc } = loadCargoItems();
    expect(fc).toEqual([{ name: 'Steel', count: 200 }]);
  });

  test('saveCargoItems replaces all items for a location', () => {
    saveCargoItems('ship', [{ name: 'Liquid Oxygen', count: 50 }]);
    saveCargoItems('ship', [{ name: 'Steel', count: 100 }]);
    const { ship } = loadCargoItems();
    expect(ship).toEqual([{ name: 'Steel', count: 100 }]);
  });

  test('loadCargoItems returns empty arrays when no rows', () => {
    const { ship, fc } = loadCargoItems();
    expect(ship).toEqual([]);
    expect(fc).toEqual([]);
  });

  test('saveCargoItems and loadCargoItems round-trip multiple items', () => {
    saveCargoItems('ship', [
      { name: 'Liquid Oxygen', count: 50 },
      { name: 'Polymers', count: 30 },
    ]);
    saveCargoItems('fc', [{ name: 'Steel', count: 200 }]);
    const { ship, fc } = loadCargoItems();
    expect(ship).toHaveLength(2);
    expect(fc).toHaveLength(1);
  });

  test('cargo_items can be joined with commodities table via commodity_ref', () => {
    seedCommoditiesFromCategories();
    saveCargoItems('ship', [{ name: 'Polymers', name_internal: '$polymers_Name;', count: 50 }]);
    const db = getDb();
    const rows = db.query(
      `SELECT ci.name, ci.count, co.category FROM cargo_items ci JOIN commodities co ON ci.commodity_ref = co.name_internal WHERE ci.location = 'ship'`
    ).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].category).toBe('IndustrialMaterials');
    expect(rows[0].count).toBe(50);
  });
});

describe('cargo ↔ slots integration', () => {
  beforeEach(() => initDb(':memory:'));
  afterEach(() => getDb()?.close());

  test('query finds cargo I have that a construction needs', () => {
    seedCommoditiesFromCategories();
    createConstruction({ id: 'c1', system_name: 'Sol', station_name: 'Site A', station_type: 'SurfaceStation', market_id: 1, phase: 'scanning' });
    upsertCommoditySlot({ id: 's1', construction_id: 'c1', name: 'Polymers', name_internal: '$polymers_Name;', amount_required: 500 });
    saveCargoItems('ship', [
      { name: 'Polymers', name_internal: '$polymers_Name;', count: 50 },
      { name: 'Steel', name_internal: '$steel_Name;', count: 100 },
    ]);

    const db = getDb();
    const matching = db.query(
      `SELECT ci.name, ci.count, cs.amount_required, cs.amount_delivered
       FROM cargo_items ci
       JOIN commodity_slots cs ON ci.commodity_ref = cs.commodity_ref
       WHERE ci.location = 'ship' AND cs.amount_delivered < cs.amount_required`
    ).all();

    expect(matching).toHaveLength(1);
    expect(matching[0].name).toBe('Polymers');
    expect(matching[0].count).toBe(50);
    expect(matching[0].amount_required).toBe(500);
  });
});
