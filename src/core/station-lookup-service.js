import { lookupNearestStation, lookupNearestStationsForGroup } from './inara-lookup.js';
import { updateNearestStation, getCommoditySlot } from '../db/repositories/commodity-repo.js';
import { COMMODITY_CATEGORIES } from './commodity-categories.js';

const STALE_MS = 24 * 60 * 60 * 1000; // 24 hours
const REQUEST_DELAY_MS = 2_000;         // be polite to Inara

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
    for (const construction of this._manager.getConstructions()) {
      for (const slot of this._manager.getCommoditySlots(construction.id)) {
        if (this._needsLookup(slot)) this._enqueue(construction.id, slot);
      }
    }
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

  async _lookupGroup(group) {
    const { constructionId } = group[0];
    const construction = this._manager.getConstruction(constructionId);
    if (!construction) return;

    const nameInternalList = group.map(item => item.nameInternal);
    const { found, unresolved } = await lookupNearestStationsForGroup(
      nameInternalList,
      construction.system_name
    );

    const queriedAt = new Date().toISOString();

    // Record results for all items (null station/system for unresolved ones,
    // so queriedAt is set and we don't hammer Inara on the next startup)
    for (const item of group) {
      const result = found[item.nameInternal] ?? null;
      updateNearestStation(constructionId, item.commodityName, {
        station:   result?.station  ?? null,
        system:    result?.system   ?? null,
        supply:    result?.supply   ?? null,
        queriedAt,
      });
      const updated = getCommoditySlot(constructionId, item.commodityName);
      if (updated) {
        this._bus.emit('commodity:updated', { constructionId, slot: updated });
      }
    }

    // Individual follow-up queries for commodities not covered by the bundled result
    for (let i = 0; i < unresolved.length; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
      const nameInternal = unresolved[i];
      const item = group.find(g => g.nameInternal === nameInternal);
      if (item) await this._lookup(constructionId, item.commodityName, item.nameInternal);
    }
  }

  async _lookup(constructionId, commodityName, nameInternal) {
    const construction = this._manager.getConstruction(constructionId);
    if (!construction) return;

    const result = await lookupNearestStation(nameInternal, construction.system_name);
    const queriedAt = new Date().toISOString();

    // Always record the query time (even on failure) to avoid hammering Inara
    updateNearestStation(constructionId, commodityName, {
      station:   result?.station  ?? null,
      system:    result?.system   ?? null,
      supply:    result?.supply   ?? null,
      queriedAt,
    });

    const updated = getCommoditySlot(constructionId, commodityName);
    if (updated) {
      this._bus.emit('commodity:updated', { constructionId, slot: updated });
    }
  }
}
