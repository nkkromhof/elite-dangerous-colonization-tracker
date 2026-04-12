import { describe, test, expect, beforeEach } from 'bun:test';

// Mock Svelte 5 rune -- in a plain Bun test context $state is not compiled away,
// so we provide a simple pass-through that returns the initial value as a boxed ref.
globalThis.$state = (initial) => initial;

// Mock localStorage
globalThis.localStorage = {
  _data: {},
  getItem(key) { return this._data[key] ?? null; },
  setItem(key, value) { this._data[key] = String(value); },
  clear() { this._data = {}; }
};

// Mock sessionStorage
globalThis.sessionStorage = {
  _data: {},
  getItem(key) { return this._data[key] ?? null; },
  setItem(key, value) { this._data[key] = String(value); },
  clear() { this._data = {}; }
};

describe('ui.svelte.js VR mode', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test('getVrMode returns false by default', async () => {
    const { getVrMode } = await import('../../../src/frontend/lib/stores/ui.svelte.js');
    expect(getVrMode()).toBe(false);
  });

  test('setVrMode persists to sessionStorage', async () => {
    const { setVrMode, getVrMode } = await import('../../../src/frontend/lib/stores/ui.svelte.js');
    setVrMode(true);
    expect(getVrMode()).toBe(true);
    expect(sessionStorage.getItem('ed-tracker-vr')).toBe('true');
  });

  test('toggleVrMode flips the state', async () => {
    const { setVrMode, toggleVrMode, getVrMode } = await import('../../../src/frontend/lib/stores/ui.svelte.js');
    setVrMode(false);
    toggleVrMode();
    expect(getVrMode()).toBe(true);
    toggleVrMode();
    expect(getVrMode()).toBe(false);
  });
});
