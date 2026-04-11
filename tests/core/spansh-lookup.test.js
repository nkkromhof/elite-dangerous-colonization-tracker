import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { fetchStationMarket, parseMarketData, searchStationForCommodity } from '../../src/core/spansh-lookup.js';

// Mock AbortSignal for testing
global.AbortSignal = {
  timeout: () => ({})
};

// Mock the fetch function for testing
describe('spansh-lookup', () => {
  let originalFetch;
  let fetchMock;

  beforeEach(() => {
    originalFetch = global.fetch;
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  test('fetchStationMarket returns structured data for valid marketId', async () => {
    // Mock response data
    const mockResponseData = {
      stationName: "Test Station",
      stationType: "Orbis",
      systemName: "Test System",
      position: { x: 0, y: 0, z: 0 },
      commodities: [
        { name_internal: "$FoodCartridges_Name;", name: "Food Cartridges", stock: 100 },
        { name_internal: "$MineralOil_Name;", name: "Mineral Oil", stock: 50 },
        { name_internal: "$Water_Name;", name: "Water", stock: 0 } // Should be filtered out
      ]
    };

    // Mock fetch to return our test data
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponseData)
    });

    const result = await fetchStationMarket(12345);
    
    expect(result.transient).toBe(false);
    expect(result.data).toBeDefined();
    expect(result.data?.stationName).toBe("Test Station");
    expect(result.data?.systemName).toBe("Test System");
    expect(result.data?.commodities.length).toBe(3);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.spansh.co.uk/station/12345',
      expect.objectContaining({
        signal: expect.any(Object)
      })
    );
  });

  test('fetchStationMarket handles network errors', async () => {
    // Mock fetch to throw an error
    fetchMock.mockRejectedValueOnce(new Error('Network error'));

    const result = await fetchStationMarket(12345);
    
    expect(result.transient).toBe(true);
    expect(result.data).toBeNull();
    expect(fetchMock).toHaveBeenCalled();
  });

  test('fetchStationMarket handles HTTP errors', async () => {
    // Mock fetch to return an error status
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Rate limit exceeded')
    });

    const result = await fetchStationMarket(12345);
    
    expect(result.transient).toBe(true); // 429 is considered transient
    expect(result.data).toBeNull();
    expect(fetchMock).toHaveBeenCalled();
  });

  test('parseMarketData extracts commodities correctly', () => {
    const mockMarketData = {
      station: {
        commodities: [
          { name_internal: "$FoodCartridges_Name;", name: "Food Cartridges", stock: 100 },
          { name_internal: "$MineralOil_Name;", name: "Mineral Oil", stock: 50 },
          { name_internal: "$Water_Name;", name: "Water", stock: 0 }, // Should be filtered out
          { name_internal: "$Gold_Name;", name: "Gold", stock: 25 }
        ]
      }
    };

    const result = parseMarketData(mockMarketData);
    
    expect(result.length).toBe(3); // Water with stock 0 should be filtered out
    expect(result[0]).toEqual({
      nameInternal: "$FoodCartridges_Name;",
      name: "Food Cartridges",
      stock: 100
    });
    expect(result[1]).toEqual({
      nameInternal: "$MineralOil_Name;",
      name: "Mineral Oil",
      stock: 50
    });
    expect(result[2]).toEqual({
      nameInternal: "$Gold_Name;",
      name: "Gold",
      stock: 25
    });
  });

  test('parseMarketData handles missing or invalid data', () => {
    expect(parseMarketData(null)).toEqual([]);
    expect(parseMarketData({})).toEqual([]);
    expect(parseMarketData({ station: null })).toEqual([]);
    expect(parseMarketData({ station: { commodities: null } })).toEqual([]);
    expect(parseMarketData({ station: { commodities: [] } })).toEqual([]);
  });

  test('searchStationForCommodity returns placeholder results', async () => {
    // Currently returns empty array as placeholder
    const result = await searchStationForCommodity("$FoodCartridges_Name;", "Sol");
    
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });
});