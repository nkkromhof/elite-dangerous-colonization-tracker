import { getDb } from '../database.js';

const now = () => new Date().toISOString();

export function createConstruction({ id, system_name, station_name, station_type, market_id, phase = 'scanning' }) {
  getDb().run(
    `INSERT INTO constructions (id, system_name, station_name, station_type, market_id, phase, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, system_name, station_name, station_type ?? null, market_id ?? null, phase, now(), now()]
  );
}

export function getConstruction(id) {
  return getDb().query('SELECT * FROM constructions WHERE id = ?').get(id) ?? null;
}

export function getAllConstructions() {
  return getDb().query('SELECT * FROM constructions ORDER BY created_at').all();
}

export function updateConstructionPhase(id, phase) {
  getDb().run(
    'UPDATE constructions SET phase = ?, updated_at = ? WHERE id = ?',
    [phase, now(), id]
  );
}

export function deleteConstruction(id) {
  getDb().run('DELETE FROM constructions WHERE id = ?', [id]);
}
