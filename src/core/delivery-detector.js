/**
 * Detects deliveries via cargo-delta heuristic:
 * cargo that disappears while docked at a construction site = delivered.
 */
export class DeliveryDetector {
  /**
   * @param {import('events').EventEmitter} eventBus
   * @param {import('./construction-manager.js').ConstructionManager} constructionManager
   * @param {() => Array<{name:string,count:number}>} readCargo  - returns current ship cargo
   */
  constructor(eventBus, constructionManager, readCargo) {
    this._bus = eventBus;
    this._manager = constructionManager;
    this._readCargo = readCargo;
    this._pendingSnapshot = null; // { cargo, constructionId, stationName }
    this._ejectedWhileDocked = {}; // commodityName → count

    eventBus.on('journal:event', e => this._handle(e));
  }

  _isConstructionSite(event) {
    if (event.StationType !== 'SurfaceStation') return false;
    const c = this._manager.findByMarketId(event.MarketID);
    return c !== null;
  }

  _handle(e) {
    switch (e.event) {
      case 'Docked': {
        if (!this._isConstructionSite(e)) {
          this._pendingSnapshot = null;
          return;
        }
        const construction = this._manager.findByMarketId(e.MarketID);
        this._pendingSnapshot = {
          cargo: this._readCargo(),
          constructionId: construction.id,
          stationName: e.StationName,
        };
        this._ejectedWhileDocked = {};
        break;
      }
      case 'EjectCargo': {
        if (!this._pendingSnapshot) return;
        const name = e.Type_Localised ?? e.Type;
        this._ejectedWhileDocked[name] = (this._ejectedWhileDocked[name] ?? 0) + e.Count;
        break;
      }
      case 'Undocked': {
        if (!this._pendingSnapshot) return;
        if (e.StationName !== this._pendingSnapshot.stationName) {
          this._pendingSnapshot = null;
          return;
        }
        const after = this._readCargo();
        const { cargo: before, constructionId } = this._pendingSnapshot;
        this._pendingSnapshot = null;

        for (const bItem of before) {
          const afterCount = after.find(c => c.name === bItem.name)?.count ?? 0;
          const rawDelta = bItem.count - afterCount;
          if (rawDelta <= 0) continue;
          const ejected = this._ejectedWhileDocked[bItem.name] ?? 0;
          const delivered = rawDelta - ejected;
          if (delivered <= 0) continue;

          this._bus.emit('delivery:detected', { constructionId, commodity: bItem.name, amount: delivered, source: 'ship' });
          this._manager.recordDelivery({ construction_id: constructionId, commodity_name: bItem.name, amount: delivered, source: 'ship' });
        }
        break;
      }
    }
  }
}
