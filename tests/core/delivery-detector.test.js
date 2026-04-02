import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { EventEmitter } from 'events';
import { initDb, getDb } from '../../src/db/database.js';
import { ConstructionManager } from '../../src/core/construction-manager.js';
import { DeliveryDetector } from '../../src/core/delivery-detector.js';

const CONSTRUCTION_MARKET_ID = 77001;
const CONSTRUCTION_NAME = 'Sol Construction Site';

function makeSetup(cargoAtDock, cargoAtUndock) {
  initDb(':memory:');
  const bus = new EventEmitter();
  const manager = new ConstructionManager(bus);
  const cid = manager.createConstruction({ system_name: 'Sol', station_name: CONSTRUCTION_NAME, station_type: 'SurfaceStation', market_id: CONSTRUCTION_MARKET_ID });
  manager.upsertCommodity(cid, { name: 'Liquid Oxygen', amount_required: 500 });

  let callCount = 0;
  const readCargo = () => (callCount++ === 0 ? cargoAtDock : cargoAtUndock);
  const detector = new DeliveryDetector(bus, manager, readCargo);
  return { bus, manager, detector, cid };
}

describe('DeliveryDetector', () => {
  afterEach(() => getDb()?.close());

  test('detects delivery when cargo decreases on undock from construction site', () => {
    const { bus, cid } = makeSetup(
      [{ name: 'Liquid Oxygen', count: 100 }],
      [{ name: 'Liquid Oxygen', count: 0 }]
    );
    const deliveries = [];
    bus.on('delivery:detected', d => deliveries.push(d));
    bus.emit('journal:event', { event: 'Docked', StationName: CONSTRUCTION_NAME, MarketID: CONSTRUCTION_MARKET_ID, StationType: 'SpaceConstructionDepot' });
    bus.emit('journal:event', { event: 'Undocked', StationName: CONSTRUCTION_NAME, MarketID: CONSTRUCTION_MARKET_ID });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].commodity).toBe('Liquid Oxygen');
    expect(deliveries[0].amount).toBe(100);
    expect(deliveries[0].constructionId).toBe(cid);
  });

  test('no delivery emitted when undocked from non-construction site', () => {
    const { bus } = makeSetup(
      [{ name: 'Liquid Oxygen', count: 100 }],
      [{ name: 'Liquid Oxygen', count: 0 }]
    );
    const deliveries = [];
    bus.on('delivery:detected', d => deliveries.push(d));
    bus.emit('journal:event', { event: 'Docked', StationName: 'Freeport', MarketID: 99999, StationType: 'Coriolis' });
    bus.emit('journal:event', { event: 'Undocked', StationName: 'Freeport', MarketID: 99999 });
    expect(deliveries).toHaveLength(0);
  });

  test('EjectCargo at construction site reduces expected delivery', () => {
    const { bus, cid } = makeSetup(
      [{ name: 'Liquid Oxygen', count: 100 }],
      [{ name: 'Liquid Oxygen', count: 0 }]
    );
    const deliveries = [];
    bus.on('delivery:detected', d => deliveries.push(d));
    bus.emit('journal:event', { event: 'Docked', StationName: CONSTRUCTION_NAME, MarketID: CONSTRUCTION_MARKET_ID, StationType: 'SpaceConstructionDepot' });
    bus.emit('journal:event', { event: 'EjectCargo', Type: 'Liquid Oxygen', Type_Localised: 'Liquid Oxygen', Count: 10 });
    bus.emit('journal:event', { event: 'Undocked', StationName: CONSTRUCTION_NAME, MarketID: CONSTRUCTION_MARKET_ID });
    // 100 disappeared, 10 ejected → 90 delivered
    expect(deliveries[0].amount).toBe(90);
  });
});