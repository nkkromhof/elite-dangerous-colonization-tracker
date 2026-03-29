export class CargoTracker {
  /**
   * @param {import('events').EventEmitter} eventBus
   * @param {{ ship: Array<{name:string,count:number}>, fc: Array<{name:string,count:number}> }} initial
   */
  constructor(eventBus, initial = { ship: [], fc: [] }) {
    this._bus = eventBus;
    this._ship = [...(initial.ship ?? [])];
    this._fc   = [...(initial.fc   ?? [])];
    this._fcMarketId = null;

    eventBus.on('journal:event', (e) => this._handle(e));
  }

  _handle(e) {
    switch (e.event) {
      case 'Docked':
        if (e.StationType === 'FleetCarrier') this._fcMarketId = e.MarketID;
        return;
      case 'MarketBuy':
        this._adjust(this._ship, e.Type_Localised ?? e.Type, e.Count);
        break;
      case 'MarketSell':
        this._adjust(this._ship, e.Type_Localised ?? e.Type, -e.Count);
        break;
      case 'EjectCargo':
        this._adjust(this._ship, e.Type_Localised ?? e.Type, -e.Count);
        break;
      case 'CargoTransfer':
        for (const t of e.Transfers ?? []) {
          const name = t.Type_Localised ?? t.Type;
          if (t.Direction === 'tocarrier') {
            this._adjust(this._ship, name, -t.Count);
            this._adjust(this._fc,   name,  t.Count);
          } else if (t.Direction === 'toship') {
            this._adjust(this._fc,   name, -t.Count);
            this._adjust(this._ship, name,  t.Count);
          }
        }
        break;
      case 'Died':
        this._ship = [];
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

  getShipCargo() { return [...this._ship]; }
  getFcCargo()   { return [...this._fc]; }
  getFcMarketId() { return this._fcMarketId; }
}
