import { describe, test, expect } from 'bun:test';
import { commodityName, normalizeSavedName } from '../../src/core/commodity-name.js';

describe('commodityName', () => {
  test('prefers localised name when available', () => {
    expect(commodityName('Liquid Oxygen', '$liquidoxygen_name;')).toBe('Liquid Oxygen');
  });

  test('strips $ prefix and ; suffix from internal name', () => {
    expect(commodityName(undefined, '$liquidoxygen;')).toBe('Liquidoxygen');
  });

  test('capitalizes first letter of stripped internal name', () => {
    expect(commodityName(undefined, 'steel')).toBe('Steel');
  });

  test('returns empty string when both are falsy', () => {
    expect(commodityName(undefined, undefined)).toBe('');
    expect(commodityName(null, null)).toBe('');
    expect(commodityName(null, '')).toBe('');
  });
});

describe('normalizeSavedName', () => {
  test('strips $ prefix and ; suffix from stored names', () => {
    expect(normalizeSavedName('$polymers;')).toBe('Polymers');
  });

  test('capitalizes plain lowercase names', () => {
    expect(normalizeSavedName('steel')).toBe('Steel');
  });

  test('leaves already-normalized names unchanged', () => {
    expect(normalizeSavedName('Ceramic Composites')).toBe('Ceramic Composites');
  });

  test('returns empty string for falsy input', () => {
    expect(normalizeSavedName('')).toBe('');
    expect(normalizeSavedName(null)).toBe('');
    expect(normalizeSavedName(undefined)).toBe('');
  });
});
