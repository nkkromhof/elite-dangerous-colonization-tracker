import { findAvailableNeededCommodities } from '../db/repositories/market-cache-repo.js';
import { logger } from './logger.js';

const TAG = 'CurrentStationTracker';

export class CurrentStationTracker {
  constructor(eventBus, constructionManager) {
    this._bus = eventBus;
    this._manager = constructionManager;
    this._currentStation = null;

    eventBus.on('journal:event', (e) => this._handleJournalEvent(e));
    eventBus.on('market:stored', (data) => this._handleMarketStored(data));
  }

  _handleJournalEvent(e) {
    if (e.event === 'Docked') {
      this._currentStation = {
        name: e.StationName,
        system: e.StarSystem,
        marketId: e.MarketID,
      };
      logger.info(TAG, `Docked at ${e.StationName} (${e.StarSystem})`);
      const available = findAvailableNeededCommodities(e.MarketID);
      if (available.length > 0) {
        this._emitAvailable(available);
      }
    } else if (e.event === 'Undocked') {
      if (this._currentStation) {
        logger.info(TAG, `Undocked from ${this._currentStation.name}`);
      }
      this._currentStation = null;
      this._bus.emit('station:left', {});
    }
  }

  _handleMarketStored(data) {
    if (!this._currentStation) return;
    if (data.marketId !== this._currentStation.marketId) return;

    const available = findAvailableNeededCommodities(data.marketId);
    this._emitAvailable(available);
  }

  _emitAvailable(available) {
    if (available.length === 0) {
      this._bus.emit('station:commodities_available', {
        stationName: this._currentStation.name,
        systemName: this._currentStation.system,
        availableCommodities: [],
      });
      return;
    }
    logger.info(TAG, `${available.length} needed commodit${available.length === 1 ? 'y' : 'ies'} available at ${this._currentStation.name}`);
    this._bus.emit('station:commodities_available', {
      stationName: this._currentStation.name,
      systemName: this._currentStation.system,
      availableCommodities: available,
    });
  }

  getCurrentStation() {
    return this._currentStation;
  }

  getAvailableCommodities() {
    if (!this._currentStation) return [];
    return findAvailableNeededCommodities(this._currentStation.marketId);
  }
}
