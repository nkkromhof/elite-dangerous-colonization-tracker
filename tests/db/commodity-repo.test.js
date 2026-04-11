import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { initDb, getDb } from '../../src/db/database.js';
import { createConstruction } from '../../src/db/repositories/construction-repo.js';
import {
  upsertCommoditySlot,
  getCommoditySlots,
  incrementDelivered,
  setDelivered,
  updateNearestStation,
  clearFailedStationLookups,
  clearAllStationLookups,
  upsertLookupCache,
  getLookupCache,
  clearLookupCacheFailed,
  clearLookupCacheAll,
} from '../../src/db/repositories/slot-repo.js';
import {
  recordDelivery,
  getDeliveries,
} from '../../src/db/repositories/delivery-repo.js';
import {
  saveCargoState,
  loadCargoState,
} from '../../src/db/repositories/cargo-repo.js';

const construction = {
  id: 'c1', system_name: 'Sol', station_name: 'Site A',
  station_type: 'SurfaceStation', market_id: 1, phase: 'scanning',
};

describe('slot-repo', () => {
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

  test('setDelivered sets amount_delivered', () => {
    upsertCommoditySlot({ id: 's1', construction_id: 'c1', name: 'Liquid Oxygen', amount_required: 100 });
    incrementDelivered('c1', 'Liquid Oxygen', 30);
    setDelivered('c1', 'Liquid Oxygen', 50);
    const slots = getCommoditySlots('c1');
    expect(slots[0].amount_delivered).toBe(50);
  });

  test('updateNearestStation sets station data', () => {
    upsertCommoditySlot({ id: 's1', construction_id: 'c1', name: 'Liquid Oxygen', amount_required: 100 });
    updateNearestStation('c1', 'Liquid Oxygen', { station: 'Abraham Lincoln', system: 'Sol', supply: 500, queriedAt: '2025-01-01T00:00:00.000Z' });
    const slot = getCommoditySlots('c1')[0];
    expect(slot.nearest_station).toBe('Abraham Lincoln');
    expect(slot.nearest_system).toBe('Sol');
    expect(slot.nearest_supply).toBe(500);
  });

  test('updateNearestStation with null queriedAt clears station only', () => {
    upsertCommoditySlot({ id: 's1', construction_id: 'c1', name: 'Liquid Oxygen', amount_required: 100 });
    updateNearestStation('c1', 'Liquid Oxygen', { station: 'Abraham Lincoln', system: 'Sol', supply: 500, queriedAt: '2025-01-01T00:00:00.000Z' });
    updateNearestStation('c1', 'Liquid Oxygen', { station: null, system: null, supply: null, queriedAt: null });
    const slot = getCommoditySlots('c1')[0];
    expect(slot.nearest_station).toBeNull();
  });

  test('clearFailedStationLookups resets queried_at for failed lookups', () => {
    upsertCommoditySlot({ id: 's1', construction_id: 'c1', name: 'Liquid Oxygen', amount_required: 100 });
    updateNearestStation('c1', 'Liquid Oxygen', { station: null, system: null, supply: null, queriedAt: '2025-01-01T00:00:00.000Z' });
    clearFailedStationLookups('c1');
    const slot = getCommoditySlots('c1')[0];
    expect(slot.nearest_queried_at).toBeNull();
  });

  test('clearAllStationLookups resets all station data', () => {
    upsertCommoditySlot({ id: 's1', construction_id: 'c1', name: 'Liquid Oxygen', amount_required: 100 });
    updateNearestStation('c1', 'Liquid Oxygen', { station: 'Abraham Lincoln', system: 'Sol', supply: 500, queriedAt: '2025-01-01T00:00:00.000Z' });
    clearAllStationLookups('c1');
    const slot = getCommoditySlots('c1')[0];
    expect(slot.nearest_station).toBeNull();
    expect(slot.nearest_system).toBeNull();
    expect(slot.nearest_supply).toBeNull();
    expect(slot.nearest_queried_at).toBeNull();
  });
});

describe('slot_lookup_cache', () => {
  beforeEach(() => {
    initDb(':memory:');
    createConstruction(construction);
  });
  afterEach(() => getDb()?.close());

  test('upsertLookupCache inserts cache row for a slot', () => {
    upsertCommoditySlot({ id: 's1', construction_id: 'c1', name: 'Liquid Oxygen', amount_required: 100 });
    upsertLookupCache('s1', { station: 'Abraham Lincoln', system: 'Sol', supply: 500, queriedAt: '2025-01-01T00:00:00.000Z' });
    const cache = getLookupCache('s1');
    expect(cache).not.toBeNull();
    expect(cache.station).toBe('Abraham Lincoln');
    expect(cache.system).toBe('Sol');
    expect(cache.supply).toBe(500);
  });

  test('upsertLookupCache updates existing cache row', () => {
    upsertCommoditySlot({ id: 's1', construction_id: 'c1', name: 'Liquid Oxygen', amount_required: 100 });
    upsertLookupCache('s1', { station: 'Station A', system: 'Sol', supply: 100, queriedAt: '2025-01-01T00:00:00.000Z' });
    upsertLookupCache('s1', { station: 'Station B', system: 'Alpha', supply: 200, queriedAt: '2025-01-02T00:00:00.000Z' });
    const cache = getLookupCache('s1');
    expect(cache.station).toBe('Station B');
    expect(cache.system).toBe('Alpha');
  });

  test('getLookupCache returns null for slot with no cache', () => {
    upsertCommoditySlot({ id: 's1', construction_id: 'c1', name: 'Liquid Oxygen', amount_required: 100 });
    expect(getLookupCache('s1')).toBeNull();
  });

  test('clearLookupCacheFailed resets only rows where station is null', () => {
    upsertCommoditySlot({ id: 's1', construction_id: 'c1', name: 'Liquid Oxygen', amount_required: 100 });
    upsertCommoditySlot({ id: 's2', construction_id: 'c1', name: 'Steel', amount_required: 200 });
    upsertLookupCache('s1', { station: 'Abraham Lincoln', system: 'Sol', supply: 500, queriedAt: '2025-01-01T00:00:00.000Z' });
    upsertLookupCache('s2', { station: null, system: null, supply: null, queriedAt: '2025-01-01T00:00:00.000Z' });
    clearLookupCacheFailed('c1');
    expect(getLookupCache('s1')).not.toBeNull();
    expect(getLookupCache('s1').queried_at).toBe('2025-01-01T00:00:00.000Z');
    expect(getLookupCache('s2')).not.toBeNull();
    expect(getLookupCache('s2').queried_at).toBeNull();
  });

  test('clearLookupCacheAll resets all cache rows for a construction', () => {
    upsertCommoditySlot({ id: 's1', construction_id: 'c1', name: 'Liquid Oxygen', amount_required: 100 });
    upsertCommoditySlot({ id: 's2', construction_id: 'c1', name: 'Steel', amount_required: 200 });
    upsertLookupCache('s1', { station: 'Abraham Lincoln', system: 'Sol', supply: 500, queriedAt: '2025-01-01T00:00:00.000Z' });
    upsertLookupCache('s2', { station: 'Station B', system: 'Alpha', supply: 100, queriedAt: '2025-01-01T00:00:00.000Z' });
    clearLookupCacheAll('c1');
    expect(getLookupCache('s1')).toBeNull();
    expect(getLookupCache('s2')).toBeNull();
  });

  test('deleting a commodity_slot cascades to slot_lookup_cache', () => {
    upsertCommoditySlot({ id: 's1', construction_id: 'c1', name: 'Liquid Oxygen', amount_required: 100 });
    upsertLookupCache('s1', { station: 'Abraham Lincoln', system: 'Sol', supply: 500, queriedAt: '2025-01-01T00:00:00.000Z' });
    getDb().run(`DELETE FROM commodity_slots WHERE id = ?`, ['s1']);
    expect(getLookupCache('s1')).toBeNull();
  });

  test('getCommoditySlots includes nearest_* fields via LEFT JOIN on slot_lookup_cache', () => {
    upsertCommoditySlot({ id: 's1', construction_id: 'c1', name: 'Liquid Oxygen', amount_required: 100 });
    upsertLookupCache('s1', { station: 'Abraham Lincoln', system: 'Sol', supply: 500, queriedAt: '2025-01-01T00:00:00.000Z' });
    const slots = getCommoditySlots('c1');
    expect(slots[0].nearest_station).toBe('Abraham Lincoln');
    expect(slots[0].nearest_system).toBe('Sol');
    expect(slots[0].nearest_supply).toBe(500);
    expect(slots[0].nearest_queried_at).toBe('2025-01-01T00:00:00.000Z');
  });

  test('getCommoditySlots returns null nearest_* when no cache row exists', () => {
    upsertCommoditySlot({ id: 's1', construction_id: 'c1', name: 'Liquid Oxygen', amount_required: 100 });
    const slots = getCommoditySlots('c1');
    expect(slots[0].nearest_station).toBeNull();
    expect(slots[0].nearest_system).toBeNull();
    expect(slots[0].nearest_supply).toBeNull();
    expect(slots[0].nearest_queried_at).toBeNull();
  });
});

describe('delivery-repo', () => {
  beforeEach(() => {
    initDb(':memory:');
    createConstruction(construction);
  });
  afterEach(() => getDb()?.close());

  test('recordDelivery persists audit record', () => {
    recordDelivery({ id: 'd1', construction_id: 'c1', commodity_name: 'Liquid Oxygen', amount: 30, source: 'ship' });
    expect(getDeliveries('c1')).toHaveLength(1);
  });
});

describe('cargo-repo', () => {
  beforeEach(() => initDb(':memory:'));
  afterEach(() => getDb()?.close());

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
