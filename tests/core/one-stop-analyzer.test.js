import { describe, test, expect } from 'bun:test';
import { analyzeOneStop } from '../../src/core/one-stop-analyzer.js';

function makeStation(station, system, distanceLy, commodities, isStale = false) {
  const key = `${station}|${system}`;
  const commodityMap = new Map(Object.entries(commodities));
  return [key, { station, system, distanceLy, commodities: commodityMap, isStale }];
}

function makeSlot(name, nameInternal, required, delivered = 0) {
  return { name, name_internal: nameInternal, amount_required: required, amount_delivered: delivered };
}

describe('analyzeOneStop', () => {
  test('assigns all commodities when one station covers everything', () => {
    const neededSlots = [
      makeSlot('Steel', '$steel', 100),
      makeSlot('Polymers', '$polymers', 50),
    ];
    const stationMap = new Map([
      makeStation('Hub', 'Sol', 10, { $steel: 500, $polymers: 200 }),
    ]);

    const { assignments, unassigned } = analyzeOneStop({ neededSlots, stationMap });
    expect(assignments.size).toBe(2);
    expect(assignments.get('$steel').station).toBe('Hub');
    expect(assignments.get('$polymers').station).toBe('Hub');
    expect(assignments.get('$steel').lowSupply).toBe(false);
    expect(assignments.get('$steel').isStale).toBe(false);
    expect(unassigned).toHaveLength(0);
  });

  test('returns empty assignments and all unassigned when stationMap is empty', () => {
    const neededSlots = [makeSlot('Steel', '$steel', 100)];
    const stationMap = new Map();

    const { assignments, unassigned } = analyzeOneStop({ neededSlots, stationMap });
    expect(assignments.size).toBe(0);
    expect(unassigned).toEqual(['$steel']);
  });

  test('prefers station covering more commodities (greedy set-cover)', () => {
    const neededSlots = [
      makeSlot('Steel', '$steel', 100),
      makeSlot('Polymers', '$polymers', 50),
      makeSlot('Copper', '$copper', 30),
    ];
    const stationMap = new Map([
      makeStation('StationA', 'Sol', 20, { $steel: 500, $polymers: 200 }),
      makeStation('StationB', 'Alpha', 10, { $copper: 300 }),
    ]);

    const { assignments } = analyzeOneStop({ neededSlots, stationMap });
    expect(assignments.get('$steel').station).toBe('StationA');
    expect(assignments.get('$polymers').station).toBe('StationA');
    expect(assignments.get('$copper').station).toBe('StationB');
  });

  test('falls back to low-supply station when 3x rule not met', () => {
    const neededSlots = [makeSlot('Steel', '$steel', 100)];
    const stationMap = new Map([
      makeStation('LowStock', 'Sol', 10, { $steel: 200 }),
    ]);

    const { assignments } = analyzeOneStop({ neededSlots, stationMap });
    expect(assignments.get('$steel').station).toBe('LowStock');
    expect(assignments.get('$steel').lowSupply).toBe(true);
  });

  test('prefers closer station when coverage count is tied', () => {
    const neededSlots = [makeSlot('Steel', '$steel', 100)];
    const stationMap = new Map([
      makeStation('FarStation', 'Alpha', 50, { $steel: 500 }),
      makeStation('NearStation', 'Sol', 10, { $steel: 500 }),
    ]);

    const { assignments } = analyzeOneStop({ neededSlots, stationMap });
    expect(assignments.get('$steel').station).toBe('NearStation');
  });

  test('reports unassigned when no station sells a commodity', () => {
    const neededSlots = [
      makeSlot('Steel', '$steel', 100),
      makeSlot('Unobtainium', '$unobtainium', 50),
    ];
    const stationMap = new Map([
      makeStation('Hub', 'Sol', 10, { $steel: 500 }),
    ]);

    const { assignments, unassigned } = analyzeOneStop({ neededSlots, stationMap });
    expect(assignments.size).toBe(1);
    expect(unassigned).toEqual(['$unobtainium']);
  });

  test('respects custom supplyMultiplier', () => {
    const neededSlots = [makeSlot('Steel', '$steel', 100)];
    const stationMap = new Map([
      makeStation('Hub', 'Sol', 10, { $steel: 250 }),
    ]);

    const result2x = analyzeOneStop({ neededSlots, stationMap, supplyMultiplier: 2 });
    expect(result2x.assignments.get('$steel').lowSupply).toBe(false);

    const result3x = analyzeOneStop({ neededSlots, stationMap });
    expect(result3x.assignments.get('$steel').lowSupply).toBe(true);
  });

  test('handles null supply values in station data', () => {
    const neededSlots = [makeSlot('Steel', '$steel', 100)];
    const stationMap = new Map([
      makeStation('Hub', 'Sol', 10, { $steel: null }),
    ]);

    const { assignments } = analyzeOneStop({ neededSlots, stationMap });
    expect(assignments.get('$steel').lowSupply).toBe(true);
    expect(assignments.get('$steel').supply).toBeNull();
  });

  test('skips commodities already fully delivered', () => {
    const neededSlots = [
      makeSlot('Steel', '$steel', 100, 100),
    ];
    const stationMap = new Map([
      makeStation('Hub', 'Sol', 10, { $steel: 500 }),
    ]);

    const { assignments } = analyzeOneStop({ neededSlots, stationMap });
    expect(assignments.has('$steel')).toBe(true);
  });

  // ── Pass 2: stale-but-abundant ──────────────────────────────────────────

  test('Pass 2 assigns stale station with abundant supply', () => {
    const neededSlots = [makeSlot('Ceramic Composites', '$ceramiccomposites', 5000)];
    const staleStation = makeStation('Blackiron Composites', 'Lupus Dark Region', 23, { $ceramiccomposites: 2_000_000 }, true);
    const stationMap = new Map([staleStation]);

    const { assignments } = analyzeOneStop({ neededSlots, stationMap });
    expect(assignments.get('$ceramiccomposites').station).toBe('Blackiron Composites');
    expect(assignments.get('$ceramiccomposites').isStale).toBe(true);
    expect(assignments.get('$ceramiccomposites').lowSupply).toBe(false);
  });

  test('Pass 2 prefers closer stale station over farther stale station', () => {
    const neededSlots = [makeSlot('Ceramic Composites', '$ceramiccomposites', 5000)];
    const stationMap = new Map([
      makeStation('FarStale', 'Far System', 50, { $ceramiccomposites: 5_000_000 }, true),
      makeStation('NearStale', 'Near System', 23, { $ceramiccomposites: 2_000_000 }, true),
    ]);

    const { assignments } = analyzeOneStop({ neededSlots, stationMap });
    expect(assignments.get('$ceramiccomposites').station).toBe('NearStale');
  });

  test('Pass 2 skips stale station with insufficient supply ratio', () => {
    const neededSlots = [makeSlot('Ceramic Composites', '$ceramiccomposites', 5000)];
    const stationMap = new Map([
      makeStation('LowStale', 'System', 23, { $ceramiccomposites: 50_000 }, true),
    ]);

    const { assignments } = analyzeOneStop({ neededSlots, stationMap });
    // 50K / 5000 = 10x, which is less than staleSupplyMultiplier=20, so it falls to Pass 3
    expect(assignments.get('$ceramiccomposites').isStale).toBe(true);
    expect(assignments.get('$ceramiccomposites').lowSupply).toBe(true);
  });

  test('Pass 1 fresh station is preferred over stale station with same supply', () => {
    const neededSlots = [makeSlot('Steel', '$steel', 100)];
    const stationMap = new Map([
      makeStation('FreshHub', 'Sol', 50, { $steel: 500 }, false),
      makeStation('StaleHub', 'Alpha', 10, { $steel: 500 }, true),
    ]);

    const { assignments } = analyzeOneStop({ neededSlots, stationMap });
    expect(assignments.get('$steel').station).toBe('FreshHub');
    expect(assignments.get('$steel').isStale).toBe(false);
  });

  // ── Pass 3: distance-aware fallback ─────────────────────────────────────

  test('Pass 3 prefers nearby station via supply/distance score over far station with higher supply', () => {
    const neededSlots = [makeSlot('Steel', '$steel', 100)];
    const stationMap = new Map([
      makeStation('FarHighSupply', 'Far System', 50, { $steel: 200 }),
      makeStation('NearModerate', 'Near System', 23, { $steel: 150 }),
    ]);

    const { assignments } = analyzeOneStop({ neededSlots, stationMap });
    // NearModerate score: 150/24 ≈ 6.25; FarHighSupply score: 200/51 ≈ 3.92
    expect(assignments.get('$steel').station).toBe('NearModerate');
    expect(assignments.get('$steel').lowSupply).toBe(true);
  });
});
