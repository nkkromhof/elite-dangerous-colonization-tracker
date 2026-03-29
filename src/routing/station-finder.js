import { TtlCache } from './cache.js';

const SURFACE_TYPES = ['SurfaceStation', 'OnFootSettlement', 'CraterOutpost', 'CraterPort'];

const PAD_RANK = { S: 1, M: 2, L: 3 };

/**
 * @typedef {Object} StationDTO
 * @property {string} name         - Station name
 * @property {string} system       - Star system name
 * @property {number} distanceLy   - Distance in light-years from the queried system
 * @property {'S'|'M'|'L'} padSize - Largest available landing pad size
 * @property {string} type         - Station type (e.g. 'Orbis Starport', 'SurfaceStation')
 * @property {string} commodity    - Commodity name as returned by Spansh
 */

/**
 * Maps a raw Spansh nearest-commodity result entry to a StationDTO.
 * All knowledge of the Spansh response shape lives here.
 * @param {Object} raw
 * @returns {StationDTO}
 */
function toStationDTO(raw) {
  return {
    name: raw.name,
    system: raw.system_name,
    distanceLy: raw.distance,
    padSize: raw.pad_size,
    type: raw.type,
    commodity: raw.commodity?.name ?? 'Unknown commodity',
  };
}

export class StationFinder {
  /**
   * @param {{ spanshApiBase: string, stationCacheTtlMs: number, fetchFn?: Function }} opts
   */
  constructor({ spanshApiBase, stationCacheTtlMs, fetchFn }) {
    this._base = spanshApiBase;
    this._cache = new TtlCache(stationCacheTtlMs);
    this._fetch = fetchFn ?? fetch;
  }

  /**
   * @param {string} commodity           human-readable name (e.g. 'Liquid Oxygen')
   * @param {string} system              current system name
   * @param {'orbital'|'surface'|'both'} [prefer='both']
   * @param {number} [maxDistanceLy=100]
   * @param {'S'|'M'|'L'|null} [minPad=null]  minimum landing pad size; null means no filter
   * @returns {Promise<StationDTO[]>}
   */
  async findNearest(commodity, system, prefer = 'both', maxDistanceLy = 100, minPad = null) {
    const cacheKey = `${commodity}::${system}::${prefer}::${minPad ?? 'any'}`;
    if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);

    const url = new URL(`${this._base}/nearest-commodity`);
    url.searchParams.set('commodities[]', commodity.toLowerCase().replace(/ /g, ''));
    url.searchParams.set('system', system);
    url.searchParams.set('distance', String(maxDistanceLy));

    const res = await this._fetch(url.toString());
    if (!res.ok) throw new Error(`Spansh API error: ${res.status}`);
    const data = await res.json();

    let results = (data.results ?? []).map(toStationDTO);

    if (prefer === 'orbital') results = results.filter(r => !SURFACE_TYPES.includes(r.type));
    if (prefer === 'surface') results = results.filter(r => SURFACE_TYPES.includes(r.type));

    if (minPad) {
      const minRank = PAD_RANK[minPad] ?? 0;
      results = results.filter(r => (PAD_RANK[r.padSize] ?? 0) >= minRank);
    }

    this._cache.set(cacheKey, results);
    return results;
  }
}
