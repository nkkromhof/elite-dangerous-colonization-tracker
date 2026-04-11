import { getDb } from '../database.js';
import { randomUUID } from 'crypto';

const now = () => new Date().toISOString();

export function saveCargoItems(location, items) {
  const db = getDb();
  db.run(`DELETE FROM cargo_items WHERE location = ?`, [location]);
  const insert = db.prepare(
    `INSERT INTO cargo_items (id, location, commodity_ref, name, count, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const item of items) {
    const commodityRef = item.name_internal ?? item.commodity_ref ?? null;
    insert.run(randomUUID(), location, commodityRef, item.name, item.count, now());
  }
}

export function loadCargoItems() {
  const db = getDb();
  const shipRows = db.query(`SELECT name, count FROM cargo_items WHERE location = 'ship'`).all();
  const fcRows = db.query(`SELECT name, count FROM cargo_items WHERE location = 'fc'`).all();
  return {
    ship: shipRows.map(r => ({ name: r.name, count: r.count })),
    fc: fcRows.map(r => ({ name: r.name, count: r.count })),
  };
}

export function saveCargoState(shipCargo, fcCargo) {
  saveCargoItems('ship', shipCargo);
  saveCargoItems('fc', fcCargo);
}

export function loadCargoState() {
  return loadCargoItems();
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
