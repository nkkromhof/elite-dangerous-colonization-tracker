import { INARA_COMMODITY_IDS, COMMODITY_DISPLAY_NAMES } from '../../../public/inara-commodity-ids.js';
import { getDb } from '../../db/database.js';

/**
 * GET /api/commodities
 * Returns all known ED commodities sorted alphabetically.
 * Uses the DB commodities table for display names when available
 * (populated from journal Name_Localised), falls back to capitalising the INARA key.
 */
export function handleCommodityList(req) {
  if (req.method !== 'GET') return new Response('Not Found', { status: 404 });

  const dbNames = new Map(
    getDb().query('SELECT name_internal, name FROM commodities').all()
      .map(r => [r.name_internal, r.name])
  );

  const list = Object.keys(INARA_COMMODITY_IDS)
    .map(key => {
      const dbName = dbNames.get(`$${key}_Name;`);
      const name = dbName || COMMODITY_DISPLAY_NAMES[key] || (key.charAt(0).toUpperCase() + key.slice(1));
      return { name, name_internal: key };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return new Response(JSON.stringify(list), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
