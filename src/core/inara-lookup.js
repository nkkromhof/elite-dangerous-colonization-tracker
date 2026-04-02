import { INARA_COMMODITY_IDS } from '../../public/inara-commodity-ids.js';

const SEARCH_RANGE_LY = 500;
const USER_AGENT = 'ED-Colonisation-Tracker/1.0 (https://github.com/nicholasrobinson/elite-dangerous-colonization-tracker)';

function inaraId(nameInternal) {
  if (!nameInternal) return null;
  const symbol = nameInternal.replace(/^\$/, '').replace(/_[Nn]ame;$/, '').toLowerCase();
  return INARA_COMMODITY_IDS[symbol] ?? null;
}

function buildUrl(id, systemName) {
  const params = new URLSearchParams({
    formbrief: '1',
    pi1: '1',   // selling (not buying)
    pi3: '3',   // sort by distance
    pi5: String(SEARCH_RANGE_LY),
    pi13: '1',  // include fleet carriers
    ps1: systemName,
  });
  params.append('pa1[]', id);
  return `https://inara.cz/elite/commodities/?${params}`;
}

function parseFirstResult(html) {
  const tbodyMatch = html.match(/<tbody>([\s\S]+?)<\/tbody>/);
  if (!tbodyMatch) return null;

  const rowMatch = tbodyMatch[1].match(/<tr[^>]*>([\s\S]+?)<\/tr>/);
  if (!rowMatch) return null;

  const row = rowMatch[1];

  // Station name: text between the stationicon </div> and the next <wbr>
  const stationMatch = row.match(/<\/div>([^<]+?)<wbr>/);
  const station = stationMatch?.[1]?.trim();

  // System name: inside <span class="uppercase nowrap">
  const systemMatch = row.match(/<span class="uppercase nowrap">([^<]+)<\/span>/);
  const system = systemMatch?.[1]?.trim();

  // data-order values in column order:
  // [0] station dist (Ls), [1] system dist (Ly), [2] supply, [3] price, [4] updated epoch
  const dataOrders = [...row.matchAll(/data-order="(\d+)"/g)].map(m => parseInt(m[1], 10));

  if (!station || !system || dataOrders.length < 3) return null;

  return { station, system, distanceLy: dataOrders[1], supply: dataOrders[2] };
}

/**
 * Fetch the nearest station from Inara selling the given commodity.
 * @param {string} nameInternal  e.g. "$FoodCartridges_Name;"
 * @param {string} systemName    reference system for distance sorting
 * @returns {Promise<{station:string, system:string, distanceLy:number, supply:number}|null>}
 */
export async function lookupNearestStation(nameInternal, systemName) {
  const id = inaraId(nameInternal);
  if (!id) return null;

  const url = buildUrl(id, systemName);
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    return parseFirstResult(html);
  } catch {
    return null;
  }
}
