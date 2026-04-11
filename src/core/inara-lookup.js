import { INARA_COMMODITY_IDS } from '../../public/inara-commodity-ids.js';
import { config } from '../config.js';
import { logger } from './logger.js';

const TAG = 'InaraLookup';

const SEARCH_RANGE_LY = 500;

const BASE_HEADERS = {
  'User-Agent':                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
  'Accept':                    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language':           'en-US,en;q=0.9',
  'Accept-Encoding':           'gzip, deflate, br',
  'Cache-Control':             'max-age=0',
  'Referer':                   'https://inara.cz/elite/commodities/',
  'Upgrade-Insecure-Requests': '1',
  'DNT':                       '1',
};

// In-memory cookie jar — persists across all requests for the lifetime of the process.
// Pre-seed with the user's Inara login cookie if configured.
if (config.inaraUserCookie) {
  logger.info(TAG, `INARA_USER_COOKIE loaded (length=${config.inaraUserCookie.length}, value=${config.inaraUserCookie})`);
} else {
  logger.warn(TAG, `INARA_USER_COOKIE not set — anonymous requests may be rate-limited`);
}
// inarasite=1 signals to Inara that this client has already passed the JS challenge.
// Without it, every request receives the challenge page (HTTP 503) instead of results.
let _cookieJar = config.inaraUserCookie
  ? `inarasite=1; __Host-InaraUser=${config.inaraUserCookie}`
  : 'inarasite=1';

function _updateCookies(resp) {
  // getSetCookie() returns each Set-Cookie header as a separate string, correctly
  // handling cookies whose values or attributes contain commas (e.g. expires dates).
  const cookies = typeof resp.headers.getSetCookie === 'function'
    ? resp.headers.getSetCookie()
    : (resp.headers.get('set-cookie') ?? '').split(/,(?=[^ ])/).map(s => s.trim()).filter(Boolean);

  for (const cookieStr of cookies) {
    const nameValue = cookieStr.split(';')[0].trim();
    if (!nameValue.includes('=')) continue;
    const [name] = nameValue.split('=');
    // Replace existing value for this cookie name, or append
    const existing = _cookieJar
      .split('; ')
      .filter(c => c && !c.startsWith(name + '='))
      .join('; ');
    _cookieJar = existing ? `${existing}; ${nameValue}` : nameValue;
  }
  if (cookies.length > 0) logger.debug(TAG, `Cookie jar: ${_cookieJar}`);
}

function _headers() {
  return _cookieJar ? { ...BASE_HEADERS, 'Cookie': _cookieJar } : BASE_HEADERS;
}

function inaraId(nameInternal) {
  if (!nameInternal) return null;
  const symbol = nameInternal.replace(/^\$/, '').replace(/_[Nn]ame;$/, '').toLowerCase();
  return INARA_COMMODITY_IDS[symbol] ?? null;
}

function buildUrl(ids, systemName) {
  // Parameter list mirrors the full form submission a browser sends, including all
  // default/zero-value fields.  Inara appears to validate the presence of these.
  const params = new URLSearchParams({
    formbrief: '1',
    pi1:  '1',   // sell listings (not buy orders)
    pi3:  '3',   // sort by distance
    pi4:  '0',
    pi5:  String(SEARCH_RANGE_LY),
    pi7:  '0',
    pi8:  '0',
    pi9:  '0',
    pi10: '3',
    pi11: '0',
    pi12: '0',
    pi13: '1',   // include fleet carriers
    pi14: '0',
    ps1:  systemName,
    ps3:  '',
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
 * Inara serves a JS challenge page (HTTP 503) to unknown clients.
 * The page embeds a one-time token; clicking "Confirm" POSTs it to
 * /validatechallenge.php, which sets a validated-session cookie and returns 200.
 * We replicate that POST here so we can proceed without a real browser.
 *
 * @param {string} html  The 503 challenge page body
 * @returns {Promise<boolean>} true if validation succeeded
 */
async function _solveChallenge(html) {
  const tokenMatch = html.match(/encodeURIComponent\('([a-f0-9]{32})'\)/);
  if (!tokenMatch) {
    logger.warn(TAG, 'Challenge: could not extract token from page');
    return false;
  }
  const token = tokenMatch[1];
  const ts    = Date.now();
  const cf    = Math.floor(Math.random() * 10000);
  const body  = `challenge=${encodeURIComponent(token)}&ts=${ts}&cf=${cf}`;

  logger.info(TAG, `Challenge: solving token=${token} ts=${ts} cf=${cf}`);
  try {
    const resp = await fetch('https://inara.cz/validatechallenge.php', {
      method: 'POST',
      headers: {
        ..._headers(),
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Origin':       'https://inara.cz',
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    _updateCookies(resp);
    logger.info(TAG, `Challenge: status=${resp.status} cookie=${_cookieJar}`);
    return resp.ok;
  } catch (err) {
    logger.warn(TAG, `Challenge: request failed: ${err?.message ?? err}`);
    return false;
  }
}

/**
 * Fetch all stations from Inara selling the given commodity near a reference system.
 * @param {string} nameInternal  e.g. "$FoodCartridges_Name;"
 * @param {string} systemName    reference system for distance sorting
 * @returns {Promise<{ data: Array<{station:string,system:string,distanceLy:number,supply:number|null}>, transient: boolean }>}
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
  logger.info(TAG, `REQUEST url=${url}`);
  logger.info(TAG, `REQUEST cookie=${_cookieJar || '(none)'}`);
  try {
    let resp = await fetch(url, {
      headers: _headers(),
      signal: AbortSignal.timeout(15_000),
    });
    _updateCookies(resp);
    logger.info(TAG, `RESPONSE status=${resp.status}`);

    // Inara serves a JS challenge page (HTTP 503) to unrecognised clients.
    // Solve it by POSTing the embedded token, then retry once.
    if (resp.status === 503) {
      const body503 = await resp.text();
      if (body503.includes('challenge-container')) {
        const solved = await _solveChallenge(body503);
        if (solved) {
          logger.info(TAG, 'Challenge solved — retrying request');
          resp = await fetch(url, { headers: _headers(), signal: AbortSignal.timeout(15_000) });
          _updateCookies(resp);
          logger.info(TAG, `Post-challenge RESPONSE status=${resp.status}`);
        } else {
          logger.warn(TAG, 'Challenge failed — will retry later');
          return { data: null, transient: true };
        }
      } else {
        logger.warn(TAG, `503 (non-challenge): ${body503.slice(0, 500)}`);
        return { data: null, transient: true };
      }
    }

    if (!resp.ok) {
      const body = await resp.text();
      logger.warn(TAG, `RESPONSE body:\n${body}`);
      const transient = isTransientStatus(resp.status);
      return { data: null, transient };
    }
    const html = await resp.text();
    const rows = parseAllRows(html);
    if (rows.length === 0) {
      logger.info(TAG, `No results for ${nameInternal} near ${systemName}`);
      return { data: [], transient: false };
    }
    const results = rows.map(({ station, system, distanceLy, supply }) => ({ station, system, distanceLy, supply }));
    logger.info(TAG, `${nameInternal} → ${results.length} stations, nearest: ${results[0].station} / ${results[0].system} (${results[0].distanceLy} ly, supply ${results[0].supply})`);
    return { data: results, transient: false };
  } catch (err) {
    logger.warn(TAG, `Fetch failed for ${nameInternal}: ${err?.message ?? err}`);
    return { data: null, transient: true };
  }
}
