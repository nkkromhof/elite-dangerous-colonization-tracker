import { randomUUID } from 'crypto';
import {
  createConstruction,
  getAllConstructions,
  getConstruction,
  deleteConstruction,
} from '../db/repositories/construction-repo.js';
import {
  upsertCommoditySlot,
  getCommoditySlots,
  incrementDelivered,
  recordDelivery,
} from '../db/repositories/commodity-repo.js';

export class ConstructionManager {
  /** @param {import('events').EventEmitter} eventBus */
  constructor(eventBus) {
    this._bus = eventBus;
    this._marketIdIndex = new Map();
    getAllConstructions().forEach(c => {
      if (c.market_id) this._marketIdIndex.set(c.market_id, c.id);
    });
  }

  createConstruction({ system_name, station_name, station_type, market_id }) {
    const id = randomUUID();
    createConstruction({ id, system_name, station_name, station_type, market_id, phase: 'scanning' });
    if (market_id) this._marketIdIndex.set(market_id, id);
    const construction = getConstruction(id);
    this._bus.emit('construction:added', construction);
    return id;
  }

  /** Returns existing id if known, otherwise creates a new construction. */
  getOrCreateByMarketId({ market_id, system_name, station_name, station_type }) {
    if (this._marketIdIndex.has(market_id)) return this._marketIdIndex.get(market_id);
    return this.createConstruction({ market_id, system_name, station_name, station_type });
  }

  getConstructions() { return getAllConstructions(); }
  getConstruction(id) { return getConstruction(id); }

  findByMarketId(marketId) {
    const id = this._marketIdIndex.get(marketId);
    return id ? getConstruction(id) : null;
  }

  upsertCommodity(constructionId, { name, name_internal, amount_required }) {
    upsertCommoditySlot({ id: randomUUID(), construction_id: constructionId, name, name_internal, amount_required });
    const slots = getCommoditySlots(constructionId);
    this._bus.emit('commodity:updated', { constructionId, slot: slots.find(s => s.name === name) });
  }

  getCommoditySlots(constructionId) { return getCommoditySlots(constructionId); }

  recordDelivery({ construction_id, commodity_name, amount, source }) {
    incrementDelivered(construction_id, commodity_name, amount);
    recordDelivery({ id: randomUUID(), construction_id, commodity_name, amount, source });
    const slots = getCommoditySlots(construction_id);
    const slot = slots.find(s => s.name === commodity_name);
    this._bus.emit('delivery:recorded', { construction_id, commodity_name, amount, source, slot });
  }

  deleteConstruction(id) { deleteConstruction(id); }
}
