import { getDb } from '../database.js';

const now = () => new Date().toISOString();

export function upsertCommoditySlot({ id, construction_id, name, name_internal, amount_required }) {
  getDb().run(
    `INSERT INTO commodity_slots (id, construction_id, name, name_internal, amount_required, amount_delivered, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT(construction_id, name) DO UPDATE SET
       amount_required = excluded.amount_required,
       name_internal   = excluded.name_internal,
       updated_at      = excluded.updated_at`,
    [id, construction_id, name, name_internal ?? null, amount_required, now()]
  );
}

export function getCommoditySlots(constructionId) {
  return getDb().query('SELECT * FROM commodity_slots WHERE construction_id = ?').all(constructionId);
}

export function getCommoditySlot(constructionId, name) {
  return getDb().query('SELECT * FROM commodity_slots WHERE construction_id = ? AND name = ?').get(constructionId, name);
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
  if (queriedAt === null || queriedAt === undefined) {
    // Transient failure — clear station data but leave nearest_queried_at untouched
    // so _needsLookup() still sees it as unqueried and retries next startup/refresh.
    getDb().run(
      `UPDATE commodity_slots
       SET nearest_station = NULL, nearest_system = NULL, nearest_supply = NULL
       WHERE construction_id = ? AND name = ?`,
      [constructionId, commodityName]
    );
  } else {
    getDb().run(
      `UPDATE commodity_slots
       SET nearest_station = ?, nearest_system = ?, nearest_supply = ?, nearest_queried_at = ?
       WHERE construction_id = ? AND name = ?`,
      [station ?? null, system ?? null, supply ?? null, queriedAt, constructionId, commodityName]
    );
  }
}

export function clearFailedStationLookups(constructionId) {
  getDb().run(
    `UPDATE commodity_slots SET nearest_queried_at = NULL WHERE construction_id = ? AND nearest_station IS NULL`,
    [constructionId]
  );
}

export function recordDelivery({ id, construction_id, commodity_name, amount, source }) {
  getDb().run(
    `INSERT INTO deliveries (id, construction_id, commodity_name, amount, source, delivered_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, construction_id, commodity_name, amount, source ?? null, now()]
  );
}

export function getDeliveries(constructionId) {
  return getDb().query('SELECT * FROM deliveries WHERE construction_id = ? ORDER BY delivered_at').all(constructionId);
}

export function saveCargoState(shipCargo, fcCargo) {
  try {
    getDb().run(
      `INSERT INTO cargo_state (id, ship_cargo, fc_cargo, updated_at)
       VALUES ('singleton', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET ship_cargo = excluded.ship_cargo, fc_cargo = excluded.fc_cargo, updated_at = excluded.updated_at`,
      [JSON.stringify(shipCargo), JSON.stringify(fcCargo), now()]
    );
  } catch (e) {
    getDb().run(
      `INSERT OR REPLACE INTO cargo_state (id, ship_cargo, fc_cargo, updated_at) VALUES ('singleton', '[]', '[]', ?)`,
      [now()]
    );
  }
}

export function loadCargoState() {
  const row = getDb().query("SELECT * FROM cargo_state WHERE id = 'singleton'").get();
  if (!row) return { ship: [], fc: [] };
  try {
    return { ship: JSON.parse(row.ship_cargo), fc: JSON.parse(row.fc_cargo) };
  } catch {
    return { ship: [], fc: [] };
  }
}

export function saveJournalState(filePath, byteOffset) {
  getDb().run(
    `INSERT INTO journal_state (id, file_path, byte_offset, updated_at)
     VALUES ('singleton', ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET file_path = excluded.file_path, byte_offset = excluded.byte_offset, updated_at = excluded.updated_at`,
    [filePath, byteOffset, now()]
  );
}

export function loadJournalState() {
  const row = getDb().query("SELECT * FROM journal_state WHERE id = 'singleton'").get();
  return row ? { filePath: row.file_path, byteOffset: row.byte_offset } : { filePath: null, byteOffset: 0 };
}
