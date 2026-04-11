import { lookupNearestStation } from './inara-lookup.js';
import { updateNearestStation, getCommoditySlot, clearFailedStationLookups, clearAllStationLookups } from '../db/repositories/commodity-repo.js';
import { getCachedStationResults, replaceStationResults, getStationResultsForCommodities, purgeStaleStationResults } from '../db/repositories/market-cache-repo.js';
import { config } from '../config.js';
import { emitError } from './event-bus.js';
import { logger } from './logger.js';

const TAG = 'StationLookup';

const REQUEST_DELAY_MS   = 5_000;
const RETRY_DELAY_MS      = 60_000;
const CSR_MAX_AGE_HOURS   = 24;
const INARA_SEARCH_RANGE  = 500;
const SUPPLY_MULTIPLIER   = 3;

export class StationLookupService {
  /**
   * @param {import('events').EventEmitter} bus
   * @param {import('./construction-manager.js').ConstructionManager} manager
   * @param {import('./cargo-tracker.js').CargoTracker} cargoTracker
   */
  constructor(bus, manager, cargoTracker) {
    this._bus = bus;
    this._manager = manager;
    this._cargoTracker = cargoTracker;
    this._queue = [];
    this._processing = false;

    bus.on('commodity:updated', ({ constructionId, slot }) => {
      if (this._needsLookup(slot)) this._enqueue(constructionId, slot);
    });
  }

  /** Queue lookups for all existing commodities that are stale or never queried. */
  checkAll() {
    let queued = 0;
    for (const construction of this._manager.getConstructions()) {
      for (const slot of this._manager.getCommoditySlots(construction.id)) {
        if (this._needsLookup(slot)) {
          this._enqueue(construction.id, slot);
          queued++;
        }
      }
    }
    if (queued > 0) logger.info(TAG, `Queued ${queued} commodity lookups on startup`);
  }

  /**
   * Reset failed lookups for a construction and re-queue them.
   * "Failed" means queried but no station was found.
   */
  refreshConstruction(constructionId) {
    clearFailedStationLookups(constructionId);
    let queued = 0;
    for (const slot of this._manager.getCommoditySlots(constructionId)) {
      const fresh = getCommoditySlot(constructionId, slot.name);
      if (fresh && this._needsLookup(fresh)) {
        this._enqueue(constructionId, fresh);
        queued++;
      }
    }
    logger.info(TAG, `Refreshing ${queued} failed lookups for construction ${constructionId}`);
    return queued;
  }

  /**
   * Force-reset ALL station lookups for a construction (including previously successful ones)
   * and re-queue them all.
   */
  forceRefreshConstruction(constructionId) {
    clearAllStationLookups(constructionId);
    let queued = 0;
    for (const slot of this._manager.getCommoditySlots(constructionId)) {
      const fresh = getCommoditySlot(constructionId, slot.name);
      if (fresh && this._needsLookup(fresh)) {
        this._enqueue(constructionId, fresh);
        queued++;
      }
    }
    logger.info(TAG, `Force-refreshing ${queued} station lookups for construction ${constructionId}`);
    return queued;
  }

  _needsLookup(slot) {
    if (!slot.name_internal) return false;
    const remaining = slot.amount_required - slot.amount_delivered;
    if (remaining <= 0) return false;

    const cached = getCachedStationResults(slot.name_internal, slot.nearest_system ?? '', CSR_MAX_AGE_HOURS);
    if (cached !== null) {
      return false;
    }

    if (!slot.nearest_queried_at) return true;
    return Date.now() - new Date(slot.nearest_queried_at).getTime() > CSR_MAX_AGE_HOURS * 60 * 60 * 1000;
  }

  _enqueue(constructionId, slot) {
    const already = this._queue.some(
      q => q.constructionId === constructionId && q.commodityName === slot.name
    );
    if (already) return;
    logger.debug(TAG, `Enqueued: ${slot.name} (construction ${constructionId})`);
    this._queue.push({ constructionId, commodityName: slot.name, nameInternal: slot.name_internal });
    if (!this._processing) this._process();
  }

  /**
   * Build a dedup key for a commodity lookup: same commodity near the same system
   * yields the same Inara/cache result regardless of which construction is asking.
   */
  _lookupKey(nameInternal, referenceSystem) {
    return `${nameInternal}\0${referenceSystem}`;
  }

  async _process() {
    this._processing = true;

    purgeStaleStationResults(CSR_MAX_AGE_HOURS);

    while (this._queue.length > 0) {
      const batch = this._queue.splice(0, this._queue.length);

      // ── Step 1: Group queue items by (commodity, referenceSystem) ───────
      /** @type {Map<string, { nameInternal: string, referenceSystem: string, targets: { constructionId: string, commodityName: string }[] }>} */
      const groups = new Map();
      for (const item of batch) {
        const construction = this._manager.getConstruction(item.constructionId);
        if (!construction) continue;
        const key = this._lookupKey(item.nameInternal, construction.system_name);
        if (!groups.has(key)) {
          groups.set(key, { nameInternal: item.nameInternal, referenceSystem: construction.system_name, targets: [] });
        }
        groups.get(key).targets.push({ constructionId: item.constructionId, commodityName: item.commodityName });
      }

      const deduped = batch.length - groups.size;
      if (deduped > 0) {
        logger.info(TAG, `Deduplicated ${deduped} lookups (${batch.length} slots → ${groups.size} unique queries)`);
      }

      // ── Step 2: Resolve from commodity_station_results cache ─────────────
      const needsInara = [];

      for (const [key, group] of groups) {
        const cached = getCachedStationResults(group.nameInternal, group.referenceSystem, CSR_MAX_AGE_HOURS);
        if (cached !== null) {
          logger.debug(TAG, `CSR cache hit: ${group.nameInternal} near ${group.referenceSystem} (${cached.length} stations)`);
          continue;
        }
        needsInara.push({ key, group });
      }

      if (groups.size > needsInara.length) {
        logger.info(TAG, `Cache resolved ${groups.size - needsInara.length}/${groups.size} unique commodities instantly`);
      }

      // ── Step 3: Query Inara one commodity at a time, with polite delays ──
      for (let i = 0; i < needsInara.length; i++) {
        const { key, group } = needsInara[i];
        await this._lookupAndCache(key, group);
        if (i < needsInara.length - 1) {
          await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
        }
      }

      // ── Step 4: Run one-stop analysis for each construction ──────────────
      const constructionIds = new Set(batch.map(b => b.constructionId));
      for (const constructionId of constructionIds) {
        await this._analyzeOneStop(constructionId);
      }
    }
    this._processing = false;
  }

  /**
   * Query Inara for a commodity, cache all results in commodity_station_results.
   */
  async _lookupAndCache(key, group) {
    const { nameInternal, referenceSystem, targets } = group;

    logger.info(TAG, `Querying Inara: ${nameInternal} near ${referenceSystem} (for ${targets.length} slot${targets.length > 1 ? 's' : ''})`);
    let { data, transient } = await lookupNearestStation(nameInternal, referenceSystem);

    if (transient) {
      logger.info(TAG, `Transient error for ${nameInternal} — retrying in ${RETRY_DELAY_MS / 1000}s`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      ({ data, transient } = await lookupNearestStation(nameInternal, referenceSystem));
    }

    if (!data && !transient) {
      logger.warn(TAG, `No station found for ${nameInternal} near ${referenceSystem} (within ${INARA_SEARCH_RANGE}ly)`);
      emitError(TAG, `No station found for ${nameInternal} within ${INARA_SEARCH_RANGE}ly of ${referenceSystem}`);
    } else if (!data && transient) {
      logger.warn(TAG, `Still failing after retry for ${nameInternal} — will retry next run`);
    }

    // Discard the result if Inara returned the player's own fleet carrier
    const ownCarrierName = this._cargoTracker?.getFcStationName() ?? null;
    let filteredData = data ?? [];
    if (ownCarrierName) {
      filteredData = filteredData.filter(r => r.station !== ownCarrierName);
    }

    if (filteredData.length > 0) {
      const queriedAt = !transient ? new Date().toISOString() : new Date(0).toISOString();
      replaceStationResults(nameInternal, referenceSystem, filteredData, queriedAt);
      logger.info(TAG, `Cached ${filteredData.length} stations for ${nameInternal} near ${referenceSystem}`);
    }
  }

  /**
   * Run one-stop shopping analysis for a construction.
   * Uses greedy set-cover to assign each commodity to the best station.
   */
  async _analyzeOneStop(constructionId) {
    const construction = this._manager.getConstruction(constructionId);
    if (!construction) return;

    const slots = this._manager.getCommoditySlots(constructionId);
    const neededSlots = slots.filter(s => {
      if (!s.name_internal) return false;
      const remaining = s.amount_required - s.amount_delivered;
      return remaining > 0;
    });

    if (neededSlots.length === 0) return;

    const nameInternals = neededSlots.map(s => s.name_internal);
    const stationMap = getStationResultsForCommodities(nameInternals, construction.system_name, CSR_MAX_AGE_HOURS);

    if (stationMap.size === 0) {
      const queriedAt = new Date().toISOString();
      for (const slot of neededSlots) {
        this._record(constructionId, slot.name, null, null, null, queriedAt);
      }
      return;
    }

    // Build remaining amounts per commodity
    const remainingAmounts = new Map();
    for (const slot of neededSlots) {
      remainingAmounts.set(slot.name_internal, slot.amount_required - slot.amount_delivered);
    }

    // For each station, determine which commodities it can cover (3x supply rule)
    // and score it by coverage count (primary) and distance (secondary)
    const stationCandidates = [];
    for (const [key, info] of stationMap) {
      const covered3x = [];
      const coveredFallback = [];
      for (const [nameInternal, supply] of info.commodities) {
        if (!remainingAmounts.has(nameInternal)) continue;
        const required = remainingAmounts.get(nameInternal);
        if (supply != null && supply >= SUPPLY_MULTIPLIER * required) {
          covered3x.push(nameInternal);
        } else {
          coveredFallback.push({ nameInternal, supply: supply ?? 0 });
        }
      }
      stationCandidates.push({
        key,
        station: info.station,
        system: info.system,
        distanceLy: info.distanceLy,
        covered3x,
        coveredFallback,
      });
    }

    // Greedy set-cover: assign commodities to stations
    const assignments = new Map(); // nameInternal → { station, system, supply, lowSupply }
    const assigned = new Set();

    // Sort candidates: primary by 3x coverage count desc, secondary by distance asc
    stationCandidates.sort((a, b) => {
      if (b.covered3x.length !== a.covered3x.length) return b.covered3x.length - a.covered3x.length;
      return a.distanceLy - b.distanceLy;
    });

    // Pass 1: Assign commodities using the 3x rule (greedy set-cover)
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

    // Pass 2: For remaining unassigned commodities, find the best station
    // even if it doesn't meet the 3x rule (fallback)
    const unassigned = nameInternals.filter(n => !assigned.has(n) && remainingAmounts.has(n));
    for (const nameInternal of unassigned) {
      let bestStation = null;
      let bestSupply = -1;
      let bestDistance = Infinity;

      for (const [key, info] of stationMap) {
        if (!info.commodities.has(nameInternal)) continue;
        const supply = info.commodities.get(nameInternal) ?? 0;
        if (supply > bestSupply || (supply === bestSupply && info.distanceLy < bestDistance)) {
          bestStation = { key, station: info.station, system: info.system, supply, distanceLy: info.distanceLy };
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

    // Write results to commodity slots
    const queriedAt = new Date().toISOString();
    for (const slot of neededSlots) {
      const assignment = assignments.get(slot.name_internal);
      if (assignment) {
        this._record(constructionId, slot.name, assignment.station, assignment.system, assignment.supply, queriedAt);
      } else {
        this._record(constructionId, slot.name, null, null, null, queriedAt);
      }
    }

    const covered = assigned.size;
    const total = neededSlots.length;
    logger.info(TAG, `One-stop analysis for construction ${constructionId}: ${covered}/${total} commodities assigned, ${stationMap.size} candidate stations`);
  }

  /** Write a station result to DB for a single slot and notify the bus. */
  _record(constructionId, commodityName, station, system, supply, queriedAt) {
    updateNearestStation(constructionId, commodityName, {
      station: station ?? null,
      system:  system  ?? null,
      supply:  supply  ?? null,
      queriedAt,
    });
    const updated = getCommoditySlot(constructionId, commodityName);
    if (updated) this._bus.emit('commodity:updated', { constructionId, slot: updated });
  }
}
