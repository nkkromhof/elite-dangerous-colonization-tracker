import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { EventEmitter } from 'events';
import { initDb, getDb } from '../../src/db/database.js';
import { ConstructionManager } from '../../src/core/construction-manager.js';

describe('ConstructionManager', () => {
  let bus, manager;

  beforeEach(() => {
    initDb(':memory:');
    bus = new EventEmitter();
    manager = new ConstructionManager(bus);
  });
  afterEach(() => getDb()?.close());

  test('createConstruction persists and returns id', () => {
    const id = manager.createConstruction({ system_name: 'Sol', station_name: 'Site A', station_type: 'SurfaceStation', market_id: 1 });
    expect(typeof id).toBe('string');
    expect(manager.getConstructions()).toHaveLength(1);
  });

  test('createConstruction emits construction:added', () => {
    let added = null;
    bus.on('construction:added', c => { added = c; });
    manager.createConstruction({ system_name: 'Sol', station_name: 'Site A', station_type: 'SurfaceStation', market_id: 1 });
    expect(added).not.toBeNull();
    expect(added.station_name).toBe('Site A');
  });

  test('getOrCreateByMarketId returns same construction on repeated calls', () => {
    const id1 = manager.getOrCreateByMarketId({ market_id: 999, system_name: 'Sol', station_name: 'Site A', station_type: 'SurfaceStation' });
    const id2 = manager.getOrCreateByMarketId({ market_id: 999, system_name: 'Sol', station_name: 'Site A', station_type: 'SurfaceStation' });
    expect(id1).toBe(id2);
  });

  test('upsertCommodity stores slot', () => {
    const cid = manager.createConstruction({ system_name: 'Sol', station_name: 'Site A', station_type: 'SurfaceStation', market_id: 1 });
    manager.upsertCommodity(cid, { name: 'Liquid Oxygen', amount_required: 500 });
    const slots = manager.getCommoditySlots(cid);
    expect(slots).toHaveLength(1);
    expect(slots[0].amount_required).toBe(500);
  });

  test('recordDelivery updates delivered amount and emits event', () => {
    const cid = manager.createConstruction({ system_name: 'Sol', station_name: 'Site A', station_type: 'SurfaceStation', market_id: 1 });
    manager.upsertCommodity(cid, { name: 'Liquid Oxygen', amount_required: 500 });
    let delivered = null;
    bus.on('delivery:recorded', d => { delivered = d; });
    manager.recordDelivery({ construction_id: cid, commodity_name: 'Liquid Oxygen', amount: 100, source: 'ship' });
    const slots = manager.getCommoditySlots(cid);
    expect(slots[0].amount_delivered).toBe(100);
    expect(delivered?.amount).toBe(100);
  });
});
