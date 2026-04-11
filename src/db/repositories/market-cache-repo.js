import { getDb } from '../database.js';
import { fetchStationMarket, parseMarketData } from '../../core/spansh-lookup.js';
import { logger } from '../../core/logger.js';

const now = () => new Date().toISOString();

// ── System coordinates ────────────────────────────────────────────────────────

export function upsertSystemCoordinates(systemName, x, y, z) {
  getDb().run(
    `INSERT INTO system_coordinates (system_name, x, y, z, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(system_name) DO UPDATE SET x = excluded.x, y = excluded.y, z = excluded.z, updated_at = excluded.updated_at`,
    [systemName, x, y, z, now()]
  );
}

export function getSystemCoordinates(systemName) {
  return getDb().query('SELECT x, y, z FROM system_coordinates WHERE system_name = ?').get(systemName) ?? null;
}

// ── Station market cache ──────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {number} opts.marketId
 * @param {string} opts.stationName
 * @param {string|null} opts.stationType
 * @param {string} opts.systemName
 * @param {number|null} opts.x
 * @param {number|null} opts.y
 * @param {number|null} opts.z
 * @param {{ nameInternal: string, name: string, stock: number }[]} opts.inventory  only items with stock > 0
 * @param {string} [opts.recordedAt]
 */
export function upsertStationMarket({ marketId, stationName, stationType, systemName, x, y, z, inventory, recordedAt }) {
  const db = getDb();
  db.run(
    `INSERT INTO station_market_cache (market_id, station_name, station_type, system_name, x, y, z, inventory, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(market_id) DO UPDATE SET
       station_name = excluded.station_name,
       station_type = excluded.station_type,
       system_name  = excluded.system_name,
       x = excluded.x, y = excluded.y, z = excluded.z,
       inventory    = excluded.inventory,
       recorded_at  = excluded.recorded_at`,
    [marketId, stationName, stationType ?? null, systemName, x ?? null, y ?? null, z ?? null,
     JSON.stringify(inventory), recordedAt ?? now()]
  );

  // Rebuild the inventory index for this station
  db.run(`DELETE FROM market_inventory_index WHERE market_id = ?`, [marketId]);
  const insert = db.prepare(
    `INSERT INTO market_inventory_index (market_id, name_internal, stock) VALUES (?, ?, ?)`
  );
  for (const item of inventory) {
    if (item.stock > 0) insert.run(marketId, item.nameInternal, item.stock);
  }
}

/**
 * Find all cached stations that sell a given commodity (by nameInternal),
 * recorded within maxAgeDays and with known coordinates.
 * Returns rows sorted by distance to (tx, ty, tz) ascending, distance included.
 *
 * @param {string} nameInternal
 * @param {number} maxAgeDays
 * @param {number} tx  target x coordinate
 * @param {number} ty  target y coordinate
 * @param {number} tz  target z coordinate
 * @param {number|null} [excludeMarketId]  market ID to exclude (e.g. player's own carrier)
 * @returns {{ marketId, stationName, stationType, systemName, stock, distanceLy, recordedAt }[]}
 */
/**
 * Update market data for a specific station by fetching from Spansh API
 * @param {number} marketId - The market ID of the station to update
 * @returns {Promise<boolean>} - True if update was successful
 */
export async function updateStationMarketFromSpansh(marketId) {
  const { data, transient } = await fetchStationMarket(marketId);
  
  if (transient) {
    logger.warn('MarketCacheRepo', `Transient error fetching market data for marketId ${marketId}`);
    return false;
  }
  
  if (!data) {
    logger.warn('MarketCacheRepo', `No market data returned for marketId ${marketId}`);
    return false;
  }
  
  // Extract required fields from Spansh response
  const { stationName, stationType, systemName, position, commodities } = data;
  
  if (!stationName || !systemName || !position) {
    logger.warn('MarketCacheRepo', `Incomplete station data for marketId ${marketId}`);
    return false;
  }
  
  // Parse commodities data
  const inventory = parseMarketData(data);
  
  // Upsert to local cache
  upsertStationMarket({
    marketId,
    stationName,
    stationType: stationType ?? null,
    systemName,
    x: position.x,
    y: position.y,
    z: position.z,
    inventory,
    recordedAt: new Date().toISOString()
  });
  
  logger.info('MarketCacheRepo', `Updated market data for ${stationName} (marketId: ${marketId}) with ${inventory.length} commodities`);
  return true;
}

export function findCachedStationsForCommodity(nameInternal, maxAgeDays, tx, ty, tz, excludeMarketId = null) {
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString();
  const rows = getDb().query(
    `SELECT s.market_id, s.station_name, s.station_type, s.system_name,
            s.x, s.y, s.z, s.recorded_at, i.stock
     FROM market_inventory_index i
     JOIN station_market_cache s ON s.market_id = i.market_id
     WHERE i.name_internal = ?
       AND i.stock > 0
       AND s.recorded_at > ?
       AND s.x IS NOT NULL
       AND (s.station_type IS NULL OR s.station_type != 'FleetCarrier')
       ${excludeMarketId != null ? 'AND s.market_id != ?' : ''}`
  ).all(...[nameInternal, cutoff, ...(excludeMarketId != null ? [excludeMarketId] : [])]);

  const results = rows.map(row => {
    const dx = row.x - tx, dy = row.y - ty, dz = row.z - tz;
    return {
      marketId: row.market_id,
      stationName: row.station_name,
      stationType: row.station_type,
      systemName: row.system_name,
      stock: row.stock,
      distanceLy: Math.sqrt(dx * dx + dy * dy + dz * dz),
      recordedAt: row.recorded_at,
    };
  });
  results.sort((a, b) => a.distanceLy - b.distanceLy);
  return results;
}

// ── Commodity station results cache ──────────────────────────────────────────

const CSR_MAX_AGE_HOURS = 24;

/**
 * Get all cached station results for a commodity near a reference system.
 * Returns null if no results exist or they are stale (older than maxAgeHours).
 *
 * @param {string} nameInternal
 * @param {string} referenceSystem
 * @param {number} [maxAgeHours=24]
 * @returns {{ station: string, system: string, distanceLy: number, supply: number|null, queriedAt: string }[] | null}
 */
export function getCachedStationResults(nameInternal, referenceSystem, maxAgeHours = CSR_MAX_AGE_HOURS) {
  const db = getDb();
  const row = db.query(
    `SELECT MAX(queried_at) AS latest FROM commodity_station_results
     WHERE name_internal = ? AND reference_system = ?`
  ).get(nameInternal, referenceSystem);

  if (!row || !row.latest) return null;

  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();
  if (row.latest < cutoff) return null;

  return db.query(
    `SELECT station, system, distance_ly AS distanceLy, supply, queried_at AS queriedAt
     FROM commodity_station_results
     WHERE name_internal = ? AND reference_system = ? AND queried_at = ?
     ORDER BY distance_ly`
  ).all(nameInternal, referenceSystem, row.latest);
}

/**
 * Replace all cached station results for a commodity near a reference system.
 * Deletes old rows and inserts new ones in a transaction.
 *
 * @param {string} nameInternal
 * @param {string} referenceSystem
 * @param {{ station: string, system: string, distanceLy: number, supply: number|null }[]} rows
 * @param {string} queriedAt
 */
export function replaceStationResults(nameInternal, referenceSystem, rows, queriedAt) {
  const db = getDb();
  db.run(
    `DELETE FROM commodity_station_results
     WHERE name_internal = ? AND reference_system = ?`,
    [nameInternal, referenceSystem]
  );

  const insert = db.prepare(
    `INSERT INTO commodity_station_results (name_internal, reference_system, station, system, distance_ly, supply, queried_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (const r of rows) {
    insert.run(nameInternal, referenceSystem, r.station, r.system, r.distanceLy, r.supply, queriedAt);
  }
}

/**
 * Get all station results for multiple commodities near a reference system.
 * Returns a map keyed by "station|system" containing the station info and
 * which commodities it sells (with supply).
 *
 * @param {string[]} nameInternals
 * @param {string} referenceSystem
 * @param {number} [maxAgeHours=24]
 * @returns {Map<string, { station: string, system: string, distanceLy: number, commodities: Map<string, number|null> }>}
 */
export function getStationResultsForCommodities(nameInternals, referenceSystem, maxAgeHours = CSR_MAX_AGE_HOURS) {
  const db = getDb();
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();

  const placeholders = nameInternals.map(() => '?').join(',');
  const rows = db.query(
    `SELECT name_internal, station, system, distance_ly, supply
     FROM commodity_station_results
     WHERE name_internal IN (${placeholders})
       AND reference_system = ?
       AND queried_at > ?
     ORDER BY distance_ly`
  ).all(...nameInternals, referenceSystem, cutoff);

  const stationMap = new Map();
  for (const row of rows) {
    const key = `${row.station}|${row.system}`;
    if (!stationMap.has(key)) {
      stationMap.set(key, {
        station: row.station,
        system: row.system,
        distanceLy: row.distance_ly,
        commodities: new Map(),
      });
    }
    stationMap.get(key).commodities.set(row.name_internal, row.supply);
  }
  return stationMap;
}

/**
 * Delete stale commodity_station_results rows older than maxAgeHours.
 * @param {number} [maxAgeHours=24]
 */
export function findAvailableNeededCommodities(marketId) {
  const rows = getDb().query(
    `SELECT DISTINCT cs.name
     FROM market_inventory_index mi
     JOIN commodity_slots cs ON mi.name_internal = cs.name_internal
     JOIN constructions c ON cs.construction_id = c.id
     WHERE mi.market_id = ?
       AND mi.stock > 0
       AND cs.amount_delivered < cs.amount_required
       AND c.is_archived = 0`,
  ).all(marketId);
  return rows.map(r => r.name);
}

export function purgeStaleStationResults(maxAgeHours = CSR_MAX_AGE_HOURS) {
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();
  const db = getDb();
  db.run(`DELETE FROM commodity_station_results WHERE queried_at < ?`, [cutoff]);
}
