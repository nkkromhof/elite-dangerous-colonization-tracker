import { getDb } from '../database.js';
import { upsertCommodity } from './commodity-repo.js';

const now = () => new Date().toISOString();

export function upsertCommoditySlot({ id, construction_id, name, name_internal, commodity_ref, amount_required }) {
  const ref = commodity_ref ?? name_internal ?? null;
  if (ref) {
    upsertCommodity({ name_internal: ref, name });
  }
  getDb().run(
    `INSERT INTO commodity_slots (id, construction_id, name, name_internal, commodity_ref, amount_required, amount_delivered, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT(construction_id, name) DO UPDATE SET
       amount_required = excluded.amount_required,
       name_internal   = excluded.name_internal,
       commodity_ref   = excluded.commodity_ref,
       updated_at      = excluded.updated_at`,
    [id, construction_id, name, name_internal ?? null, ref, amount_required, now()]
  );
}

export function getCommoditySlots(constructionId) {
  return getDb().query(
    `SELECT cs.*, lc.station AS nearest_station, lc.system AS nearest_system,
            lc.supply AS nearest_supply, lc.queried_at AS nearest_queried_at
     FROM commodity_slots cs
     LEFT JOIN slot_lookup_cache lc ON lc.slot_id = cs.id
     WHERE cs.construction_id = ?`
  ).all(constructionId);
}

export function getCommoditySlot(constructionId, name) {
  return getDb().query(
    `SELECT cs.*, lc.station AS nearest_station, lc.system AS nearest_system,
            lc.supply AS nearest_supply, lc.queried_at AS nearest_queried_at
     FROM commodity_slots cs
     LEFT JOIN slot_lookup_cache lc ON lc.slot_id = cs.id
     WHERE cs.construction_id = ? AND cs.name = ?`
  ).get(constructionId, name);
}

export function incrementDelivered(constructionId, commodityName, amount) {
  const result = getDb().run(
    `UPDATE commodity_slots
     SET amount_delivered = amount_delivered + ?, updated_at = ?
     WHERE construction_id = ? AND name = ?`,
    [amount, now(), constructionId, commodityName]
  );
  if (result.changes === 0) return false;
  return true;
}

export function setDelivered(constructionId, commodityName, amount) {
  getDb().run(
    `UPDATE commodity_slots
     SET amount_delivered = ?, updated_at = ?
     WHERE construction_id = ? AND name = ?`,
    [amount, now(), constructionId, commodityName]
  );
}

export function updateNearestStation(constructionId, commodityName, { station, system, supply, queriedAt }) {
  const slot = getDb().query(
    `SELECT id FROM commodity_slots WHERE construction_id = ? AND name = ?`
  ).get(constructionId, commodityName);
  if (!slot) return;
  upsertLookupCache(slot.id, { station, system, supply, queriedAt });
}

export function clearFailedStationLookups(constructionId) {
  clearLookupCacheFailed(constructionId);
}

export function clearAllStationLookups(constructionId) {
  clearLookupCacheAll(constructionId);
}

export function upsertLookupCache(slotId, { station, system, supply, queriedAt }) {
  const db = getDb();
  if (queriedAt === null || queriedAt === undefined) {
    db.run(
      `INSERT INTO slot_lookup_cache (slot_id, station, system, supply, queried_at)
       VALUES (?, NULL, NULL, NULL, NULL)
       ON CONFLICT(slot_id) DO UPDATE SET station = NULL, system = NULL, supply = NULL`,
      [slotId]
    );
  } else {
    db.run(
      `INSERT INTO slot_lookup_cache (slot_id, station, system, supply, queried_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(slot_id) DO UPDATE SET station = excluded.station, system = excluded.system, supply = excluded.supply, queried_at = excluded.queried_at`,
      [slotId, station ?? null, system ?? null, supply ?? null, queriedAt]
    );
  }
}

export function getLookupCache(slotId) {
  return getDb().query('SELECT * FROM slot_lookup_cache WHERE slot_id = ?').get(slotId) ?? null;
}

export function clearLookupCacheFailed(constructionId) {
  getDb().run(
    `UPDATE slot_lookup_cache SET queried_at = NULL WHERE slot_id IN (SELECT id FROM commodity_slots WHERE construction_id = ?) AND station IS NULL`,
    [constructionId]
  );
}

export function clearLookupCacheAll(constructionId) {
  getDb().run(
    `DELETE FROM slot_lookup_cache WHERE slot_id IN (SELECT id FROM commodity_slots WHERE construction_id = ?)`,
    [constructionId]
  );
}

export function deleteCommoditySlot(constructionId, name) {
  getDb().run(
    'DELETE FROM commodity_slots WHERE construction_id = ? AND name = ?',
    [constructionId, name]
  );
}
