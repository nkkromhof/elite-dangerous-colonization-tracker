import { TtlCache } from './cache.js';

const SURFACE_TYPES = ['SurfaceStation', 'OnFootSettlement', 'CraterOutpost', 'CraterPort'];

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
   * @param {string} commodity  human-readable name (e.g. 'Liquid Oxygen')
   * @param {string} system     current system name
   * @param {'orbital'|'surface'|'both'} [prefer='both']
   * @param {number} [maxDistanceLy=100]
   * @returns {Promise<Array<{name:string,system_name:string,distance:number,pad_size:string,type:string}>>}
   */
  async findNearest(commodity, system, prefer = 'both', maxDistanceLy = 100) {
    const cacheKey = `${commodity}::${system}::${prefer}`;
    if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);

    const url = new URL(`${this._base}/nearest-commodity`);
    url.searchParams.set('commodities[]', commodity.toLowerCase().replace(/ /g, ''));
    url.searchParams.set('system', system);
    url.searchParams.set('distance', String(maxDistanceLy));

    const res = await this._fetch(url.toString());
    if (!res.ok) throw new Error(`Spansh API error: ${res.status}`);
    const data = await res.json();

    let results = data.results ?? [];

    if (prefer === 'orbital') results = results.filter(r => !SURFACE_TYPES.includes(r.type));
    if (prefer === 'surface') results = results.filter(r => SURFACE_TYPES.includes(r.type));

    this._cache.set(cacheKey, results);
    return results;
  }
}
