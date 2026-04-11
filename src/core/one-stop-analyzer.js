/**
 * One-stop shopping analyzer — assigns construction commodities to stations.
 *
 * Uses a greedy set-cover algorithm to find the fewest stations that supply
 * all needed commodities. The algorithm runs two passes:
 *
 * Pass 1 (strict): Only assign commodities to stations where the supply is
 * at least SUPPLY_MULTIPLIER × the remaining demand. This avoids sending
 * the player to a station that will run out before they fill their hold.
 * Stations are sorted by coverage count (desc) then distance (asc), so
 * we prefer nearby stations that cover the most commodities.
 *
 * Pass 2 (fallback): Any commodity still unassigned gets the station with
 * the highest absolute supply, regardless of the multiplier. These are
 * flagged as lowSupply so the UI can warn the player.
 *
 * @param {Object} params
 * @param {Array<{name: string, name_internal: string, amount_required: number, amount_delivered: number}>} params.neededSlots
 *   Commodity slots that still need deliveries (remaining > 0).
 * @param {Map<string, {station: string, system: string, distanceLy: number, commodities: Map<string, number|null>}>} params.stationMap
 *   Candidate stations and the commodities they sell (from commodity_station_results cache).
 * @param {number} [params.supplyMultiplier=3]
 *   Minimum supply-to-demand ratio for Pass 1.
 * @returns {{ assignments: Map<string, {station: string, system: string, supply: number|null, lowSupply: boolean}>, unassigned: string[] }}
 */
export function analyzeOneStop({ neededSlots, stationMap, supplyMultiplier = 3 }) {
  if (stationMap.size === 0) {
    return {
      assignments: new Map(),
      unassigned: neededSlots.map(s => s.name_internal),
    };
  }

  const nameInternals = neededSlots.map(s => s.name_internal);

  // Build remaining amounts per commodity
  const remainingAmounts = new Map();
  for (const slot of neededSlots) {
    remainingAmounts.set(slot.name_internal, slot.amount_required - slot.amount_delivered);
  }

  // For each station, determine which commodities it can cover under the
  // strict supply rule (supply >= multiplier × demand)
  const stationCandidates = [];
  for (const [key, info] of stationMap) {
    const covered3x = [];
    for (const [nameInternal, supply] of info.commodities) {
      if (!remainingAmounts.has(nameInternal)) continue;
      const required = remainingAmounts.get(nameInternal);
      if (supply != null && supply >= supplyMultiplier * required) {
        covered3x.push(nameInternal);
      }
    }
    stationCandidates.push({
      key,
      station: info.station,
      system: info.system,
      distanceLy: info.distanceLy,
      covered3x,
    });
  }

  const assignments = new Map();
  const assigned = new Set();

  // Sort: most 3x-covered commodities first, then closest
  stationCandidates.sort((a, b) => {
    if (b.covered3x.length !== a.covered3x.length) return b.covered3x.length - a.covered3x.length;
    return a.distanceLy - b.distanceLy;
  });

  // ── Pass 1: Greedy set-cover with strict supply rule ──────────────────
  for (const candidate of stationCandidates) {
    const unassigned = candidate.covered3x.filter(n => !assigned.has(n));
    if (unassigned.length === 0) continue;

    for (const nameInternal of unassigned) {
      const supply = stationMap.get(candidate.key).commodities.get(nameInternal);
      assignments.set(nameInternal, {
        station: candidate.station,
        system: candidate.system,
        supply,
        lowSupply: false,
      });
      assigned.add(nameInternal);
    }
  }

  // ── Pass 2: Fallback for commodities the strict rule couldn't assign ──
  const stillUnassigned = nameInternals.filter(n => !assigned.has(n) && remainingAmounts.has(n));
  for (const nameInternal of stillUnassigned) {
    let bestStation = null;
    let bestSupply = -1;
    let bestDistance = Infinity;

    for (const [key, info] of stationMap) {
      if (!info.commodities.has(nameInternal)) continue;
      const rawSupply = info.commodities.get(nameInternal);
      const supply = rawSupply ?? 0;
      if (supply > bestSupply || (supply === bestSupply && info.distanceLy < bestDistance)) {
        bestStation = { key, station: info.station, system: info.system, supply: rawSupply, distanceLy: info.distanceLy };
        bestSupply = supply;
        bestDistance = info.distanceLy;
      }
    }

    if (bestStation) {
      assignments.set(nameInternal, {
        station: bestStation.station,
        system: bestStation.system,
        supply: bestStation.supply,
        lowSupply: true,
      });
      assigned.add(nameInternal);
    }
  }

  return {
    assignments,
    unassigned: nameInternals.filter(n => !assigned.has(n)),
  };
}
