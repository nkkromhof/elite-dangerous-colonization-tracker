import { lookupNearestStation } from './inara-lookup.js';
import { updateNearestStation, getCommoditySlot, clearFailedStationLookups } from '../db/repositories/commodity-repo.js';
import { findCachedStationsForCommodity, getSystemCoordinates } from '../db/repositories/market-cache-repo.js';
import { emitError } from './event-bus.js';
import { logger } from './logger.js';

const TAG = 'StationLookup';

const STALE_MS           = 24 * 60 * 60 * 1000; // 24 hours
const REQUEST_DELAY_MS   = 5_000;                // be polite to Inara
const RETRY_DELAY_MS     = 60_000;               // wait after a rate-limit hit before retrying
const CACHE_MAX_AGE_DAYS = 7;
const INARA_SEARCH_RANGE = 500;                  // ly — must match inara-lookup.js
const RESULT_CACHE_TTL   = 5 * 60 * 1000;        // 5 min — short-lived in-memory result cache

export class StationLookupService {
  /**
   * @param {import('events').EventEmitter} bus
   * @param {import('./construction-manager.js').ConstructionManager} manager
   */
  constructor(bus, manager) {
    this._bus = bus;
    this._manager = manager;
    this._queue = [];
    this._processing = false;

    // Short-lived cache of lookup results keyed by "nameInternal\0referenceSystem".
    // Survives across a single processing pass so late-arriving slots (via events)
    // can instantly resolve from results we just fetched seconds ago.
    /** @type {Map<string, { station: string|null, system: string|null, supply: number|null, queriedAt: string, expiresAt: number }>} */
    this._resultCache = new Map();

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

  _needsLookup(slot) {
    if (!slot.name_internal) return false;
    const remaining = slot.amount_required - slot.amount_delivered;
    if (remaining <= 0) return false;
    if (!slot.nearest_queried_at) return true;
    return Date.now() - new Date(slot.nearest_queried_at).getTime() > STALE_MS;
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
    while (this._queue.length > 0) {
      const batch = this._queue.splice(0, this._queue.length);

      // ── Step 1: Group queue items by (commodity, referenceSystem) ───────
      // Multiple constructions wanting the same commodity near the same system
      // collapse into a single lookup with multiple fan-out targets.
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

      // ── Step 2: Resolve from in-memory result cache + local market cache ─
      const needsInara = [];
      const cachedAt = new Date().toISOString();

      for (const [key, group] of groups) {
        // Check short-lived in-memory result cache first (from a recent Inara hit)
        const cached = this._getResultCache(key);
        if (cached) {
          logger.debug(TAG, `Result cache hit: ${group.nameInternal} near ${group.referenceSystem}`);
          this._fanOut(group.targets, cached.station, cached.system, cached.supply, cached.queriedAt);
          continue;
        }

        // Check local market cache (station_market_cache via indexed query)
        const marketHit = this._checkCache(group.nameInternal, group.referenceSystem);
        if (marketHit) {
          this._fanOut(group.targets, marketHit.station, marketHit.system, marketHit.supply, cachedAt);
          this._setResultCache(key, marketHit.station, marketHit.system, marketHit.supply, cachedAt);
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
        await this._lookupAndFanOut(key, group);
        if (i < needsInara.length - 1) {
          await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
        }
      }
    }
    this._processing = false;
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

  /** Fan out a single lookup result to all slots that were waiting for it. */
  _fanOut(targets, station, system, supply, queriedAt) {
    for (const { constructionId, commodityName } of targets) {
      this._record(constructionId, commodityName, station, system, supply, queriedAt);
    }
  }

  // ── In-memory result cache ──────────────────────────────────────────────────

  _getResultCache(key) {
    const entry = this._resultCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this._resultCache.delete(key);
      return null;
    }
    return entry;
  }

  _setResultCache(key, station, system, supply, queriedAt) {
    this._resultCache.set(key, {
      station, system, supply, queriedAt,
      expiresAt: Date.now() + RESULT_CACHE_TTL,
    });
  }

  // ── Cache + Inara lookups ───────────────────────────────────────────────────

  /**
   * Check local market cache for a single commodity relative to a construction system.
   * Returns a result object or null if no hit.
   */
  _checkCache(nameInternal, systemName) {
    const coords = getSystemCoordinates(systemName);
    if (!coords) return null;

    const hits = findCachedStationsForCommodity(
      nameInternal, CACHE_MAX_AGE_DAYS, coords.x, coords.y, coords.z
    );
    const hit = hits.find(h => h.distanceLy <= INARA_SEARCH_RANGE);
    if (!hit) return null;

    logger.info(TAG, `Cache hit: ${nameInternal} → ${hit.stationName} / ${hit.systemName} (${hit.distanceLy.toFixed(1)} ly, stock ${hit.stock})`);
    return { station: hit.stationName, system: hit.systemName, distanceLy: hit.distanceLy, supply: hit.stock };
  }

  async _lookupAndFanOut(key, group) {
    const { nameInternal, referenceSystem, targets } = group;

    logger.info(TAG, `Querying Inara: ${nameInternal} near ${referenceSystem} (for ${targets.length} slot${targets.length > 1 ? 's' : ''})`);
    let { data, transient } = await lookupNearestStation(nameInternal, referenceSystem);

    if (transient) {
      logger.info(TAG, `Transient error for ${nameInternal} — retrying in ${RETRY_DELAY_MS / 1000}s`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      ({ data, transient } = await lookupNearestStation(nameInternal, referenceSystem));
    }

    if (!data && !transient) {
      logger.warn(TAG, `No station found for ${nameInternal} near ${referenceSystem} (within 500ly)`);
      emitError(TAG, `No station found for ${nameInternal} within 500ly of ${referenceSystem}`);
    } else if (!data && transient) {
      logger.warn(TAG, `Still failing after retry for ${nameInternal} — will retry next run`);
    }

    const station  = data?.station ?? null;
    const system   = data?.system ?? null;
    const supply   = data?.supply ?? null;
    const queriedAt = !transient ? new Date().toISOString() : null;

    // Cache the result so other slots arriving later can resolve instantly
    if (!transient) {
      this._setResultCache(key, station, system, supply, queriedAt);
    }

    this._fanOut(targets, station, system, supply, queriedAt);
  }
}
