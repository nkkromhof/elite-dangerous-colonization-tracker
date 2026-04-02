const DEBUG = false;
const log = (...args) => DEBUG && console.log('[DeliveryDetector]', ...args);

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
    this._snapshotCargo = null; // copy of cargo at dock for undock detection
    this._ejectedWhileDocked = {}; // commodityName → count

    eventBus.on('journal:event', e => this._handle(e));
  }

  _isConstructionSite(event) {
    if (event.StationType !== 'SpaceConstructionDepot') {
      log(`Not a construction site: StationType=${event.StationType}`);
      return false;
    }
    log(`Docked at construction site: MarketID=${event.MarketID}, Station=${event.StationName}`);
    return true;
  }

  _handle(e) {
    switch (e.event) {
      case 'Docked': {
        if (!this._isConstructionSite(e)) {
          this._pendingSnapshot = null;
          return;
        }
        const constructionId = this._manager.getOrCreateByMarketId({
          market_id: e.MarketID,
          system_name: e.StarSystem,
          station_name: e.StationName,
          station_type: e.StationType,
        });
        log(`Auto-registered construction: id=${constructionId}`);
        const cargo = this._readCargo();
        this._pendingSnapshot = {
          cargo,
          constructionId,
          stationName: e.StationName,
        };
        this._snapshotCargo = cargo.map(c => ({ ...c }));
        this._ejectedWhileDocked = {};
        break;
      }
      case 'Undocked': {
        if (!this._pendingSnapshot) return;
        const currentCargo = this._readCargo();
        const snapshotCargo = this._snapshotCargo;
        this._detectDeliveries(snapshotCargo, currentCargo, this._pendingSnapshot.constructionId);
        this._pendingSnapshot = null;
        this._snapshotCargo = null;
        break;
      }
      case 'EjectCargo': {
        if (!this._pendingSnapshot) return;
        const name = e.Type_Localised ?? e.Type;
        this._ejectedWhileDocked[name] = (this._ejectedWhileDocked[name] ?? 0) + e.Count;
        break;
      }
      case 'MarketSell': {
        if (!this._pendingSnapshot) return;
        const name = e.Type_Localised ?? e.Type;
        const count = e.Count;
        const prevCount = this._pendingSnapshot.cargo.find(c => c.name === name)?.count ?? 0;
        const ejected = this._ejectedWhileDocked[name] ?? 0;
        const delivered = Math.max(0, prevCount - count - ejected);
        if (delivered > 0) {
          log(`Detected delivery: ${name} x${delivered}`);
          this._bus.emit('delivery:detected', {
            commodity: name,
            amount: delivered,
            constructionId: this._pendingSnapshot.constructionId,
          });
        }
        this._pendingSnapshot.cargo = this._pendingSnapshot.cargo.map(c =>
          c.name === name ? { ...c, count } : c
        );
        if (this._snapshotCargo) {
          this._snapshotCargo = this._snapshotCargo.map(c =>
            c.name === name ? { ...c, count } : c
          );
        }
        break;
      }
      case 'ColonisationConstructionDepot': {
        const constructionId = this._pendingSnapshot?.constructionId ?? this._manager.findByMarketId(e.MarketID)?.id;
        if (!constructionId) {
          log(`ColonisationConstructionDepot: unknown MarketID=${e.MarketID}`);
          return;
        }
        let updated = false;
        for (const res of e.ResourcesRequired ?? []) {
          const name = res.Name_Localised ?? res.Name;
          const amount = res.RequiredAmount;
          const existing = this._manager.getCommoditySlot(constructionId, name);
          if (!existing || existing.amount_required !== amount) {
            this._manager.upsertCommodity(constructionId, {
              name,
              name_internal: res.Name,
              amount_required: amount,
            });
            updated = true;
          }
        }
        if (updated) {
          log(`Updated resource requirements for construction ${constructionId}`);
        }
        break;
      }
    }
  }

  _detectDeliveries(snapshot, currentCargo, constructionId) {
    for (const item of snapshot) {
      const current = currentCargo.find(c => c.name === item.name)?.count ?? 0;
      const ejected = this._ejectedWhileDocked[item.name] ?? 0;
      const delivered = Math.max(0, item.count - current - ejected);
      if (delivered > 0) {
        log(`Detected delivery on undock: ${item.name} x${delivered}`);
        this._bus.emit('delivery:detected', {
          commodity: item.name,
          amount: delivered,
          constructionId,
        });
      }
    }
  }
}
