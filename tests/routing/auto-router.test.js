import { describe, test, expect, mock } from 'bun:test';
import { EventEmitter } from 'events';
import { AutoRouter } from '../../src/routing/auto-router.js';

const DOCK_EVENT = {
  event: 'Docked',
  MarketID: 42,
  StarSystem: 'Shinrarta Dezhra',
  StationName: 'Jameson Memorial',
};

const STATIONS = [{ name: 'Galileo', system: 'Sol', distanceLy: 1.2, padSize: 'L', type: 'Orbis Starport', commodity: 'Liquid Oxygen' }];

function makeManager({ construction = null, slots = [] } = {}) {
  return {
    findByMarketId: mock(() => construction),
    getCommoditySlots: mock(async () => slots),
  };
}

function makeFinder(stations = STATIONS) {
  return { findNearest: mock(async () => stations) };
}

describe('AutoRouter', () => {
  test('ignores non-Docked journal events', async () => {
    const bus = new EventEmitter();
    const manager = makeManager({ construction: { id: 'c1' } });
    const finder = makeFinder();
    new AutoRouter(bus, manager, finder);

    bus.emit('journal:event', { event: 'FSDJump', MarketID: 42 });
    await Promise.resolve();

    expect(finder.findNearest).not.toHaveBeenCalled();
  });

  test('ignores Docked at unknown station', async () => {
    const bus = new EventEmitter();
    const manager = makeManager({ construction: null });
    const finder = makeFinder();
    new AutoRouter(bus, manager, finder);

    bus.emit('journal:event', DOCK_EVENT);
    await Promise.resolve();

    expect(finder.findNearest).not.toHaveBeenCalled();
  });

  test('ignores Docked when all commodities are fulfilled', async () => {
    const bus = new EventEmitter();
    const manager = makeManager({
      construction: { id: 'c1' },
      slots: [{ name: 'Liquid Oxygen', amount_required: 10, amount_delivered: 10 }],
    });
    const finder = makeFinder();
    new AutoRouter(bus, manager, finder);

    bus.emit('journal:event', DOCK_EVENT);
    await new Promise(r => setTimeout(r, 10));

    expect(finder.findNearest).not.toHaveBeenCalled();
  });

  test('queries unfulfilled commodities and emits routing:results', async () => {
    const bus = new EventEmitter();
    const manager = makeManager({
      construction: { id: 'c1' },
      slots: [
        { name: 'Liquid Oxygen', amount_required: 10, amount_delivered: 3 },
        { name: 'Titanium',      amount_required: 5,  amount_delivered: 5 },
      ],
    });
    const finder = makeFinder();
    new AutoRouter(bus, manager, finder);

    const received = await new Promise(resolve => {
      bus.on('routing:results', resolve);
      bus.emit('journal:event', DOCK_EVENT);
    });

    expect(finder.findNearest).toHaveBeenCalledTimes(1);
    expect(finder.findNearest).toHaveBeenCalledWith('Liquid Oxygen', 'Shinrarta Dezhra');
    expect(received).toMatchObject({
      constructionId: 'c1',
      system: 'Shinrarta Dezhra',
      results: { 'Liquid Oxygen': STATIONS },
    });
  });
});
