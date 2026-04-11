import { randomUUID } from 'crypto';
import {
  createConstruction,
  getAllConstructions,
  getArchivedConstructions,
  getConstruction,
  archiveConstruction,
  unarchiveConstruction,
} from '../db/repositories/construction-repo.js';
import {
  upsertCommoditySlot,
  getCommoditySlots,
  getCommoditySlot,
  incrementDelivered,
  setDelivered,
  deleteCommoditySlot,
} from '../db/repositories/slot-repo.js';
import { recordDelivery } from '../db/repositories/delivery-repo.js';

export class ConstructionManager {
  /** @param {import('events').EventEmitter} eventBus */
  constructor(eventBus) {
    this._bus = eventBus;
    this._marketIdIndex = new Map();
    getAllConstructions().forEach(c => {
      if (c.market_id) this._marketIdIndex.set(c.market_id, c.id);
    });
  }

  createConstruction({ system_name = null, station_name, station_type, market_id, type = 'auto' }) {
    const id = randomUUID();
    const phase = type === 'manual' ? 'collection' : 'scanning';
    createConstruction({ id, system_name, station_name, station_type, market_id, phase, type });
    if (market_id) this._marketIdIndex.set(market_id, id);
    const construction = { ...getConstruction(id), commodities: getCommoditySlots(id) };
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

  syncFromDepot(constructionId, { name, name_internal, amount_required, amount_provided }) {
    upsertCommoditySlot({ id: randomUUID(), construction_id: constructionId, name, name_internal, amount_required });
    setDelivered(constructionId, name, amount_provided);
    const slots = getCommoditySlots(constructionId);
    this._bus.emit('commodity:updated', { constructionId, slot: slots.find(s => s.name === name) });
  }

  getCommoditySlots(constructionId) { return getCommoditySlots(constructionId); }
  getCommoditySlot(constructionId, name) { return getCommoditySlot(constructionId, name); }

  removeCommodity(constructionId, name) {
    deleteCommoditySlot(constructionId, name);
    this._bus.emit('commodity:removed', { constructionId, name });
  }

  recordDelivery({ construction_id, commodity_name, amount, source }) {
    incrementDelivered(construction_id, commodity_name, amount);
    recordDelivery({ id: randomUUID(), construction_id, commodity_name, amount, source });
    const slots = getCommoditySlots(construction_id);
    const slot = slots.find(s => s.name === commodity_name);
    this._bus.emit('delivery:recorded', { construction_id, commodity_name, amount, source, slot });
  }

  archiveConstruction(id) {
    const construction = getConstruction(id);
    archiveConstruction(id);
    if (construction?.market_id) this._marketIdIndex.delete(construction.market_id);
    this._bus.emit('construction:archived', { id });
  }

  getArchivedConstructions() {
    return getArchivedConstructions().map(c => ({
      ...c,
      commodities: getCommoditySlots(c.id),
    }));
  }

  unarchiveConstruction(id) {
    unarchiveConstruction(id);
    const construction = getConstruction(id);
    if (construction?.market_id) this._marketIdIndex.set(construction.market_id, id);
    this._bus.emit('construction:unarchived', { id, construction });
  }
}
