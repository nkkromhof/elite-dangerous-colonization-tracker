const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * Fetch the full application state snapshot.
 */
export async function fetchState() {
  const res = await fetch('/api/state');
  return res.json();
}

/**
 * Fetch a single construction by ID.
 */
export async function fetchConstruction(id) {
  const res = await fetch(`/api/constructions/${id}`);
  return res.json();
}

/**
 * Fetch all constructions including archived ones.
 */
export async function fetchArchivedConstructions() {
  const res = await fetch('/api/constructions?include_archived=true');
  return res.json();
}

/**
 * Archive a construction (soft delete).
 */
export async function archiveConstruction(id) {
  return fetch(`/api/constructions/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ archived: true }),
  });
}

/**
 * Unarchive (restore) a construction.
 */
export async function unarchiveConstruction(id) {
  return fetch(`/api/constructions/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ archived: false }),
  });
}

/**
 * Update fleet carrier cargo count for a commodity.
 */
export async function updateFcCargo(commodityName, count) {
  return fetch('/api/cargo/fc', {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ commodityName, count }),
  });
}

/**
 * Trigger a station lookup refresh for a construction.
 */
export async function refreshStations(constructionId) {
  const res = await fetch(`/api/constructions/${constructionId}/refresh-stations`, {
    method: 'POST',
  });
  return res.json();
}

/**
 * Create a manual construction site.
 * @param {{ station_name: string }} params
 */
export async function createConstruction({ station_name }) {
  const res = await fetch('/api/constructions', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ station_name, type: 'manual', phase: 'collection' }),
  });
  return res.json();
}

/**
 * Fetch the full list of known ED commodities for the picker.
 * @returns {Promise<Array<{name: string, name_internal: string}>>}
 */
export async function fetchCommodities() {
  const res = await fetch('/api/commodities');
  return res.json();
}

/**
 * Set the required amount for a commodity slot (upserts the slot).
 */
export async function setCommodityRequired(constructionId, name, amount_required) {
  return fetch(`/api/constructions/${constructionId}/commodities/${encodeURIComponent(name)}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ amount_required }),
  });
}

/**
 * Increment (or decrement) the delivered amount for a commodity slot.
 * Pass a positive delta to record delivery, negative to correct an over-count.
 */
export async function setCommodityDelivered(constructionId, name, delta) {
  return fetch(`/api/constructions/${constructionId}/commodities/${encodeURIComponent(name)}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ amount_delivered: delta }),
  });
}

/**
 * Delete a commodity slot from a manual construction.
 */
export async function deleteCommoditySlot(constructionId, name) {
  return fetch(`/api/constructions/${constructionId}/commodities/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
}
