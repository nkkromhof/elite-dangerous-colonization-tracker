let currentStation = $state(null);

export function setStation(data) {
  currentStation = data;
}

export function clearStation() {
  currentStation = null;
}

export function getStation() {
  return currentStation;
}

/**
 * Check if a commodity is available at the currently docked station.
 * @param {string} name
 * @returns {boolean}
 */
export function isAvailableAtStation(name) {
  return currentStation?.availableCommodities?.includes(name) ?? false;
}
