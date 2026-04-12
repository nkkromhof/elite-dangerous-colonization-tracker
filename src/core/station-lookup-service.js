import { lookupNearestStation } from './inara-lookup.js';
import { updateNearestStation, getCommoditySlot, clearFailedStationLookups, clearAllStationLookups } from '../db/repositories/slot-repo.js';
import { getCachedStationResults, replaceStationResults, getStationResultsForCommodities, purgeStaleStationResults, getSystemCoordinates, findCachedStationsForCommodityLenient } from '../db/repositories/market-cache-repo.js';
import { analyzeOneStop } from './one-stop-analyzer.js';
import { config } from '../config.js';
import { emitError } from './event-bus.js';
import { logger } from './logger.js';

const TAG = 'StationLookup';

// Delay between Inara requests to avoid rate limiting (Inara is a community site)
const REQUEST_DELAY_MS   = 5_000;
// Delay before retrying after a transient Inara failure
const RETRY_DELAY_MS      = 60_000;
// How long cached station results remain valid
const CSR_MAX_AGE_HOURS   = 24;
// Local market cache: age in days for the fresh tier (any stock accepted)
const LOCAL_FRESH_MAX_AGE_DAYS = 7;
// Local market cache: age in days for the stale tier (high stock only)
const STALE_MAX_AGE_DAYS = 30;
// Stale tier: minimum supply-to-demand ratio for accepting stale local data
const STALE_SUPPLY_MULTIPLIER = 20;

export class StationLookupService {
  /**
   * Orchestrates Inara lookups for construction commodities.
   *
   * When a commodity is added or updated on a construction, this service:
   * 1. Checks the local cache (commodity_station_results) for recent results
   * 2. Queries Inara for any cache misses, rate-limited and with retry
   * 3. Runs a one-stop shopping analysis to assign each commodity to the
   *    best station, minimizing the number of stops the player needs
   *
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
   * Force-reset ALL station lookups for a construction (including previously
   * successful ones) and re-queue them all.
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

  /** A slot needs a lookup if it has remaining demand and no recent cached result. */
  _needsLookup(slot) {
    if (!slot.name_internal) return false;
    const remaining = slot.amount_required - slot.amount_delivered;
    if (remaining <= 0) return false;

    const cached = getCachedStationResults(slot.name_internal, slot.nearest_system ?? '', CSR_MAX_AGE_HOURS);
    if (cached !== null) return false;

    if (!slot.nearest_queried_at) return true;
    return Date.now() - new Date(slot.nearest_queried_at).getTime() > CSR_MAX_AGE_HOURS * 60 * 60 * 1000;
  }

  /** Add a commodity to the lookup queue, deduplicating by construction + name. */
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
   * Dedup key for Inara lookups: the same commodity near the same system
   * yields identical results regardless of which construction is asking.
   */
  _lookupKey(nameInternal, referenceSystem) {
    return `${nameInternal}\0${referenceSystem}`;
  }

  /**
   * Process the lookup queue in a single batch:
   * 1. Group by (commodity, referenceSystem) to deduplicate across constructions
   * 2. Resolve what we can from the local cache
   * 3. Query Inara for cache misses (rate-limited, with retry)
   * 4. Run one-stop analysis for each affected construction
   */
  async _process() {
    this._processing = true;

    purgeStaleStationResults(CSR_MAX_AGE_HOURS);

    while (this._queue.length > 0) {
      const batch = this._queue.splice(0, this._queue.length);

      // ── Step 1: Group queue items by (commodity, referenceSystem) ───────
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

      // ── Step 3: Query Inara one commodity at a time ──────────────────────
      for (let i = 0; i < needsInara.length; i++) {
        const { key, group } = needsInara[i];
        await this._lookupAndCache(key, group);
        if (i < needsInara.length - 1) {
          await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
        }
      }

      // ── Step 4: Run one-stop analysis for each affected construction ─────
      const constructionIds = new Set(batch.map(b => b.constructionId));
      for (const constructionId of constructionIds) {
        this._runOneStopAnalysis(constructionId);
      }
    }
    this._processing = false;
  }

  /** Query Inara for a commodity and cache all results. */
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
      logger.warn(TAG, `No station found for ${nameInternal} near ${referenceSystem}`);
      emitError(TAG, `No station found for ${nameInternal} near ${referenceSystem}`);
    } else if (!data && transient) {
      logger.warn(TAG, `Still failing after retry for ${nameInternal} — will retry next run`);
    }

    // Filter out the player's own fleet carrier from results
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
   * Run one-stop analysis for a construction using the extracted analyzer.
   * Reads needed slots and cached station data from both Inara results and
   * the local market cache, merges them, delegates to analyzeOneStop(),
   * then writes results back to the DB and notifies the event bus.
   */
  _runOneStopAnalysis(constructionId) {
    const construction = this._manager.getConstruction(constructionId);
    if (!construction) return;

    const slots = this._manager.getCommoditySlots(constructionId);
    const neededSlots = slots.filter(s => s.name_internal && (s.amount_required - s.amount_delivered) > 0);
    if (neededSlots.length === 0) return;

    const nameInternals = neededSlots.map(s => s.name_internal);
    const stationMap = getStationResultsForCommodities(nameInternals, construction.system_name, CSR_MAX_AGE_HOURS);

    this._mergeLocalMarketCache(stationMap, neededSlots, construction.system_name);

    if (stationMap.size === 0) {
      const queriedAt = new Date().toISOString();
      for (const slot of neededSlots) {
        this._record(constructionId, slot.name, null, null, null, queriedAt);
      }
      return;
    }

    const { assignments } = analyzeOneStop({ neededSlots, stationMap, staleSupplyMultiplier: STALE_SUPPLY_MULTIPLIER });

    const queriedAt = new Date().toISOString();
    for (const slot of neededSlots) {
      const assignment = assignments.get(slot.name_internal);
      if (assignment) {
        this._record(constructionId, slot.name, assignment.station, assignment.system, assignment.supply, queriedAt);
      } else {
        this._record(constructionId, slot.name, null, null, null, queriedAt);
      }
    }

    const covered = assignments.size;
    const staleCount = [...assignments.values()].filter(a => a.isStale).length;
    logger.info(TAG, `One-stop analysis for construction ${constructionId}: ${covered}/${neededSlots.length} commodities assigned, ${stationMap.size} candidate stations${staleCount > 0 ? ` (${staleCount} from stale local data)` : ''}`);
  }

  /**
   * Merge local market cache stations into the stationMap.
   * Skips stations already present from Inara data (authoritative).
   * Stale entries are flagged with isStale for the analyzer to use in Pass 2.
   */
  _mergeLocalMarketCache(stationMap, neededSlots, referenceSystem) {
    const coords = getSystemCoordinates(referenceSystem);
    if (!coords) return;

    const ownMarketId = this._cargoTracker?.getFcMarketId?.() ?? null;

    for (const slot of neededSlots) {
      if (!slot.name_internal) continue;
      const remaining = slot.amount_required - slot.amount_delivered;
      const staleMinSupply = STALE_SUPPLY_MULTIPLIER * remaining;

      const localStations = findCachedStationsForCommodityLenient(
        slot.name_internal,
        LOCAL_FRESH_MAX_AGE_DAYS,
        STALE_MAX_AGE_DAYS,
        staleMinSupply,
        coords.x, coords.y, coords.z,
        ownMarketId,
      );

      for (const ls of localStations) {
        const key = `${ls.stationName}|${ls.systemName}`;
        if (stationMap.has(key)) continue;

        if (!stationMap.has(key)) {
          stationMap.set(key, {
            station: ls.stationName,
            system: ls.systemName,
            distanceLy: ls.distanceLy,
            commodities: new Map(),
            isStale: ls.isStale,
          });
        }
        stationMap.get(key).commodities.set(slot.name_internal, ls.stock);
      }
    }
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
