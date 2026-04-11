/**
 * Strip the "System: " prefix from station names.
 * @param {string|null|undefined} name
 * @returns {string}
 */
export function parseStationName(name) {
  if (!name) return '';
  const idx = name.indexOf(':');
  return idx !== -1 ? name.substring(idx + 1).trimStart() : name;
}

/**
 * Insert spaces before capital letters in camelCase type strings.
 * @param {string|null|undefined} type
 * @returns {string}
 */
export function formatStationType(type) {
  if (!type) return '';
  return type.replace(/([a-z])([A-Z])/g, '$1 $2');
}

/**
 * @param {{ amount_delivered: number, amount_required: number }} commodity
 * @returns {boolean}
 */
export function isCommodityComplete(commodity) {
  return commodity.amount_delivered >= commodity.amount_required;
}

/**
 * Check if a commodity's nearest station has low supply relative to demand.
 * @param {{ nearest_supply: number|null, amount_required: number, amount_delivered: number }} commodity
 * @returns {boolean}
 */
export function isLowSupply(commodity) {
  if (commodity.nearest_supply == null) return false;
  const remaining = commodity.amount_required - commodity.amount_delivered;
  if (remaining <= 0) return false;
  return commodity.nearest_supply <= 3 * remaining;
}
