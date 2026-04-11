import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { fetchState, archiveConstruction, unarchiveConstruction, updateFcCargo, fetchArchivedConstructions, refreshStations } from '../../../src/frontend/lib/utils/api.js';

describe('api', () => {
  let originalFetch;
  let lastFetchUrl;
  let lastFetchOpts;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      lastFetchUrl = url;
      lastFetchOpts = opts;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('fetchState calls GET /api/state', async () => {
    await fetchState();
    expect(lastFetchUrl).toBe('/api/state');
    expect(lastFetchOpts).toBeUndefined();
  });

  test('archiveConstruction calls PATCH with archived: true', async () => {
    await archiveConstruction('abc-123');
    expect(lastFetchUrl).toBe('/api/constructions/abc-123');
    expect(lastFetchOpts.method).toBe('PATCH');
    expect(JSON.parse(lastFetchOpts.body)).toEqual({ archived: true });
  });

  test('unarchiveConstruction calls PATCH with archived: false', async () => {
    await unarchiveConstruction('abc-123');
    expect(lastFetchUrl).toBe('/api/constructions/abc-123');
    expect(lastFetchOpts.method).toBe('PATCH');
    expect(JSON.parse(lastFetchOpts.body)).toEqual({ archived: false });
  });

  test('updateFcCargo calls PATCH /api/cargo/fc', async () => {
    await updateFcCargo('Steel', 500);
    expect(lastFetchUrl).toBe('/api/cargo/fc');
    expect(lastFetchOpts.method).toBe('PATCH');
    expect(JSON.parse(lastFetchOpts.body)).toEqual({ commodityName: 'Steel', count: 500 });
  });

  test('refreshStations calls POST', async () => {
    await refreshStations('abc-123');
    expect(lastFetchUrl).toBe('/api/constructions/abc-123/refresh-stations');
    expect(lastFetchOpts.method).toBe('POST');
  });
});
