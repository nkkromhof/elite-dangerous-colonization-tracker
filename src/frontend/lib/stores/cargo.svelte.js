let shipCargo = $state([]);
let fcCargo = $state([]);

export function setCargo(data) {
  shipCargo = data.ship || [];
  fcCargo = data.fc || [];
}

export function getShipCargo() {
  return shipCargo;
}

export function getFcCargo() {
  return fcCargo;
}

/**
 * Look up how much of a commodity is in ship and FC cargo.
 * @param {string} name
 * @returns {{ ship: number, fc: number }}
 */
export function getCargoForCommodity(name) {
  const ship = shipCargo.find(c => c.name === name)?.count || 0;
  const fc = fcCargo.find(c => c.name === name)?.count || 0;
  return { ship, fc };
}
