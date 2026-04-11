import { getDb } from '../database.js';
import { COMMODITY_CATEGORIES } from '../../core/commodity-categories.js';
import { COMMODITY_DISPLAY_NAMES } from '../../../public/inara-commodity-ids.js';

const now = () => new Date().toISOString();

function nameFromInternal(nameInternal) {
  if (!nameInternal) return '';
  const key = nameInternal.replace(/^\$/, '').replace(/_[Nn]ame;$/, '').toLowerCase();
  if (COMMODITY_DISPLAY_NAMES[key]) return COMMODITY_DISPLAY_NAMES[key];
  // Fallback: capitalize first letter only (handles unknown future commodities)
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function inaraIdFromInternal(nameInternal) {
  if (!nameInternal) return null;
  return nameInternal.replace(/^\$/, '').replace(/_[Nn]ame;$/, '').toLowerCase();
}

export function upsertCommodity({ name_internal, name, category, inara_id }) {
  const displayName = name || nameFromInternal(name_internal);
  const computedInaraId = inara_id || inaraIdFromInternal(name_internal);
  getDb().run(
    `INSERT INTO commodities (name_internal, name, category, inara_id, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(name_internal) DO UPDATE SET
       name       = COALESCE(excluded.name, commodities.name),
       category   = COALESCE(excluded.category, commodities.category),
       inara_id   = COALESCE(excluded.inara_id, commodities.inara_id),
       updated_at = excluded.updated_at`,
    [name_internal, displayName, category ?? null, computedInaraId, now()]
  );
}

export function getCommodity(nameInternal) {
  return getDb().query('SELECT * FROM commodities WHERE name_internal = ?').get(nameInternal) ?? null;
}

export function getAllCommodities() {
  return getDb().query('SELECT * FROM commodities ORDER BY name').all();
}

export function seedCommoditiesFromCategories() {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO commodities (name_internal, name, category, inara_id, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(name_internal) DO UPDATE SET
       category   = excluded.category,
       inara_id   = excluded.inara_id,
       updated_at = excluded.updated_at`
  );
  for (const [symbol, category] of Object.entries(COMMODITY_CATEGORIES)) {
    const nameInternal = `$${symbol}_Name;`;
    const displayName = nameFromInternal(nameInternal);
    const inaraId = symbol;
    insert.run(nameInternal, displayName, category, inaraId, now());
  }
}
