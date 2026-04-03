import { lookupNearestStation, lookupNearestStationsForGroup } from './inara-lookup.js';
import { updateNearestStation, getCommoditySlot, clearFailedStationLookups } from '../db/repositories/commodity-repo.js';
import { findCachedStationsForCommodity, getSystemCoordinates } from '../db/repositories/market-cache-repo.js';
import { COMMODITY_CATEGORIES } from './commodity-categories.js';
import { emitError } from './event-bus.js';
import { logger } from './logger.js';

const TAG = 'StationLookup';

const STALE_MS          = 24 * 60 * 60 * 1000; // 24 hours
const REQUEST_DELAY_MS  = 5_000;                // be polite to Inara
const RETRY_DELAY_MS    = 30_000;               // wait after a rate-limit before retrying
const CACHE_MAX_AGE_DAYS = 7;
const INARA_SEARCH_RANGE = 500;                 // ly — must match inara-lookup.js

function getCategoryForNameInternal(nameInternal) {
  if (!nameInternal) return null;
  const symbol = nameInternal.replace(/^\$/, '').replace(/_[Nn]ame;$/, '').toLowerCase();
  return COMMODITY_CATEGORIES[symbol] ?? null;
}

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

  /**
   * Group queue items by (constructionId, category).
   * Items without a known category form single-item groups.
   * Single-item groups from a category (if the category only has one item queued)
   * are still processed individually.
   */
  _buildGroups(items) {
    const grouped = new Map(); // `constructionId:category` → items[]
    const individual = [];

    for (const item of items) {
      const category = getCategoryForNameInternal(item.nameInternal);
      if (category) {
        const key = `${item.constructionId}:${category}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(item);
      } else {
        individual.push([item]);
      }
    }

    const result = [];
    for (const group of grouped.values()) {
      if (group.length > 1) {
        result.push(group);
      } else {
        // Only one item in this category queued — treat as individual
        individual.push(group);
      }
    }
    result.push(...individual);
    return result;
  }

  async _process() {
    this._processing = true;
    while (this._queue.length > 0) {
      // Drain the queue and group items by category
      const batch = this._queue.splice(0, this._queue.length);
      const groups = this._buildGroups(batch);

      for (let i = 0; i < groups.length; i++) {
        const group = groups[i];

        if (group.length > 1) {
          await this._lookupGroup(group);
        } else {
          const { constructionId, commodityName, nameInternal } = group[0];
          await this._lookup(constructionId, commodityName, nameInternal);
        }

        // Delay between groups (not after the last one)
        if (i < groups.length - 1) {
          await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
        }
      }
    }
    this._processing = false;
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

  async _lookupGroup(group) {
    const { constructionId } = group[0];
    const construction = this._manager.getConstruction(constructionId);
    if (!construction) return;

    // Check local cache for each item first — resolve what we can without Inara
    const cacheHits = {};
    const needsInara = [];
    for (const item of group) {
      const cached = this._checkCache(item.nameInternal, construction.system_name);
      if (cached) {
        cacheHits[item.nameInternal] = cached;
      } else {
        needsInara.push(item);
      }
    }

    if (Object.keys(cacheHits).length > 0) {
      logger.info(TAG, `Cache resolved ${Object.keys(cacheHits).length}/${group.length} in group, ${needsInara.length} need Inara`);
    }

    // Record cache hits immediately
    const cachedAt = new Date().toISOString();
    for (const item of group) {
      const result = cacheHits[item.nameInternal];
      if (!result) continue;
      updateNearestStation(constructionId, item.commodityName, {
        station: result.station, system: result.system, supply: result.supply, queriedAt: cachedAt,
      });
      const updated = getCommoditySlot(constructionId, item.commodityName);
      if (updated) this._bus.emit('commodity:updated', { constructionId, slot: updated });
    }

    if (needsInara.length === 0) return;

    const nameInternalList = needsInara.map(item => item.nameInternal);
    logger.info(TAG, `Group query: [${needsInara.map(i => i.commodityName).join(', ')}] near ${construction.system_name}`);

    let { found, unresolved, transient } = await lookupNearestStationsForGroup(
      nameInternalList,
      construction.system_name
    );

    // On transient failure, wait and retry once
    if (transient && Object.keys(found).length === 0) {
      logger.info(TAG, `Transient error on group — retrying in ${RETRY_DELAY_MS / 1000}s`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      ({ found, unresolved, transient } = await lookupNearestStationsForGroup(
        nameInternalList,
        construction.system_name
      ));
    }

    const foundCount = Object.keys(found).length;
    if (foundCount > 0) {
      logger.info(TAG, `Group resolved ${foundCount} commodities, ${unresolved.length} need individual queries`);
    } else if (transient) {
      logger.warn(TAG, `Group still failing after retry — leaving unqueried for next run`);
    }

    const queriedAt = new Date().toISOString();

    for (const item of needsInara) {
      const result = found[item.nameInternal] ?? null;
      // Don't stamp queriedAt on transient failures — let them retry next startup/refresh
      const shouldStamp = result !== null || !transient;
      updateNearestStation(constructionId, item.commodityName, {
        station:   result?.station  ?? null,
        system:    result?.system   ?? null,
        supply:    result?.supply   ?? null,
        queriedAt: shouldStamp ? queriedAt : null,
      });
      const updated = getCommoditySlot(constructionId, item.commodityName);
      if (updated) {
        this._bus.emit('commodity:updated', { constructionId, slot: updated });
      }
    }

    // Individual follow-up queries for commodities not covered by the bundled result
    // (only when the group query itself was not transient — otherwise re-queue for later)
    if (!transient) {
      for (let i = 0; i < unresolved.length; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
        const nameInternal = unresolved[i];
        const item = needsInara.find(g => g.nameInternal === nameInternal);
        if (item) await this._lookup(constructionId, item.commodityName, item.nameInternal);
      }
    }
  }

  async _lookup(constructionId, commodityName, nameInternal) {
    const construction = this._manager.getConstruction(constructionId);
    if (!construction) return;

    // Check local cache first
    const cached = this._checkCache(nameInternal, construction.system_name);
    if (cached) {
      updateNearestStation(constructionId, commodityName, {
        station: cached.station, system: cached.system, supply: cached.supply,
        queriedAt: new Date().toISOString(),
      });
      const updated = getCommoditySlot(constructionId, commodityName);
      if (updated) this._bus.emit('commodity:updated', { constructionId, slot: updated });
      return;
    }

    logger.info(TAG, `Individual query: ${commodityName} near ${construction.system_name}`);
    let { data, transient } = await lookupNearestStation(nameInternal, construction.system_name);

    // On transient failure, wait and retry once
    if (transient) {
      logger.info(TAG, `Transient error for ${commodityName} — retrying in ${RETRY_DELAY_MS / 1000}s`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      ({ data, transient } = await lookupNearestStation(nameInternal, construction.system_name));
    }

    if (!data && !transient) {
      // Definitive: Inara has no station within range — worth surfacing to the user
      logger.warn(TAG, `No station found for ${commodityName} near ${construction.system_name} (within ${500}ly)`);
      emitError(TAG, `No station found for ${commodityName} within 500ly of ${construction.system_name}`);
    } else if (!data && transient) {
      logger.warn(TAG, `Still failing after retry for ${commodityName} — will retry next run`);
    }

    // Only stamp queriedAt on definitive answers (success or genuinely no results).
    // Leave it null on transient failures so the item retries on next startup/refresh.
    const queriedAt = !transient ? new Date().toISOString() : null;
    updateNearestStation(constructionId, commodityName, {
      station:   data?.station  ?? null,
      system:    data?.system   ?? null,
      supply:    data?.supply   ?? null,
      queriedAt,
    });

    const updated = getCommoditySlot(constructionId, commodityName);
    if (updated) {
      this._bus.emit('commodity:updated', { constructionId, slot: updated });
    }
  }
}
