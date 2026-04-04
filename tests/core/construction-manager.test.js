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

  test('archiveConstruction removes from getConstructions and emits event', () => {
    const cid = manager.createConstruction({ system_name: 'Sol', station_name: 'Site A', station_type: 'SurfaceStation', market_id: 1 });
    let archived = null;
    bus.on('construction:archived', d => { archived = d; });
    manager.archiveConstruction(cid);
    expect(manager.getConstructions()).toHaveLength(0);
    expect(archived).not.toBeNull();
    expect(archived.id).toBe(cid);
  });

  test('archiveConstruction removes market_id from index so new construction can be created', () => {
    const cid = manager.createConstruction({ system_name: 'Sol', station_name: 'Site A', station_type: 'SurfaceStation', market_id: 999 });
    manager.archiveConstruction(cid);
    const newId = manager.getOrCreateByMarketId({ market_id: 999, system_name: 'Sol', station_name: 'Site A', station_type: 'SurfaceStation' });
    expect(newId).not.toBe(cid);
    expect(manager.getConstructions()).toHaveLength(1);
    expect(manager.getConstructions()[0].id).toBe(newId);
  });

  test('unarchiveConstruction restores construction and re-adds market_id to index', () => {
    const cid = manager.createConstruction({ system_name: 'Sol', station_name: 'Site A', station_type: 'SurfaceStation', market_id: 999 });
    manager.archiveConstruction(cid);
    expect(manager.getConstructions()).toHaveLength(0);
    let unarchived = null;
    bus.on('construction:unarchived', d => { unarchived = d; });
    manager.unarchiveConstruction(cid);
    expect(manager.getConstructions()).toHaveLength(1);
    expect(manager.getConstructions()[0].id).toBe(cid);
    expect(unarchived).not.toBeNull();
    expect(unarchived.id).toBe(cid);
    const sameId = manager.getOrCreateByMarketId({ market_id: 999, system_name: 'Sol', station_name: 'Site A', station_type: 'SurfaceStation' });
    expect(sameId).toBe(cid);
  });

  test('getArchivedConstructions returns archived with commodities', () => {
    const cid = manager.createConstruction({ system_name: 'Sol', station_name: 'Site A', station_type: 'SurfaceStation', market_id: 1 });
    manager.upsertCommodity(cid, { name: 'Steel', amount_required: 100 });
    manager.archiveConstruction(cid);
    const archived = manager.getArchivedConstructions();
    expect(archived).toHaveLength(1);
    expect(archived[0].id).toBe(cid);
    expect(archived[0].commodities).toHaveLength(1);
    expect(archived[0].commodities[0].name).toBe('Steel');
  });
});
