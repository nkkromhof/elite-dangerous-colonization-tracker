import { describe, test, expect, beforeEach } from 'bun:test';
import { EventEmitter } from 'events';
import { CargoTracker } from '../../src/core/cargo-tracker.js';

function makeTracker(initialShip = [], initialFc = []) {
  const bus = new EventEmitter();
  const tracker = new CargoTracker(bus, { ship: initialShip, fc: initialFc });
  return { bus, tracker };
}

describe('CargoTracker', () => {
  test('MarketBuy adds to ship cargo', () => {
    const { bus, tracker } = makeTracker();
    bus.emit('journal:event', { event: 'MarketBuy', Type: '$liquidoxygen_name;', Type_Localised: 'Liquid Oxygen', Count: 50 });
    expect(tracker.getShipCargo()).toEqual([{ name: 'Liquid Oxygen', count: 50 }]);
  });

  test('MarketBuy accumulates repeated purchases', () => {
    const { bus, tracker } = makeTracker([{ name: 'Liquid Oxygen', count: 50 }]);
    bus.emit('journal:event', { event: 'MarketBuy', Type: '$liquidoxygen_name;', Type_Localised: 'Liquid Oxygen', Count: 20 });
    expect(tracker.getShipCargo()).toEqual([{ name: 'Liquid Oxygen', count: 70 }]);
  });

  test('CargoTransfer tocarrier moves from ship to FC', () => {
    const { bus, tracker } = makeTracker([{ name: 'Steel', count: 100 }]);
    bus.emit('journal:event', {
      event: 'CargoTransfer',
      Transfers: [{ Type: 'Steel', Type_Localised: 'Steel', Count: 40, Direction: 'tocarrier' }],
    });
    const ship = tracker.getShipCargo();
    const fc   = tracker.getFcCargo();
    expect(ship.find(c => c.name === 'Steel')?.count).toBe(60);
    expect(fc.find(c => c.name === 'Steel')?.count).toBe(40);
  });

  test('CargoTransfer toship moves from FC to ship', () => {
    const { bus, tracker } = makeTracker([], [{ name: 'Steel', count: 100 }]);
    bus.emit('journal:event', {
      event: 'CargoTransfer',
      Transfers: [{ Type: 'Steel', Type_Localised: 'Steel', Count: 30, Direction: 'toship' }],
    });
    expect(tracker.getShipCargo()).toEqual([{ name: 'Steel', count: 30 }]);
    expect(tracker.getFcCargo()).toEqual([{ name: 'Steel', count: 70 }]);
  });

  test('Died resets ship cargo', () => {
    const { bus, tracker } = makeTracker([{ name: 'Steel', count: 100 }]);
    bus.emit('journal:event', { event: 'Died' });
    expect(tracker.getShipCargo()).toEqual([]);
  });

  test('EjectCargo reduces ship cargo', () => {
    const { bus, tracker } = makeTracker([{ name: 'Steel', count: 100 }]);
    bus.emit('journal:event', { event: 'EjectCargo', Type: 'Steel', Type_Localised: 'Steel', Count: 10 });
    expect(tracker.getShipCargo()).toEqual([{ name: 'Steel', count: 90 }]);
  });

  test('emits cargo:updated on every change', () => {
    const { bus, tracker } = makeTracker();
    let updated = false;
    bus.on('cargo:updated', () => { updated = true; });
    bus.emit('journal:event', { event: 'MarketBuy', Type: '$steel_name;', Type_Localised: 'Steel', Count: 10 });
    expect(updated).toBe(true);
  });
});
