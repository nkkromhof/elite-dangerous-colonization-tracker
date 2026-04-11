import { readFileSync } from 'fs';
import { join } from 'path';
import { upsertStationMarket, getSystemCoordinates, upsertSystemCoordinates } from '../db/repositories/market-cache-repo.js';
import { commodityName } from './commodity-name.js';
import { logger } from './logger.js';

const TAG = 'MarketTracker';

export class MarketTracker {
  /**
   * @param {import('events').EventEmitter} bus
   * @param {string} journalDir
   */
  constructor(bus, journalDir) {
    this._journalDir = journalDir;
    this._bus = bus;

    bus.on('journal:event', (e) => {
      // Track system coordinates from every jump/location event
      if ((e.event === 'FSDJump' || e.event === 'Location') && e.StarSystem && e.StarPos) {
        upsertSystemCoordinates(e.StarSystem, e.StarPos[0], e.StarPos[1], e.StarPos[2]);
        logger.debug(TAG, `Stored coords for ${e.StarSystem}: ${e.StarPos}`);
      }
    });

    bus.on('journal:market_changed', () => {
      this._processMarketFile();
    });
  }

  _processMarketFile() {
    const path = join(this._journalDir, 'Market.json');
    try {
      const raw = readFileSync(path, 'utf8');
      const data = JSON.parse(raw);
      this._store(data);
    } catch (err) {
      logger.warn(TAG, `Failed to read Market.json: ${err.message}`);
    }
  }

  /**
   * Store a parsed Market.json payload into the cache.
   * Can be called directly for seeding.
   */
  storeMarketData(data) {
    this._store(data);
  }

  _store(data) {
    const { MarketID, StationName, StationType, StarSystem, Items, timestamp } = data;
    if (!MarketID || !StationName || !StarSystem || !Array.isArray(Items)) {
      logger.warn(TAG, `Market.json missing required fields`);
      return;
    }

    // Get coordinates for this system (may be null if we've never jumped there)
    const coords = getSystemCoordinates(StarSystem);

    // Only keep items with actual stock available to buy
    const inventory = Items
      .filter(i => i.Stock > 0 && i.BuyPrice > 0)
      .map(i => ({ nameInternal: i.Name, name: commodityName(i.Name_Localised, i.Name), stock: i.Stock }));

    upsertStationMarket({
      marketId: MarketID,
      stationName: StationName,
      stationType: StationType ?? null,
      systemName: StarSystem,
      x: coords?.x ?? null,
      y: coords?.y ?? null,
      z: coords?.z ?? null,
      inventory,
      recordedAt: timestamp ?? new Date().toISOString(),
    });

    logger.info(TAG, `Cached ${inventory.length} items from ${StationName} (${StarSystem})`);

    this._bus.emit('market:stored', { marketId: MarketID, stationName: StationName, systemName: StarSystem });
  }
}
