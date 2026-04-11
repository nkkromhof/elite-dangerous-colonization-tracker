import { describe, test, expect } from 'bun:test';
import { parseStationName, formatStationType, isCommodityComplete, isLowSupply } from '../../../src/frontend/lib/utils/format.js';

describe('parseStationName', () => {
  test('strips prefix before colon', () => {
    expect(parseStationName('System: Station Name')).toBe('Station Name');
  });

  test('returns name as-is when no colon', () => {
    expect(parseStationName('Station Name')).toBe('Station Name');
  });

  test('returns empty string for null/undefined', () => {
    expect(parseStationName(null)).toBe('');
    expect(parseStationName(undefined)).toBe('');
  });
});

describe('formatStationType', () => {
  test('inserts spaces before capitals', () => {
    expect(formatStationType('FleetCarrier')).toBe('Fleet Carrier');
  });

  test('handles single word', () => {
    expect(formatStationType('Outpost')).toBe('Outpost');
  });

  test('returns empty string for falsy input', () => {
    expect(formatStationType(null)).toBe('');
    expect(formatStationType('')).toBe('');
  });
});

describe('isCommodityComplete', () => {
  test('true when delivered >= required', () => {
    expect(isCommodityComplete({ amount_delivered: 100, amount_required: 100 })).toBe(true);
    expect(isCommodityComplete({ amount_delivered: 150, amount_required: 100 })).toBe(true);
  });

  test('false when delivered < required', () => {
    expect(isCommodityComplete({ amount_delivered: 50, amount_required: 100 })).toBe(false);
  });
});

describe('isLowSupply', () => {
  test('true when supply < 3x remaining', () => {
    expect(isLowSupply({ nearest_supply: 100, amount_required: 200, amount_delivered: 150 })).toBe(true);
  });

  test('false when supply >= 3x remaining', () => {
    expect(isLowSupply({ nearest_supply: 300, amount_required: 200, amount_delivered: 100 })).toBe(true);
    expect(isLowSupply({ nearest_supply: 301, amount_required: 200, amount_delivered: 100 })).toBe(false);
  });

  test('false when supply is null', () => {
    expect(isLowSupply({ nearest_supply: null, amount_required: 100, amount_delivered: 0 })).toBe(false);
  });

  test('false when commodity is complete', () => {
    expect(isLowSupply({ nearest_supply: 1, amount_required: 100, amount_delivered: 100 })).toBe(false);
  });
});
