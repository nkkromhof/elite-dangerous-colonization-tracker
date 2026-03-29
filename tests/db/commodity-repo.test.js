import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { initDb, getDb } from '../../src/db/database.js';
import { createConstruction } from '../../src/db/repositories/construction-repo.js';
import {
  upsertCommoditySlot,
  getCommoditySlots,
  incrementDelivered,
  recordDelivery,
  getDeliveries,
  saveCargoState,
  loadCargoState,
} from '../../src/db/repositories/commodity-repo.js';

const construction = {
  id: 'c1', system_name: 'Sol', station_name: 'Site A',
  station_type: 'SurfaceStation', market_id: 1, phase: 'scanning',
};

describe('commodity-repo', () => {
  beforeEach(() => {
    initDb(':memory:');
    createConstruction(construction);
  });
  afterEach(() => getDb()?.close());

  test('upsertCommoditySlot inserts new slot', () => {
    upsertCommoditySlot({ id: 's1', construction_id: 'c1', name: 'Liquid Oxygen', amount_required: 100 });
    const slots = getCommoditySlots('c1');
    expect(slots).toHaveLength(1);
    expect(slots[0].name).toBe('Liquid Oxygen');
    expect(slots[0].amount_delivered).toBe(0);
  });

  test('upsertCommoditySlot updates existing slot', () => {
    upsertCommoditySlot({ id: 's1', construction_id: 'c1', name: 'Liquid Oxygen', amount_required: 100 });
    upsertCommoditySlot({ id: 's2', construction_id: 'c1', name: 'Liquid Oxygen', amount_required: 200 });
    const slots = getCommoditySlots('c1');
    expect(slots).toHaveLength(1);
    expect(slots[0].amount_required).toBe(200);
  });

  test('incrementDelivered adds to amount_delivered', () => {
    upsertCommoditySlot({ id: 's1', construction_id: 'c1', name: 'Liquid Oxygen', amount_required: 100 });
    incrementDelivered('c1', 'Liquid Oxygen', 30);
    const slots = getCommoditySlots('c1');
    expect(slots[0].amount_delivered).toBe(30);
  });

  test('recordDelivery persists audit record', () => {
    recordDelivery({ id: 'd1', construction_id: 'c1', commodity_name: 'Liquid Oxygen', amount: 30, source: 'ship' });
    expect(getDeliveries('c1')).toHaveLength(1);
  });

  test('saveCargoState and loadCargoState round-trip', () => {
    const ship = [{ name: 'Liquid Oxygen', count: 50 }];
    const fc   = [{ name: 'Steel', count: 200 }];
    saveCargoState(ship, fc);
    const loaded = loadCargoState();
    expect(loaded.ship).toEqual(ship);
    expect(loaded.fc).toEqual(fc);
  });

  test('loadCargoState returns empty arrays when nothing persisted', () => {
    const { ship, fc } = loadCargoState();
    expect(ship).toEqual([]);
    expect(fc).toEqual([]);
  });
});
