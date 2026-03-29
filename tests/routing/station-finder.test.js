import { describe, test, expect, beforeEach } from 'bun:test';
import { StationFinder } from '../../src/routing/station-finder.js';

const MOCK_RESPONSE = {
  results: [
    { name: 'Galileo', system_name: 'Sol', distance: 0.0, pad_size: 'L', type: 'Orbis Starport', commodity: { name: 'Liquid Oxygen' } },
    { name: 'Titan City', system_name: 'Sol', distance: 0.0, pad_size: 'M', type: 'Coriolis Starport', commodity: { name: 'Liquid Oxygen' } },
  ]
};

describe('StationFinder', () => {
  let finder;

  beforeEach(() => {
    finder = new StationFinder({
      spanshApiBase: 'https://spansh.co.uk/api',
      stationCacheTtlMs: 60_000,
      fetchFn: async () => ({ ok: true, json: async () => MOCK_RESPONSE }),
    });
  });

  test('findNearest returns array of station results', async () => {
    const results = await finder.findNearest('Liquid Oxygen', 'Sol');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toMatchObject({ name: 'Galileo', system: 'Sol', distanceLy: 0.0, padSize: 'L', type: 'Orbis Starport', commodity: 'Liquid Oxygen' });
  });

  test('caches results on repeated calls', async () => {
    let callCount = 0;
    const f = new StationFinder({
      spanshApiBase: 'https://spansh.co.uk/api',
      stationCacheTtlMs: 60_000,
      fetchFn: async () => { callCount++; return { ok: true, json: async () => MOCK_RESPONSE }; },
    });
    await f.findNearest('Liquid Oxygen', 'Sol');
    await f.findNearest('Liquid Oxygen', 'Sol');
    expect(callCount).toBe(1);
  });

  test('minPad=L filters out M and S stations', async () => {
    const results = await finder.findNearest('Liquid Oxygen', 'Sol', 'both', 100, 'L');
    expect(results.every(r => r.padSize === 'L')).toBe(true);
    expect(results.length).toBe(1);
  });

  test('minPad=M keeps M and L stations', async () => {
    const results = await finder.findNearest('Liquid Oxygen', 'Sol', 'both', 100, 'M');
    expect(results.length).toBe(2);
  });

  test('throws on non-ok response', async () => {
    const f = new StationFinder({
      spanshApiBase: 'https://spansh.co.uk/api',
      stationCacheTtlMs: 60_000,
      fetchFn: async () => ({ ok: false, status: 500, json: async () => ({}) }),
    });
    await expect(f.findNearest('Liquid Oxygen', 'Sol')).rejects.toThrow('Spansh API');
  });
});
