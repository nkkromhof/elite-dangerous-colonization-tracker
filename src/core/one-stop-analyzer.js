/**
 * One-stop shopping analyzer — assigns construction commodities to stations.
 *
 * Uses a greedy set-cover algorithm to find the fewest stations that supply
 * all needed commodities. The algorithm runs three passes:
 *
 * Pass 1 (strict): Only assign commodities to stations where the supply is
 * at least supplyMultiplier × the remaining demand, from fresh (non-stale)
 * data. Stations are sorted by coverage count (desc) then distance (asc),
 * so we prefer nearby stations that cover the most commodities.
 *
 * Pass 2 (stale-but-abundant): For commodities still unassigned, consider
 * stale stations where supply >= staleSupplyMultiplier × remaining. These
 * are stations with data older than the fresh window but with overwhelming
 * supply (e.g. millions of units). Sorted by distance ascending so the
 * closest abundant station is preferred.
 *
 * Pass 3 (fallback): Any commodity still unassigned gets the station with
 * the best supply-to-distance score. A station with moderate supply nearby
 * is preferred over a far-away station with high supply. Flagged as
 * lowSupply so the UI can warn the player.
 *
 * @param {Object} params
 * @param {Array<{name: string, name_internal: string, amount_required: number, amount_delivered: number}>} params.neededSlots
 *   Commodity slots that still need deliveries (remaining > 0).
 * @param {Map<string, {station: string, system: string, distanceLy: number, commodities: Map<string, number|null>, isStale?: boolean}>} params.stationMap
 *   Candidate stations and the commodities they sell (from commodity_station_results cache and local market cache).
 * @param {number} [params.supplyMultiplier=3]
 *   Minimum supply-to-demand ratio for Pass 1.
 * @param {number} [params.staleSupplyMultiplier=20]
 *   Minimum supply-to-demand ratio for Pass 2 (stale-but-abundant).
 * @returns {{ assignments: Map<string, {station: string, system: string, supply: number|null, distanceLy: number, lowSupply: boolean, isStale: boolean}>, unassigned: string[] }}
 */
export function analyzeOneStop({ neededSlots, stationMap, supplyMultiplier = 3, staleSupplyMultiplier = 20 }) {
  if (stationMap.size === 0) {
    return {
      assignments: new Map(),
      unassigned: neededSlots.map(s => s.name_internal),
    };
  }

  const nameInternals = neededSlots.map(s => s.name_internal);

  const remainingAmounts = new Map();
  for (const slot of neededSlots) {
    remainingAmounts.set(slot.name_internal, slot.amount_required - slot.amount_delivered);
  }

  const stationCandidates = [];
  for (const [key, info] of stationMap) {
    const covered3x = [];
    const coveredStale = [];
    for (const [nameInternal, supply] of info.commodities) {
      if (!remainingAmounts.has(nameInternal)) continue;
      const required = remainingAmounts.get(nameInternal);
      if (supply != null && supply >= supplyMultiplier * required) {
        if (!info.isStale) {
          covered3x.push(nameInternal);
        }
        coveredStale.push(nameInternal);
      }
    }
    stationCandidates.push({
      key,
      station: info.station,
      system: info.system,
      distanceLy: info.distanceLy,
      isStale: !!info.isStale,
      covered3x,
      coveredStale,
    });
  }

  const assignments = new Map();
  const assigned = new Set();

  stationCandidates.sort((a, b) => {
    if (b.covered3x.length !== a.covered3x.length) return b.covered3x.length - a.covered3x.length;
    return a.distanceLy - b.distanceLy;
  });

  // ── Pass 1: Greedy set-cover with strict supply rule (fresh data only) ──
  for (const candidate of stationCandidates) {
    if (candidate.isStale) continue;
    const unassigned3x = candidate.covered3x.filter(n => !assigned.has(n));
    if (unassigned3x.length === 0) continue;

    for (const nameInternal of unassigned3x) {
      const supply = stationMap.get(candidate.key).commodities.get(nameInternal);
      assignments.set(nameInternal, {
        station: candidate.station,
        system: candidate.system,
        supply,
        distanceLy: candidate.distanceLy,
        lowSupply: false,
        isStale: false,
      });
      assigned.add(nameInternal);
    }
  }

  // ── Pass 2: Stale-but-abundant — accept old data when supply is overwhelming ──
  const staleCandidates = stationCandidates
    .filter(c => c.isStale && c.coveredStale.length > 0)
    .sort((a, b) => a.distanceLy - b.distanceLy);

  for (const candidate of staleCandidates) {
    const unassignedStale = candidate.coveredStale.filter(n => !assigned.has(n));
    if (unassignedStale.length === 0) continue;

    for (const nameInternal of unassignedStale) {
      const supply = stationMap.get(candidate.key).commodities.get(nameInternal);
      const required = remainingAmounts.get(nameInternal);
      if (supply != null && supply >= staleSupplyMultiplier * required) {
        assignments.set(nameInternal, {
          station: candidate.station,
          system: candidate.system,
          supply,
          distanceLy: candidate.distanceLy,
          lowSupply: false,
          isStale: true,
        });
        assigned.add(nameInternal);
      }
    }
  }

  // ── Pass 3: Fallback — best supply-to-distance score ──
  const stillUnassigned = nameInternals.filter(n => !assigned.has(n) && remainingAmounts.has(n));
  for (const nameInternal of stillUnassigned) {
    let bestStation = null;
    let bestScore = -1;
    let bestDistance = Infinity;

    for (const [key, info] of stationMap) {
      if (!info.commodities.has(nameInternal)) continue;
      const rawSupply = info.commodities.get(nameInternal);
      const supply = rawSupply ?? 0;
      const score = supply / (info.distanceLy + 1);
      if (score > bestScore || (score === bestScore && info.distanceLy < bestDistance)) {
        bestStation = { key, station: info.station, system: info.system, supply: rawSupply, distanceLy: info.distanceLy, isStale: !!info.isStale };
        bestScore = score;
        bestDistance = info.distanceLy;
      }
    }

    if (bestStation) {
      assignments.set(nameInternal, {
        station: bestStation.station,
        system: bestStation.system,
        supply: bestStation.supply,
        distanceLy: bestStation.distanceLy,
        lowSupply: true,
        isStale: bestStation.isStale,
      });
      assigned.add(nameInternal);
    }
  }

  return {
    assignments,
    unassigned: nameInternals.filter(n => !assigned.has(n)),
  };
}
