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
