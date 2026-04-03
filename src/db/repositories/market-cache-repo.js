import { getDb } from '../database.js';

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
  getDb().run(
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
}

/**
 * Find all cached stations that sell a given commodity (by nameInternal),
 * recorded within maxAgeDays and with known coordinates.
 * Returns rows sorted by distance to (tx, ty, tz) ascending, distance included.
 *
 * @param {string} nameInternal
 * @param {number} maxAgeDays
 * @returns {{ marketId, stationName, stationType, systemName, stock, distanceLy, recordedAt }[]}
 */
export function findCachedStationsForCommodity(nameInternal, maxAgeDays, tx, ty, tz) {
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString();
  const rows = getDb().query(
    `SELECT market_id, station_name, station_type, system_name, x, y, z, inventory, recorded_at
     FROM station_market_cache
     WHERE recorded_at > ? AND x IS NOT NULL`
  ).all(cutoff);

  const results = [];
  for (const row of rows) {
    let inv;
    try { inv = JSON.parse(row.inventory); } catch { continue; }
    const entry = inv.find(i => i.nameInternal === nameInternal);
    if (!entry || entry.stock <= 0) continue;
    const dx = row.x - tx, dy = row.y - ty, dz = row.z - tz;
    const distanceLy = Math.sqrt(dx * dx + dy * dy + dz * dz);
    results.push({
      marketId: row.market_id,
      stationName: row.station_name,
      stationType: row.station_type,
      systemName: row.system_name,
      stock: entry.stock,
      distanceLy,
      recordedAt: row.recorded_at,
    });
  }
  results.sort((a, b) => a.distanceLy - b.distanceLy);
  return results;
}
