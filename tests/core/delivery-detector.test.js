import { describe, test, expect, afterEach } from 'bun:test';
import { EventEmitter } from 'events';
import { initDb, getDb } from '../../src/db/database.js';
import { ConstructionManager } from '../../src/core/construction-manager.js';
import { DeliveryDetector } from '../../src/core/delivery-detector.js';

const MARKET_ID = 77001;

function makeSetup() {
  initDb(':memory:');
  const bus = new EventEmitter();
  const manager = new ConstructionManager(bus);
  new DeliveryDetector(bus, manager);
  return { bus, manager };
}

describe('DeliveryDetector', () => {
  afterEach(() => getDb()?.close());

  test('Docked at construction depot auto-creates construction', () => {
    const { bus, manager } = makeSetup();
    bus.emit('journal:event', {
      event: 'Docked',
      StationType: 'SpaceConstructionDepot',
      MarketID: MARKET_ID,
      StarSystem: 'Sol',
      StationName: 'Sol Construction Site',
    });
    expect(manager.findByMarketId(MARKET_ID)).not.toBeNull();
  });

  test('Docked at non-construction station is ignored', () => {
    const { bus, manager } = makeSetup();
    bus.emit('journal:event', {
      event: 'Docked',
      StationType: 'Coriolis',
      MarketID: 99999,
      StarSystem: 'Sol',
      StationName: 'Freeport',
    });
    expect(manager.findByMarketId(99999)).toBeNull();
  });

  test('ColonisationContribution emits delivery:detected', () => {
    const { bus, manager } = makeSetup();
    // Create the construction first (normally happens via Docked)
    const cid = manager.createConstruction({
      system_name: 'Sol',
      station_name: 'Sol Construction Site',
      station_type: 'SpaceConstructionDepot',
      market_id: MARKET_ID,
    });

    const deliveries = [];
    bus.on('delivery:detected', (d) => deliveries.push(d));

    bus.emit('journal:event', {
      event: 'ColonisationContribution',
      MarketID: MARKET_ID,
      Contributions: [
        { Name: '$liquidoxygen_name;', Name_Localised: 'Liquid Oxygen', Amount: 50 },
        { Name: '$steel_name;', Name_Localised: 'Steel', Amount: 100 },
      ],
    });

    expect(deliveries).toHaveLength(2);
    expect(deliveries[0]).toMatchObject({ commodity: 'Liquid Oxygen', amount: 50, constructionId: cid });
    expect(deliveries[1]).toMatchObject({ commodity: 'Steel', amount: 100, constructionId: cid });
  });

  test('ColonisationContribution for unknown market is ignored', () => {
    const { bus } = makeSetup();
    const deliveries = [];
    bus.on('delivery:detected', (d) => deliveries.push(d));

    bus.emit('journal:event', {
      event: 'ColonisationContribution',
      MarketID: 99999,
      Contributions: [{ Name: '$steel_name;', Name_Localised: 'Steel', Amount: 100 }],
    });

    expect(deliveries).toHaveLength(0);
  });

  test('ColonisationConstructionDepot syncs commodity requirements', () => {
    const { bus, manager } = makeSetup();
    const cid = manager.createConstruction({
      system_name: 'Sol',
      station_name: 'Sol Construction Site',
      station_type: 'SpaceConstructionDepot',
      market_id: MARKET_ID,
    });

    bus.emit('journal:event', {
      event: 'ColonisationConstructionDepot',
      MarketID: MARKET_ID,
      ResourcesRequired: [
        { Name: '$liquidoxygen_name;', Name_Localised: 'Liquid Oxygen', RequiredAmount: 500, ProvidedAmount: 100 },
      ],
    });

    const slots = manager.getCommoditySlots(cid);
    expect(slots).toHaveLength(1);
    expect(slots[0].name).toBe('Liquid Oxygen');
    expect(slots[0].amount_required).toBe(500);
    expect(slots[0].amount_delivered).toBe(100);
  });

  test('Docked at PlanetaryConstructionDepot also auto-creates', () => {
    const { bus, manager } = makeSetup();
    bus.emit('journal:event', {
      event: 'Docked',
      StationType: 'PlanetaryConstructionDepot',
      MarketID: 88001,
      StarSystem: 'Alpha Centauri',
      StationName: 'Surface Site',
    });
    expect(manager.findByMarketId(88001)).not.toBeNull();
  });
});