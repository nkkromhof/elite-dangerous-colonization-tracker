# Architecture & Implementation Details

Reference file for [AGENT.md](AGENT.md). Contains event payloads, database schema, feature details, and implementation specifics.

## Event Bus Events

Internal events on shared `eventBus`:

| Event | Source | Payload |
|-------|--------|---------|
| `journal:event` | JournalWatcher | Parsed JSON event from ED journal |
| `journal:cargo_changed` | JournalWatcher | `{ path }` |
| `journal:market_changed` | JournalWatcher | `{ path }` |
| `cargo:updated` | CargoTracker | `{ ship: [], fc: [] }` |
| `delivery:recorded` | ConstructionManager | `{ construction_id, commodity_name, amount, source, slot }` |
| `commodity:updated` | ConstructionManager | `{ constructionId, slot }` |
| `construction:added` | ConstructionManager | Full construction object |
| `construction:phase_changed` | PhaseMachine | `{ constructionId, from, to }` |
| `station:lookup_queued` | StationLookupService | Inara query queued |
| `app:error` | event-bus.js | `{ id, timestamp, source, message, details }` |

## Database Schema

Tables defined in `src/db/database.js` (`CURRENT_SCHEMA_SQL`):

```sql
constructions
  id TEXT PRIMARY KEY
  system_name TEXT
  station_name TEXT
  station_type TEXT
  market_id INTEGER
  phase TEXT (scanning|collection|done)
  bound INTEGER (whether FC is bound)
  is_archived INTEGER
  created_at TEXT
  updated_at TEXT

commodities
  name_internal TEXT PRIMARY KEY  -- canonical internal ED name
  name TEXT                       -- localized display name
  category TEXT
  inara_id TEXT
  updated_at TEXT

commodity_slots
  id TEXT PRIMARY KEY
  construction_id TEXT FK → constructions
  name TEXT
  name_internal TEXT
  commodity_ref TEXT FK → commodities
  amount_required INTEGER
  amount_delivered INTEGER
  updated_at TEXT

slot_lookup_cache
  slot_id TEXT PRIMARY KEY FK → commodity_slots  -- extracted from commodity_slots in v10
  station TEXT
  system TEXT
  supply INTEGER
  queried_at TEXT

deliveries
  id TEXT PRIMARY KEY
  construction_id TEXT FK → constructions
  commodity_name TEXT
  amount INTEGER
  source TEXT
  delivered_at TEXT

cargo_items
  id TEXT PRIMARY KEY
  location TEXT (ship|fc)         -- replaces cargo_state JSON blob (v9)
  commodity_ref TEXT FK → commodities
  name TEXT
  count INTEGER
  updated_at TEXT
  INDEX idx_cargo_location(location)

journal_state
  id TEXT PRIMARY KEY DEFAULT 'singleton'
  file_path TEXT
  byte_offset INTEGER
  updated_at TEXT

system_coordinates
  system_name TEXT PRIMARY KEY
  x REAL, y REAL, z REAL
  updated_at TEXT

station_market_cache
  market_id INTEGER PRIMARY KEY
  station_name TEXT
  station_type TEXT
  system_name TEXT
  x REAL, y REAL, z REAL
  inventory TEXT (JSON)
  recorded_at TEXT

market_inventory_index
  market_id INTEGER FK → station_market_cache
  name_internal TEXT
  stock INTEGER
  PRIMARY KEY (market_id, name_internal)
  INDEX idx_inventory_commodity(name_internal, stock)

commodity_station_results
  name_internal TEXT
  reference_system TEXT
  station TEXT
  system TEXT
  distance_ly REAL
  supply INTEGER
  queried_at TEXT
  PRIMARY KEY (name_internal, reference_system, station)
  INDEX idx_csr_lookup(name_internal, reference_system, distance_ly)
```

## Features

### 1. Delivery Detection

**Flow:**
1. JournalWatcher emits `journal:event` for all ED events
2. DeliveryDetector listens for `Docked` @ `SpaceConstructionDepot`
3. Auto-creates/gets construction via `ConstructionManager.getOrCreateByMarketId()`
4. Listens for `ColonisationConstructionDepot` event → updates required commodities
5. Detects delivery: cargo disappears while docked = delivery recorded

**Methods:**
- `ConstructionManager.createConstruction()` — Create new construction
- `ConstructionManager.getOrCreateByMarketId(marketId)` — Find or auto-create
- `ConstructionManager.recordDelivery()` — Record delivery + emit event
- `ConstructionManager.upsertCommodity()` — Update slot requirements

### 2. Ship Inventory Tracking

**CargoTracker listens for:**
- `MarketBuy` → add to ship
- `MarketSell`, `EjectCargo` → remove from ship
- `CargoTransfer` → move between ship/FC (field: `direction`)
- `Died` → clear ship
- `Docked` @ Fleet Carrier → record FC MarketID

**State persistence:**
- On `cargo:updated`, saved to `cargo_items` table (one row per item, keyed by location)
- Loaded on startup in index.js
- FC cargo boot-sync commented out (under investigation)

**Methods:**
- `CargoTracker.getShipCargo()` — Copy of ship array
- `CargoTracker.getFcCargo()` — Copy of FC array

### 3. Market Caching & Station Lookup

**MarketTracker:**
- Listens for `journal:market_changed` (player's local `Market.json`)
- Parses market data, caches in `market_stations` + `system_coordinates` tables
- Stores station inventory for each commodity

**StationLookupService:**
- Queues async Inara API searches for commodities needed at construction sites
- Rate-limited, cached, with retry logic
- Uses optional `INARA_USER_COOKIE` env var for higher rate limits
- Caches results to avoid repeated API calls

**IniraLookup:**
- HTTP wrapper for Inara.cz API
- Searches commodities by name/ID
- Returns supplier stations with prices

### 4. Frontend Updates

**SSE Flow:**
1. Frontend `connectSSE()` → EventSource `/api/events`
2. Internal events → SSE events via SseHandler
3. Frontend handlers:
   - `cargo_updated` → update state.cargo, re-render
   - `delivery_recorded` → update commodity slot
   - `construction_added` → add tab, switch to new
   - `commodity_updated` → update slot in state
   - `app_error` → add to sessionErrors, show status widget

**Frontend State (app.js):**
```javascript
{
  constructions: [
    { id, system_name, station_name, phase, commodities: [...] }
  ],
  cargo: { ship: [], fc: [] },
  ship: { name, hull, cargo_capacity, jump_range },
  activeConstructionId: null,
  pendingDeleteId: null,
  sessionErrors: [{ id, timestamp, source, message, details }]
}
```

**Render functions:**
- `render()` — Main dispatcher
- `renderTabs()` — Construction tabs
- `renderConstructionCard()` — Commodity table + stepper UI
- `renderStatusWidget()` — Error indicator

### 5. Journal File Parsing

**JournalWatcher:**
1. Finds most recent `Journal.*.log` (pattern: `Journal.\d{4}-\d{2}-\d{2}T\d{6}\.\d+.log`)
2. Reads from byte offset via `_readFrom(filePath, offset)`
3. Skips events until `StartUp` (session boundary)
4. Watches:
   - `Journal.*.log` → parses new lines
   - `Cargo.json` → emits `journal:cargo_changed`
   - `Market.json` → emits `journal:market_changed`
5. Saves byte offset to `journal_state` table for resume on restart

**Key ED Journal Events:**

| Event | Handler | Action |
|-------|---------|--------|
| StartUp | JournalWatcher | Session started |
| Docked | CargoTracker, DeliveryDetector | At construction site → register |
| LoadGame | ShipTracker | Recover ship state |
| ShipyardSwap | ShipTracker | Ship changed |
| Loadout | ShipTracker | Ship loadout changed |
| MarketBuy | CargoTracker | +cargo to ship |
| MarketSell | CargoTracker | -cargo from ship |
| EjectCargo | CargoTracker | -cargo from ship |
| CargoTransfer | CargoTracker | Move ship ↔ FC |
| Died | CargoTracker | Clear ship cargo |
| ColonisationConstructionDepot | DeliveryDetector | Update resource requirements |

### 6. Phase Machine

Valid transitions: `scanning` → `collection` → `done`

Enforced: `PhaseMachine.transition(constructionId, toPhase)` throws if invalid.

## Utilities

| Module | Purpose |
|--------|---------|
| logger.js | Configurable log levels (debug, info, warn, error) |
| commodity-name.js | Normalize ED commodity names (internal vs localized) |
| commodity-categories.js | Map symbol → ED category for API efficiency |
