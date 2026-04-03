import { commodityName } from './commodity-name.js';

export class DeliveryDetector {
  /**
   * @param {import('events').EventEmitter} eventBus
   * @param {import('./construction-manager.js').ConstructionManager} constructionManager
   */
  constructor(eventBus, constructionManager) {
    this._bus = eventBus;
    this._manager = constructionManager;

    eventBus.on('journal:event', e => this._handle(e));
  }

  _handle(e) {
    switch (e.event) {
      case 'Docked': {
        if (e.StationType !== 'SpaceConstructionDepot') return;
        this._manager.getOrCreateByMarketId({
          market_id: e.MarketID,
          system_name: e.StarSystem,
          station_name: e.StationName,
          station_type: e.StationType,
        });
        break;
      }

      case 'ColonisationContribution': {
        const construction = this._manager.findByMarketId(e.MarketID);
        if (!construction) return;
        for (const c of e.Contributions ?? []) {
          this._bus.emit('delivery:detected', {
            commodity: commodityName(c.Name_Localised, c.Name),
            amount: c.Amount,
            constructionId: construction.id,
          });
        }
        break;
      }

      case 'ColonisationConstructionDepot': {
        const construction = this._manager.findByMarketId(e.MarketID);
        if (!construction) return;
        for (const res of e.ResourcesRequired ?? []) {
          this._manager.syncFromDepot(construction.id, {
            name: commodityName(res.Name_Localised, res.Name),
            name_internal: res.Name,
            amount_required: res.RequiredAmount,
            amount_provided: res.ProvidedAmount,
          });
        }
        break;
      }
    }
  }
}
