import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { config } from './src/config.js';
import { initDb } from './src/db/database.js';
import { loadCargoState, loadJournalState, saveCargoState, saveJournalState } from './src/db/repositories/commodity-repo.js';
import { eventBus } from './src/core/event-bus.js';
import { JournalWatcher } from './src/core/journal-watcher.js';
import { CargoTracker } from './src/core/cargo-tracker.js';
import { ConstructionManager } from './src/core/construction-manager.js';
import { DeliveryDetector } from './src/core/delivery-detector.js';
import { PhaseMachine } from './src/core/phase-machine.js';
import { ShipTracker } from './src/core/ship-tracker.js';
import { StationLookupService } from './src/core/station-lookup-service.js';
import { MarketTracker } from './src/core/market-tracker.js';
import { SseHandler } from './src/transport/sse-handler.js';
import { startHttpServer } from './src/transport/http-server.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { commodityName } from './src/core/commodity-name.js';

mkdirSync(dirname(config.dbPath), { recursive: true });

initDb(config.dbPath);

const { ship: savedShip, fc: savedFc } = loadCargoState();
const { filePath: lastJournalFile, byteOffset: lastOffset } = loadJournalState();

const cargoTracker = new CargoTracker(eventBus, { ship: savedShip, fc: savedFc });
const constructionManager = new ConstructionManager(eventBus);
const phaseMachine = new PhaseMachine(eventBus);
const shipTracker = new ShipTracker(eventBus, config.journalDir);

const readCargo = () => {
  try {
    const raw = readFileSync(join(config.journalDir, 'Cargo.json'), 'utf8');
    const data = JSON.parse(raw);
    return (data.Inventory ?? []).map(i => ({
      name: commodityName(i.Name_Localised, i.Name),
      count: i.Count,
    }));
  } catch {
    return cargoTracker.getShipCargo();
  }
};

const readFcCargo = () => {
  try {
    const raw = readFileSync(join(config.journalDir, 'Market.json'), 'utf8');
    const data = JSON.parse(raw);
    if (data.StationType !== 'FleetCarrier') return null;
    const items = (data.Items ?? [])
      .filter(i => i.Stock > 0)
      .map(i => ({ name: commodityName(i.Name_Localised, i.Name), count: i.Stock }));
    return { marketId: data.MarketID, items };
  } catch {
    return null;
  }
};

// Sync ship cargo from Cargo.json immediately on startup
cargoTracker.setShipCargo(readCargo());

// Sync FC cargo from Market.json immediately on startup (if last market visit was a fleet carrier)
const fcSnapshot = readFcCargo();
if (fcSnapshot) {
  cargoTracker.setFcCargoFromMarket(fcSnapshot.marketId, fcSnapshot.items);
  console.log(`FC cargo loaded (marketId=${fcSnapshot.marketId}):`);
  for (const { name, count } of fcSnapshot.items) console.log(`  ${name}: ${count}`);
}

new DeliveryDetector(eventBus, constructionManager);
new MarketTracker(eventBus, config.journalDir);
const stationLookupService = new StationLookupService(eventBus, constructionManager);

eventBus.on('journal:cargo_changed', () => cargoTracker.setShipCargo(readCargo()));
eventBus.on('journal:event', (e) => {
  if (e.event === 'EjectCargo') cargoTracker.setShipCargo(readCargo());
});

eventBus.on('journal:market_changed', () => {
  const fc = readFcCargo();
  if (fc) cargoTracker.setFcCargoFromMarket(fc.marketId, fc.items);
});

eventBus.on('delivery:detected', ({ commodity, amount, constructionId }) => {
  constructionManager.recordDelivery({
    construction_id: constructionId,
    commodity_name: commodity,
    amount,
    source: 'ship',
  });
  eventBus.emit('cargo:consumed', { commodity, amount });
});

eventBus.on('cargo:updated', ({ ship, fc }) => saveCargoState(ship, fc));

const sseHandler = new SseHandler(eventBus);
startHttpServer({ manager: constructionManager, machine: phaseMachine, cargoTracker, shipTracker, sseHandler, stationLookupService }, config.port);

stationLookupService.checkAll();

const watcher = new JournalWatcher(config.journalDir, eventBus);
const initialOffset = lastJournalFile ? lastOffset : null;
cargoTracker.setSkipFcJournalUpdates(true);
await watcher.start(initialOffset);
cargoTracker.setSkipFcJournalUpdates(false);

const saveAndExit = async () => {
  saveJournalState(watcher.getCurrentFile(), watcher.getByteOffset());
  saveCargoState(cargoTracker.getShipCargo(), cargoTracker.getFcCargo());
  await watcher.stop();
  process.exit(0);
};
process.on('SIGINT', saveAndExit);
process.on('SIGTERM', saveAndExit);

console.log('ED Colonisation Tracker started');
console.log(`Journal dir: ${config.journalDir}`);
console.log(`HTTP port:   ${config.port}`);
