import { getDb } from '../database.js';

const now = () => new Date().toISOString();

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
