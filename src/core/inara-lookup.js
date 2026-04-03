import { INARA_COMMODITY_IDS } from '../../public/inara-commodity-ids.js';
import { logger } from './logger.js';

const TAG = 'InaraLookup';

const SEARCH_RANGE_LY = 500;
const USER_AGENT = 'ED-Colonisation-Tracker/1.0 (https://github.com/nicholasrobinson/elite-dangerous-colonization-tracker)';

function inaraId(nameInternal) {
  if (!nameInternal) return null;
  const symbol = nameInternal.replace(/^\$/, '').replace(/_[Nn]ame;$/, '').toLowerCase();
  return INARA_COMMODITY_IDS[symbol] ?? null;
}

function buildUrl(ids, systemName) {
  const params = new URLSearchParams({
    formbrief: '1',
    pi1: '1',   // selling (not buying)
    pi3: '3',   // sort by distance
    pi5: String(SEARCH_RANGE_LY),
    pi13: '1',  // include fleet carriers
    ps1: systemName,
  });
  for (const id of ids) {
    params.append('pa1[]', id);
  }
  return `https://inara.cz/elite/commodities/?${params}`;
}

/**
 * Parse a single <tr> row from the Inara commodities table.
 * Uses CSS class matching instead of column position to avoid ambiguity
 * when the Ly-distance column is a decimal (which the old \d+ regex skipped).
 *
 * Columns (single-commodity):
 *   wrap | pad | Ls (minor alignright) | Ly (minor alignright) | supply (alignright) | price (alignright highlight) | timestamp (minor alignright small)
 *
 * Multi-commodity adds an extra column between price and timestamp:
 *   coverage count (alignright  positive)
 */
function parseRow(row) {
  const stationMatch = row.match(/<\/div>([^<]+?)<wbr>/);
  const station = stationMatch?.[1]?.trim();

  const systemMatch = row.match(/<span class="uppercase nowrap">([^<]+)<\/span>/);
  const system = systemMatch?.[1]?.trim();

  if (!station || !system) return null;

  // Ly distance: the column whose text content contains "Ly"
  const lyMatch = row.match(/data-order="([\d.]+)">[^<]*\d+[.,]\d+ Ly/);
  const distanceLy = lyMatch ? parseFloat(lyMatch[1]) : 0;

  // Supply: <td class="alignright" data-order="..."> (no extra classes)
  const supplyMatch = row.match(/class="alignright" data-order="(\d+)">/);
  const supply = supplyMatch ? parseInt(supplyMatch[1], 10) : null;

  // Coverage count (only present in multi-commodity queries):
  // <td class="alignright  positive" data-order="N">
  const coverageMatch = row.match(/class="alignright  positive" data-order="(\d+)">/);
  const coverageCount = coverageMatch ? parseInt(coverageMatch[1], 10) : 1;

  return { station, system, distanceLy, supply, coverageCount };
}

/**
 * Parse all <tr> rows from the Inara commodities result table.
 * @param {string} html
 * @returns {{ station:string, system:string, distanceLy:number, supply:number|null, coverageCount:number }[]}
 */
function parseAllRows(html) {
  const tbodyMatch = html.match(/<tbody>([\s\S]+?)<\/tbody>/);
  if (!tbodyMatch) return [];

  const results = [];
  for (const rowMatch of tbodyMatch[1].matchAll(/<tr[^>]*>([\s\S]+?)<\/tr>/g)) {
    const parsed = parseRow(rowMatch[1]);
    if (parsed) results.push(parsed);
  }
  return results;
}

function isTransientStatus(status) {
  return status === 429 || status === 503 || status === 502 || status === 504;
}

/**
 * Fetch the nearest station from Inara selling the given commodity.
 * @param {string} nameInternal  e.g. "$FoodCartridges_Name;"
 * @param {string} systemName    reference system for distance sorting
 * @returns {Promise<{ data: {station,system,distanceLy,supply}|null, transient: boolean }>}
 *   transient=true means a retriable error (rate limit, network); queriedAt should NOT be stamped.
 *   transient=false means a definitive answer (success or genuinely no results).
 */
export async function lookupNearestStation(nameInternal, systemName) {
  const id = inaraId(nameInternal);
  if (!id) {
    logger.warn(TAG, `No Inara ID for ${nameInternal} — skipping`);
    return { data: null, transient: false };
  }

  const url = buildUrl([id], systemName);
  logger.debug(TAG, `GET ${url}`);
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) {
      const transient = isTransientStatus(resp.status);
      logger.warn(TAG, `HTTP ${resp.status} for ${nameInternal} (${systemName})${transient ? ' — will retry' : ''}`);
      return { data: null, transient };
    }
    const html = await resp.text();
    const rows = parseAllRows(html);
    if (rows.length === 0) {
      logger.info(TAG, `No results for ${nameInternal} near ${systemName}`);
      return { data: null, transient: false };
    }
    const { station, system, distanceLy, supply } = rows[0];
    logger.info(TAG, `${nameInternal} → ${station} / ${system} (${distanceLy} ly, supply ${supply})`);
    return { data: { station, system, distanceLy, supply }, transient: false };
  } catch (err) {
    logger.warn(TAG, `Fetch failed for ${nameInternal}: ${err?.message ?? err}`);
    return { data: null, transient: true };
  }
}

/**
 * Fetch the nearest station selling ALL commodities in a group.
 *
 * Inara sorts results by coverage-count DESC then distance ASC, so the first
 * result is the nearest station that sells the most of the queried commodities.
 *
 * Returns a map of nameInternal → station result for every commodity that was
 * resolved, plus an array of nameInternal values that need individual follow-up
 * queries because no single station covered them all.
 *
 * @param {string[]} nameInternalList
 * @param {string}   systemName
 * @returns {Promise<{ found: Record<string,{station,system,distanceLy,supply}>, unresolved: string[], transient: boolean }>}
 *   transient=true means a retriable error affected this group; affected items should not get queriedAt stamped.
 */
export async function lookupNearestStationsForGroup(nameInternalList, systemName) {
  const entries = nameInternalList
    .map(nameInternal => ({ nameInternal, id: inaraId(nameInternal) }))
    .filter(e => e.id !== null);

  const noId = nameInternalList.filter(n => !entries.some(e => e.nameInternal === n));
  if (noId.length > 0) {
    logger.warn(TAG, `No Inara ID for: ${noId.join(', ')}`);
  }

  if (entries.length === 0) {
    return { found: {}, unresolved: nameInternalList, transient: false };
  }

  const url = buildUrl(entries.map(e => e.id), systemName);
  logger.debug(TAG, `GET (group, ${entries.length} commodities) ${url}`);
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) {
      const transient = isTransientStatus(resp.status);
      logger.warn(TAG, `HTTP ${resp.status} for group [${nameInternalList.join(', ')}] near ${systemName}${transient ? ' — will retry' : ''}`);
      return { found: {}, unresolved: nameInternalList, transient };
    }

    const html = await resp.text();
    const rows = parseAllRows(html);

    if (rows.length === 0) {
      logger.info(TAG, `No results for group [${nameInternalList.join(', ')}] near ${systemName}`);
      return { found: {}, unresolved: nameInternalList, transient: false };
    }

    // The first row has the highest coverage (Inara sorts coverage DESC first).
    const best = rows[0];
    logger.debug(TAG, `Group best: ${best.station} / ${best.system}, coverage ${best.coverageCount}/${entries.length}`);

    if (best.coverageCount >= entries.length) {
      // Station sells ALL queried commodities. Assign it to all of them.
      // Supply is only known for the "primary" commodity (lowest Inara ID, always
      // shown first by Inara). Set supply=null for the rest to avoid showing a
      // misleading value from a different commodity.
      const primaryId = Math.min(...entries.map(e => e.id));
      const found = {};
      for (const entry of entries) {
        found[entry.nameInternal] = {
          station:    best.station,
          system:     best.system,
          distanceLy: best.distanceLy,
          supply:     entry.id === primaryId ? best.supply : null,
        };
      }
      logger.info(TAG, `Group fully resolved → ${best.station} / ${best.system} for ${entries.length} commodities`);
      return { found, unresolved: noId, transient: false };
    }

    // Station doesn't cover all commodities. We can't determine which specific
    // ones are missing from the HTML alone, so fall back to individual queries.
    logger.info(TAG, `Group partial coverage (${best.coverageCount}/${entries.length}) — falling back to individual queries`);
    return { found: {}, unresolved: nameInternalList, transient: false };
  } catch (err) {
    logger.warn(TAG, `Fetch failed for group [${nameInternalList.join(', ')}]: ${err?.message ?? err}`);
    return { found: {}, unresolved: nameInternalList, transient: true };
  }
}
