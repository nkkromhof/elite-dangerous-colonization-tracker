import { getDb } from '../database.js';

const now = () => new Date().toISOString();

export function createConstruction({ id, system_name, station_name, station_type, market_id, phase = 'scanning', type = 'auto' }) {
  getDb().run(
    `INSERT INTO constructions (id, system_name, station_name, station_type, market_id, phase, type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, system_name ?? null, station_name, station_type ?? null, market_id ?? null, phase, type, now(), now()]
  );
}

export function getConstruction(id) {
  return getDb().query('SELECT * FROM constructions WHERE id = ?').get(id) ?? null;
}

export function getAllConstructions() {
  return getDb().query('SELECT * FROM constructions WHERE is_archived = 0 ORDER BY created_at').all();
}

export function getArchivedConstructions() {
  return getDb().query('SELECT * FROM constructions WHERE is_archived = 1 ORDER BY updated_at DESC').all();
}

export function updateConstructionPhase(id, phase) {
  getDb().run(
    'UPDATE constructions SET phase = ?, updated_at = ? WHERE id = ?',
    [phase, now(), id]
  );
}

export function archiveConstruction(id) {
  getDb().run('UPDATE constructions SET is_archived = 1, updated_at = ? WHERE id = ?', [now(), id]);
}

export function unarchiveConstruction(id) {
  getDb().run('UPDATE constructions SET is_archived = 0, updated_at = ? WHERE id = ?', [now(), id]);
}
