/**
 * Seed the market cache and system coordinates from journal history + current Market.json.
 * Run once: bun run scripts/seed-market-cache.js
 */
import { join } from 'path';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import { config } from '../src/config.js';
import { initDb } from '../src/db/database.js';
import { upsertSystemCoordinates, upsertStationMarket } from '../src/db/repositories/market-cache-repo.js';

initDb(config.dbPath);

const JOURNAL_DIR = config.journalDir;
const SEVEN_DAYS_AGO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

// ── 1. Scan journals for system coordinates ───────────────────────────────────

const journalFiles = readdirSync(JOURNAL_DIR)
  .filter(f => /^Journal\.\d{4}-\d{2}-\d{2}T\d{6}\.\d+\.log$/.test(f))
  .filter(f => {
    const dateStr = f.slice(8, 18); // "2026-04-03"
    return new Date(dateStr) >= SEVEN_DAYS_AGO;
  })
  .map(f => join(JOURNAL_DIR, f));

console.log(`Scanning ${journalFiles.length} journal file(s) for system coordinates...`);

const systems = {};
for (const filePath of journalFiles) {
  const lines = readFileSync(filePath, 'utf8').split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if ((e.event === 'FSDJump' || e.event === 'Location') && e.StarSystem && e.StarPos) {
        systems[e.StarSystem] = e.StarPos;
      }
    } catch {}
  }
}

for (const [name, pos] of Object.entries(systems)) {
  upsertSystemCoordinates(name, pos[0], pos[1], pos[2]);
  console.log(`  Coords: ${name} [${pos.join(', ')}]`);
}
console.log(`Stored ${Object.keys(systems).length} system(s).\n`);

// ── 2. Store current Market.json ──────────────────────────────────────────────

const marketPath = join(JOURNAL_DIR, 'Market.json');
if (existsSync(marketPath)) {
  const data = JSON.parse(readFileSync(marketPath, 'utf8'));
  const { MarketID, StationName, StationType, StarSystem, Items, timestamp } = data;

  const coords = systems[StarSystem] ?? null;
  const inventory = (Items ?? [])
    .filter(i => i.Stock > 0 && i.BuyPrice > 0)
    .map(i => ({ nameInternal: i.Name, name: i.Name_Localised, stock: i.Stock }));

  upsertStationMarket({
    marketId: MarketID,
    stationName: StationName,
    stationType: StationType ?? null,
    systemName: StarSystem,
    x: coords ? coords[0] : null,
    y: coords ? coords[1] : null,
    z: coords ? coords[2] : null,
    inventory,
    recordedAt: timestamp ?? new Date().toISOString(),
  });

  console.log(`Market.json: ${StationName} (${StarSystem})`);
  console.log(`  Stored ${inventory.length} items with stock > 0.`);
} else {
  console.log('Market.json not found — skipping.');
}

console.log('\nSeed complete.');
