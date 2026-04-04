import { logger } from './logger.js';
import { commodityName, normalizeSavedName } from './commodity-name.js';

const TAG = 'CargoTracker';

export class CargoTracker {
  /**
   * @param {import('events').EventEmitter} eventBus
   * @param {{ ship: Array<{name:string,count:number}>, fc: Array<{name:string,count:number}> }} initial
   */
  constructor(eventBus, initial = { ship: [], fc: [] }) {
    this._bus = eventBus;
    this._ship = (initial.ship ?? []).map(i => ({ ...i, name: normalizeSavedName(i.name) }));
    this._fc   = (initial.fc   ?? []).map(i => ({ ...i, name: normalizeSavedName(i.name) }));
    this._fcMarketId = null;
    this._skipFcJournalUpdates = false;

    eventBus.on('journal:event', (e) => this._handle(e));
    eventBus.on('cargo:consumed', (e) => this._handleConsumed(e));
  }

  setShipCargo(cargo) {
    this._ship = [...cargo];
    this._bus.emit('cargo:updated', { ship: this.getShipCargo(), fc: this.getFcCargo() });
  }

  setFcCargoFromMarket(marketId, items) {
    if (this._fcMarketId !== null && marketId !== this._fcMarketId) return;
    this._fcMarketId = marketId;
    for (const item of items) {
      const existing = this._fc.find(i => i.name === item.name);
      if (existing) {
        existing.count = item.count;
      } else {
        this._fc.push({ name: item.name, count: item.count });
      }
    }
    logger.info(TAG, `FC cargo synced from market: ${items.length} items merged`);
    this._bus.emit('cargo:updated', { ship: this.getShipCargo(), fc: this.getFcCargo() });
  }

  _handleConsumed(e) {
    this._adjust(this._ship, e.commodity, -e.amount);
    this._bus.emit('cargo:updated', { ship: this.getShipCargo(), fc: this.getFcCargo() });
  }

  setSkipFcJournalUpdates(skip) {
    this._skipFcJournalUpdates = skip;
  }

  _handle(e) {
    switch (e.event) {
      case 'Docked':
        if (e.StationType === 'FleetCarrier') this._fcMarketId = e.MarketID;
        return;
      case 'MarketSell':
        if (this._skipFcJournalUpdates) return;
        if (e.MarketID && e.MarketID === this._fcMarketId) {
          const name = commodityName(e.Type_Localised, e.Type);
          this._adjust(this._fc, name, e.Count);
          logger.info(TAG, `FC +${e.Count} ${name} (market sell)`);
        } else {
          return;
        }
        break;
      case 'MarketBuy':
        if (this._skipFcJournalUpdates) return;
        if (e.MarketID && e.MarketID === this._fcMarketId) {
          const name = commodityName(e.Type_Localised, e.Type);
          this._adjust(this._fc, name, -e.Count);
          logger.info(TAG, `FC -${e.Count} ${name} (market buy)`);
        } else {
          return;
        }
        break;
      case 'CargoTransfer':
        if (this._skipFcJournalUpdates) return;
        for (const t of e.Transfers ?? []) {
          const name = commodityName(t.Type_Localised, t.Type);
          if (t.Direction === 'tocarrier') {
            this._adjust(this._fc, name, t.Count);
            logger.info(TAG, `FC +${t.Count} ${name}`);
          } else if (t.Direction === 'toship') {
            this._adjust(this._fc, name, -t.Count);
            logger.info(TAG, `FC -${t.Count} ${name}`);
          } else {
            logger.warn(TAG, `Unexpected CargoTransfer direction: "${t.Direction}" for ${name}`);
          }
        }
        break;
      default:
        return;
    }
    this._bus.emit('cargo:updated', { ship: this.getShipCargo(), fc: this.getFcCargo() });
  }

  _adjust(list, name, delta) {
    const existing = list.find(c => c.name === name);
    if (existing) {
      existing.count = Math.max(0, existing.count + delta);
      if (existing.count === 0) list.splice(list.indexOf(existing), 1);
    } else if (delta > 0) {
      list.push({ name, count: delta });
    }
  }

  updateFcCargo(commodityName, newCount) {
    const count = Math.max(0, Math.floor(Number(newCount) || 0));
    const existing = this._fc.find(c => c.name === commodityName);
    if (existing) {
      if (count === 0) {
        this._fc.splice(this._fc.indexOf(existing), 1);
      } else {
        existing.count = count;
      }
    } else if (count > 0) {
      this._fc.push({ name: commodityName, count });
    }
    this._bus.emit('cargo:updated', { ship: this.getShipCargo(), fc: this.getFcCargo() });
  }

  getShipCargo() { return [...this._ship]; }
  getFcCargo()   { return [...this._fc]; }
  getFcMarketId() { return this._fcMarketId; }
}
