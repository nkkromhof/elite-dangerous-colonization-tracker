import { lookupNearestStation } from './inara-lookup.js';
import { updateNearestStation, getCommoditySlot } from '../db/repositories/commodity-repo.js';

const STALE_MS = 24 * 60 * 60 * 1000; // 24 hours
const REQUEST_DELAY_MS = 2_000;         // be polite to Inara

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

  async _process() {
    this._processing = true;
    while (this._queue.length > 0) {
      const { constructionId, commodityName, nameInternal } = this._queue.shift();
      await this._lookup(constructionId, commodityName, nameInternal);
      if (this._queue.length > 0) {
        await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
      }
    }
    this._processing = false;
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
