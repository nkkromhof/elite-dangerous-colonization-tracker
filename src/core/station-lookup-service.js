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
      // Re-read from DB so nearest_queried_at reflects the cleared state
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

  async _process() {
    this._processing = true;
    while (this._queue.length > 0) {
      const batch = this._queue.splice(0, this._queue.length);

      // Phase 1: resolve everything possible from local cache — instant, no network.
      const needsInara = [];
      const cachedAt = new Date().toISOString();
      for (const item of batch) {
        const construction = this._manager.getConstruction(item.constructionId);
        if (!construction) continue;
        const cached = this._checkCache(item.nameInternal, construction.system_name);
        if (cached) {
          this._record(item.constructionId, item.commodityName, cached.station, cached.system, cached.supply, cachedAt);
        } else {
          needsInara.push(item);
        }
      }

      if (batch.length > needsInara.length) {
        logger.info(TAG, `Cache resolved ${batch.length - needsInara.length}/${batch.length} commodities instantly`);
      }

      // Phase 2: query Inara one at a time, with polite delays between requests.
      for (let i = 0; i < needsInara.length; i++) {
        const { constructionId, commodityName, nameInternal } = needsInara[i];
        await this._lookup(constructionId, commodityName, nameInternal);
        if (i < needsInara.length - 1) {
          await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
        }
      }
    }
    this._processing = false;
  }

  /** Write a station result to DB and notify the bus. */
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

  /**
   * Check local market cache for a single commodity relative to a construction system.
   * Returns a result object compatible with Inara result shape, or null if no hit.
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

  async _lookup(constructionId, commodityName, nameInternal) {
    const construction = this._manager.getConstruction(constructionId);
    if (!construction) return;

    logger.info(TAG, `Querying Inara: ${commodityName} near ${construction.system_name}`);
    let { data, transient } = await lookupNearestStation(nameInternal, construction.system_name);

    if (transient) {
      logger.info(TAG, `Transient error for ${commodityName} — retrying in ${RETRY_DELAY_MS / 1000}s`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      ({ data, transient } = await lookupNearestStation(nameInternal, construction.system_name));
    }

    if (!data && !transient) {
      logger.warn(TAG, `No station found for ${commodityName} near ${construction.system_name} (within 500ly)`);
      emitError(TAG, `No station found for ${commodityName} within 500ly of ${construction.system_name}`);
    } else if (!data && transient) {
      logger.warn(TAG, `Still failing after retry for ${commodityName} — will retry next run`);
    }

    this._record(constructionId, commodityName,
      data?.station ?? null, data?.system ?? null, data?.supply ?? null,
      !transient ? new Date().toISOString() : null
    );
  }
}
