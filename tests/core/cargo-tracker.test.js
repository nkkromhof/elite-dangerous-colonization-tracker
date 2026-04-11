import { describe, test, expect } from 'bun:test';
import { EventEmitter } from 'events';
import { CargoTracker } from '../../src/core/cargo-tracker.js';

function makeTracker(initialShip = [], initialFc = []) {
  const bus = new EventEmitter();
  const tracker = new CargoTracker(bus, { ship: initialShip, fc: initialFc });
  return { bus, tracker };
}

describe('CargoTracker', () => {
  // ── Ship cargo (set externally, not from journal events) ──────────────

  test('setShipCargo replaces ship cargo and emits cargo:updated', () => {
    const { bus, tracker } = makeTracker();
    let emitted = null;
    bus.on('cargo:updated', (d) => { emitted = d; });
    tracker.setShipCargo([{ name: 'Steel', count: 100 }]);
    expect(tracker.getShipCargo()).toEqual([{ name: 'Steel', count: 100 }]);
    expect(emitted).not.toBeNull();
    expect(emitted.ship).toEqual([{ name: 'Steel', count: 100 }]);
  });

  test('cargo:consumed reduces ship cargo', () => {
    const { bus, tracker } = makeTracker([{ name: 'Steel', count: 100 }]);
    bus.emit('cargo:consumed', { commodity: 'Steel', amount: 30 });
    expect(tracker.getShipCargo()).toEqual([{ name: 'Steel', count: 70 }]);
  });

  test('cargo:consumed removes item when count reaches zero', () => {
    const { bus, tracker } = makeTracker([{ name: 'Steel', count: 30 }]);
    bus.emit('cargo:consumed', { commodity: 'Steel', amount: 30 });
    expect(tracker.getShipCargo()).toEqual([]);
  });

  // ── FC cargo (tracked from journal events at FC market) ───────────────

  test('MarketBuy at FC market reduces FC cargo', () => {
    const { bus, tracker } = makeTracker([], [{ name: 'Steel', count: 100 }]);
    // First dock at FC to register the market ID
    bus.emit('journal:event', { event: 'Docked', StationType: 'FleetCarrier', MarketID: 42, StationName: 'X9Z-B2B' });
    // Now MarketBuy at that market reduces FC stock
    bus.emit('journal:event', { event: 'MarketBuy', MarketID: 42, Type: '$steel_name;', Type_Localised: 'Steel', Count: 20 });
    expect(tracker.getFcCargo().find(c => c.name === 'Steel')?.count).toBe(80);
  });

  test('MarketSell at FC market increases FC cargo', () => {
    const { bus, tracker } = makeTracker();
    bus.emit('journal:event', { event: 'Docked', StationType: 'FleetCarrier', MarketID: 42, StationName: 'X9Z-B2B' });
    bus.emit('journal:event', { event: 'MarketSell', MarketID: 42, Type: '$steel_name;', Type_Localised: 'Steel', Count: 50 });
    expect(tracker.getFcCargo().find(c => c.name === 'Steel')?.count).toBe(50);
  });

  test('MarketBuy at non-FC market is ignored', () => {
    const { bus, tracker } = makeTracker([], [{ name: 'Steel', count: 100 }]);
    bus.emit('journal:event', { event: 'Docked', StationType: 'FleetCarrier', MarketID: 42, StationName: 'X9Z-B2B' });
    // MarketBuy at a different market ID → no FC change
    bus.emit('journal:event', { event: 'MarketBuy', MarketID: 999, Type: '$steel_name;', Type_Localised: 'Steel', Count: 20 });
    expect(tracker.getFcCargo().find(c => c.name === 'Steel')?.count).toBe(100);
  });

  test('CargoTransfer tocarrier increases FC cargo', () => {
    const { bus, tracker } = makeTracker();
    bus.emit('journal:event', { event: 'Docked', StationType: 'FleetCarrier', MarketID: 42, StationName: 'X9Z-B2B' });
    bus.emit('journal:event', {
      event: 'CargoTransfer',
      Transfers: [{ Type: '$steel_name;', Type_Localised: 'Steel', Count: 40, Direction: 'tocarrier' }],
    });
    expect(tracker.getFcCargo().find(c => c.name === 'Steel')?.count).toBe(40);
  });

  test('CargoTransfer toship decreases FC cargo', () => {
    const { bus, tracker } = makeTracker([], [{ name: 'Steel', count: 100 }]);
    bus.emit('journal:event', { event: 'Docked', StationType: 'FleetCarrier', MarketID: 42, StationName: 'X9Z-B2B' });
    bus.emit('journal:event', {
      event: 'CargoTransfer',
      Transfers: [{ Type: '$steel_name;', Type_Localised: 'Steel', Count: 30, Direction: 'toship' }],
    });
    expect(tracker.getFcCargo().find(c => c.name === 'Steel')?.count).toBe(70);
  });

  // ── Skip flag (suppresses FC updates during journal replay) ───────────

  test('skipFcJournalUpdates suppresses journal-driven FC changes', () => {
    const { bus, tracker } = makeTracker([], [{ name: 'Steel', count: 100 }]);
    bus.emit('journal:event', { event: 'Docked', StationType: 'FleetCarrier', MarketID: 42, StationName: 'X9Z-B2B' });
    tracker.setSkipFcJournalUpdates(true);
    bus.emit('journal:event', { event: 'MarketBuy', MarketID: 42, Type: '$steel_name;', Type_Localised: 'Steel', Count: 20 });
    expect(tracker.getFcCargo().find(c => c.name === 'Steel')?.count).toBe(100);
    tracker.setSkipFcJournalUpdates(false);
  });

  // ── setFcCargoFromMarket (bulk FC sync from Market.json) ──────────────

  test('setFcCargoFromMarket merges items into FC cargo', () => {
    const { bus, tracker } = makeTracker();
    tracker.setFcCargoFromMarket(42, [{ name: 'Steel', count: 200 }]);
    expect(tracker.getFcCargo()).toEqual([{ name: 'Steel', count: 200 }]);
    expect(tracker.getFcMarketId()).toBe(42);
  });

  test('setFcCargoFromMarket rejects mismatched market ID', () => {
    const { bus, tracker } = makeTracker();
    tracker.setFcCargoFromMarket(42, [{ name: 'Steel', count: 200 }]);
    tracker.setFcCargoFromMarket(99, [{ name: 'Steel', count: 999 }]);
    // Second call rejected — market ID doesn't match the first
    expect(tracker.getFcCargo()).toEqual([{ name: 'Steel', count: 200 }]);
  });

  // ── updateFcCargo (manual FC cargo edit from UI) ──────────────────────

  test('updateFcCargo sets count for existing FC item', () => {
    const { bus, tracker } = makeTracker([], [{ name: 'Steel', count: 100 }]);
    tracker.updateFcCargo('Steel', 50);
    expect(tracker.getFcCargo().find(c => c.name === 'Steel')?.count).toBe(50);
  });

  test('updateFcCargo removes item when set to zero', () => {
    const { bus, tracker } = makeTracker([], [{ name: 'Steel', count: 100 }]);
    tracker.updateFcCargo('Steel', 0);
    expect(tracker.getFcCargo().find(c => c.name === 'Steel')).toBeUndefined();
  });

  // ── Docked event records FC identity ──────────────────────────────────

  test('Docked at FleetCarrier records market ID and station name', () => {
    const { bus, tracker } = makeTracker();
    bus.emit('journal:event', { event: 'Docked', StationType: 'FleetCarrier', MarketID: 42, StationName: 'X9Z-B2B' });
    expect(tracker.getFcMarketId()).toBe(42);
    expect(tracker.getFcStationName()).toBe('X9Z-B2B');
  });

  test('Docked at non-FC station does not change FC identity', () => {
    const { bus, tracker } = makeTracker();
    bus.emit('journal:event', { event: 'Docked', StationType: 'Coriolis', MarketID: 99, StationName: 'Freeport' });
    expect(tracker.getFcMarketId()).toBeNull();
  });

  // ── Initial state normalization ───────────────────────────────────────

  test('normalizes saved names on construction (e.g. $steel; → Steel)', () => {
    const { tracker } = makeTracker([{ name: '$steel;', count: 50 }]);
    expect(tracker.getShipCargo()).toEqual([{ name: 'Steel', count: 50 }]);
  });

  // ── Cargo copies are defensive (no shared references) ─────────────────

  test('getShipCargo returns a copy', () => {
    const { tracker } = makeTracker([{ name: 'Steel', count: 100 }]);
    const a = tracker.getShipCargo();
    const b = tracker.getShipCargo();
    expect(a).not.toBe(b);
  });
});
