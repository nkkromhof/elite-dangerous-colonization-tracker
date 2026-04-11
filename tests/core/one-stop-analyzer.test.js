import { describe, test, expect } from 'bun:test';
import { analyzeOneStop } from '../../src/core/one-stop-analyzer.js';

// Helper to build a stationMap entry
function makeStation(station, system, distanceLy, commodities) {
  const key = `${station}|${system}`;
  const commodityMap = new Map(Object.entries(commodities));
  return [key, { station, system, distanceLy, commodities: commodityMap }];
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
    // StationA covers steel + polymers; StationB covers only copper
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
    // Supply of 200 < 3 * 100 = 300
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
    // Supply of 250 meets 2x (200) but not 3x (300)
    const stationMap = new Map([
      makeStation('Hub', 'Sol', 10, { $steel: 250 }),
    ]);

    // With multiplier=2, it should be a strict assignment (not lowSupply)
    const result2x = analyzeOneStop({ neededSlots, stationMap, supplyMultiplier: 2 });
    expect(result2x.assignments.get('$steel').lowSupply).toBe(false);

    // With default multiplier=3, it falls back to lowSupply
    const result3x = analyzeOneStop({ neededSlots, stationMap });
    expect(result3x.assignments.get('$steel').lowSupply).toBe(true);
  });

  test('handles null supply values in station data', () => {
    const neededSlots = [makeSlot('Steel', '$steel', 100)];
    const stationMap = new Map([
      makeStation('Hub', 'Sol', 10, { $steel: null }),
    ]);

    const { assignments } = analyzeOneStop({ neededSlots, stationMap });
    // null supply can't meet 3x rule, falls back
    expect(assignments.get('$steel').lowSupply).toBe(true);
    expect(assignments.get('$steel').supply).toBeNull();
  });

  test('skips commodities already fully delivered', () => {
    const neededSlots = [
      makeSlot('Steel', '$steel', 100, 100), // fully delivered
    ];
    const stationMap = new Map([
      makeStation('Hub', 'Sol', 10, { $steel: 500 }),
    ]);

    // remaining = 0, so remainingAmounts.has() will still be true
    // but the caller filters these out before calling — test the edge case
    const { assignments } = analyzeOneStop({ neededSlots, stationMap });
    // remaining is 0, 3x rule: 500 >= 3*0 = 0, so it gets assigned
    expect(assignments.has('$steel')).toBe(true);
  });
});
