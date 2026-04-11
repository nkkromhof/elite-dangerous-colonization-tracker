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

Tables in `src/db/schema.sql`:

```sql
constructions
  id INTEGER PRIMARY KEY
  system_name TEXT
  station_name TEXT
  market_id INTEGER UNIQUE
  phase TEXT (scanning|collection|done)
  bound BOOLEAN (whether FC is bound)
  archived BOOLEAN

commodity_slots
  construction_id INTEGER FK
  name TEXT
  amount_required INTEGER
  amount_delivered INTEGER

deliveries
  construction_id INTEGER FK
  commodity_name TEXT
  amount INTEGER
  source TEXT
  delivered_at TIMESTAMP

cargo_state
  ship_cargo JSON
  fc_cargo JSON
  (singleton row)

journal_state
  file_path TEXT
  byte_offset INTEGER
  (singleton row)

market_stations
  construction_id INTEGER FK
  station_name TEXT
  system_name TEXT
  distance_ly REAL
  max_stock INTEGER (for commodity)
  commodity_name TEXT
  updated_at TIMESTAMP

system_coordinates
  system_name TEXT UNIQUE
  x REAL, y REAL, z REAL (star position)
  updated_at TIMESTAMP
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
- On `cargo:updated`, saved to `cargo_state` table
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
