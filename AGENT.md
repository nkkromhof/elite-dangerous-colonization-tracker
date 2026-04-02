# ED Colonisation Tracker - Agent Documentation

## Overview

This is a desktop application that tracks material collection and delivery for construction sites in Elite Dangerous. It monitors the game's journal files to automatically detect cargo deliveries at colonist construction depots.

**Runtime:** Bun (JavaScript runtime, not Node.js)
**Database:** SQLite via `bun:sqlite`
**Frontend:** Vanilla JS, HTML, CSS (no framework)
**Real-time Updates:** Server-Sent Events (SSE)

## Project Structure

```
├── index.js                    # Main entry point - initializes all services
├── package.json                # Bun project (note: uses Bun APIs, not Node)
├── public/
│   ├── index.html              # Main HTML page
│   ├── app.js                  # Frontend JavaScript (state management + rendering)
│   └── styles.css              # Styling
├── src/
│   ├── config.js               # Configuration (journal dir, port, db path, env vars)
│   ├── core/
│   │   ├── event-bus.js        # Central EventEmitter for internal events
│   │   ├── journal-watcher.js  # Watches and parses Elite Dangerous journal files
│   │   ├── cargo-tracker.js    # Tracks ship and Fleet Carrier cargo from journal events
│   │   ├── construction-manager.js  # Manages construction sites, commodity slots
│   │   ├── delivery-detector.js     # Detects deliveries at construction sites
│   │   └── phase-machine.js    # Manages construction phase transitions
│   ├── db/
│   │   ├── database.js        # SQLite initialization via bun:sqlite
│   │   ├── schema.sql         # Database schema reference
│   │   └── repositories/
│   │       ├── construction-repo.js # Construction CRUD operations
│   │       └── commodity-repo.js    # Commodity/delivery/cargo CRUD operations
│   └── transport/
│       ├── http-server.js     # Bun HTTP server with route handling
│       ├── sse-handler.js     # SSE broadcasting (maps bus events to SSE streams)
│       └── routes/
│           ├── constructions.js # GET/POST/DELETE /api/constructions
│           ├── state.js        # GET /api/state (full state snapshot)
│           ├── phase.js        # POST phase transitions
│           └── hotkey.js       # Tab navigation hotkeys
└── data/
    └── colonisation.db        # SQLite database (WAL mode)
```

## Tech Stack Notes

- **Uses Bun APIs:** `Bun.serve()`, `Bun.file()`, `bun:sqlite`
- **NOT Node.js compatible** without modifications (uses Bun-specific imports)
- **Build command:** `bun build --compile --target=bun-windows-x64 ./index.js --outfile ed-colonisation-tracker.exe`
- **Single dependency:** `chokidar` for file watching

## Configuration

Configuration is in `src/config.js` with environment variable overrides:

| Setting | Env Variable | Default |
|---------|--------------|---------|
| Journal Directory | `ED_JOURNAL_DIR` | `Saved Games/Frontier Developments/Elite Dangerous` |
| Database Path | `DB_PATH` | `./data/colonisation.db` |
| HTTP Port | `PORT` | `3000` |

## Core Architecture

### Event Flow

```
Journal Files → JournalWatcher → EventBus → [CargoTracker, DeliveryDetector, ...]
                                           ↓
                                      SSE Handler → Frontend (SSE)
```

### Key Classes

| Class | File | Responsibility |
|-------|------|----------------|
| `JournalWatcher` | `src/core/journal-watcher.js` | Watch journal files, parse JSON lines, emit `journal:event` |
| `CargoTracker` | `src/core/cargo-tracker.js` | Track ship/carrier cargo from journal events |
| `ConstructionManager` | `src/core/construction-manager.js` | CRUD for constructions and commodity slots |
| `DeliveryDetector` | `src/core/delivery-detector.js` | Auto-detect construction sites, update requirements |
| `PhaseMachine` | `src/core/phase-machine.js` | Validate/enforce construction phase transitions |
| `SseHandler` | `src/transport/sse-handler.js` | Bridge event bus → SSE streams |

### Event Bus Events

Internal events emitted on the shared `eventBus`:

| Event | Source | Payload |
|-------|--------|---------|
| `journal:event` | `JournalWatcher` | Parsed journal event object |
| `journal:cargo_changed` | `JournalWatcher` | `{ path }` |
| `journal:market_changed` | `JournalWatcher` | `{ path }` |
| `cargo:updated` | `CargoTracker` | `{ ship: [], fc: [] }` |
| `delivery:recorded` | `ConstructionManager` | `{ construction_id, commodity_name, amount, source, slot }` |
| `commodity:updated` | `ConstructionManager` | `{ constructionId, slot }` |
| `construction:added` | `ConstructionManager` | Full construction object |
| `construction:phase_changed` | `PhaseMachine` | `{ constructionId, from, to }` |
| `app:error` | `event-bus.js` | `{ id, timestamp, source, message, details }` |

## Database Schema

Tables (defined in `src/db/schema.sql`):

```sql
constructions       -- Construction sites (id, system_name, station_name, station_type, market_id, phase)
commodity_slots      -- Required commodities per construction (construction_id, name, amount_required, amount_delivered)
deliveries          -- Delivery history (construction_id, commodity_name, amount, source, delivered_at)
cargo_state         -- Persisted cargo state (ship_cargo JSON, fc_cargo JSON) - singleton row
journal_state       -- Journal file position (file_path, byte_offset) - singleton row
```

## Key Features

### 1. Construction Site / Material Selling

**How deliveries are detected:**
1. `DeliveryDetector` listens for `Docked` events at `SpaceConstructionDepot` station type
2. Auto-creates/registers construction via `ConstructionManager.getOrCreateByMarketId()`
3. Listens for `ColonisationConstructionDepot` events to update required resources
4. The heuristic for detecting actual deliveries appears to be: cargo that disappears while docked at a construction site = delivered

**Key methods:**
- `ConstructionManager.createConstruction()` - Add new construction
- `ConstructionManager.getOrCreateByMarketId()` - Find or create by MarketID
- `ConstructionManager.recordDelivery()` - Record a delivery and emit event
- `ConstructionManager.upsertCommodity()` - Update commodity requirements

### 2. Ship Inventory Tracking

**How it works:**
- `CargoTracker` listens for journal events: `MarketBuy`, `MarketSell`, `EjectCargo`, `CargoTransfer`, `Died`
- Maintains two arrays: `_ship` and `_fc` (Fleet Carrier)
- On `MarketBuy`: adds to ship cargo
- On `MarketSell`/`EjectCargo`: removes from ship cargo
- On `CargoTransfer`: moves between ship and carrier (direction: 'tocarrier' or 'toship')
- On `Died`: clears ship cargo
- State persisted to `cargo_state` table on every `cargo:updated` event

**Key methods:**
- `CargoTracker.getShipCargo()` - Returns copy of ship cargo array
- `CargoTracker.getFcCargo()` - Returns copy of Fleet Carrier cargo array
- `saveCargoState()` / `loadCargoState()` in `commodity-repo.js`

### 3. Data Table Updates (Frontend)

**Update Flow:**
1. **Initial load:** `fetchState()` → GET `/api/state` → returns all constructions + cargo
2. **Real-time:** `connectSSE()` → EventSource to `/api/events`
3. **SSE events handled in frontend:**
   - `cargo_updated` → update `state.cargo`, re-render
   - `delivery_recorded` → update `slot.amount_delivered`, re-render
   - `construction_added` → add to `state.constructions`, switch to new tab
   - `commodity_updated` → update commodity in state, re-render
   - `tab_change` → switch `activeConstructionId`, re-render
   - `app_error` → add to `sessionErrors`, render status widget

**Frontend State (`state` in app.js):**
```javascript
{
  constructions: [],           // Array of { id, system_name, station_name, commodities: [...] }
  cargo: { ship: [], fc: [] }, // Current cargo { name, count }
  activeConstructionId: null,  // Currently selected tab
  pendingDeleteId: null,
  sessionErrors: []
}
```

**Render functions in `public/app.js`:**
- `render()` - Main render dispatcher
- `renderTabs()` - Renders construction tabs
- `renderConstructionCard()` - Renders commodity table with totals
- `renderStatusWidget()` - Renders error status indicator

### 4. Log File Parsing

**JournalWatcher (`src/core/journal-watcher.js`):**

1. **File Discovery:** Finds most recent `Journal.*.log` matching pattern `Journal.\d{4}-\d{2}-\d{2}T\d{6}\.\d+.log`
2. **Reading:** `_readFrom(filePath, offset)` reads from byte offset, yields parsed JSON lines
3. **Session Detection:** Skips all events until `StartUp` event (fresh game session)
4. **Watching:** Uses chokidar to watch:
   - `Journal.*.log` files (parses new lines)
   - `Cargo.json` (emits `journal:cargo_changed`)
   - `Market.json` (emits `journal:market_changed`)
5. **Offset Tracking:** Saves byte offset to resume from last position on restart

**Journal Events Consumed:**
| Event | Handler | Action |
|-------|---------|--------|
| `StartUp` | `JournalWatcher` | Marks session as started |
| `Docked` | `CargoTracker` | Records Fleet Carrier MarketID if station is carrier |
| `Docked` | `DeliveryDetector` | Registers construction site if SpaceConstructionDepot |
| `MarketBuy` | `CargoTracker` | +cargo to ship |
| `MarketSell` | `CargoTracker` | -cargo from ship |
| `EjectCargo` | `CargoTracker` | -cargo from ship |
| `CargoTransfer` | `CargoTracker` | Move between ship/carrier |
| `Died` | `CargoTracker` | Clear ship cargo |
| `ColonisationConstructionDepot` | `DeliveryDetector` | Update resource requirements |

## API Routes

| Endpoint | Method | Handler | Description |
|----------|--------|---------|-------------|
| `/api/state` | GET | `state.js` | Full state snapshot (constructions + cargo) |
| `/api/constructions` | GET | `constructions.js` | List all constructions |
| `/api/constructions` | POST | `constructions.js` | Create construction |
| `/api/constructions/:id` | GET | `constructions.js` | Get single construction |
| `/api/constructions/:id` | DELETE | `constructions.js` | Delete construction |
| `/api/constructions/:id/phase` | POST | `phase.js` | Transition phase |
| `/api/constructions/:id/commodities` | GET | `constructions.js` | Get commodity slots |
| `/api/constructions/:id/commodities/:name` | PATCH | `constructions.js` | Update commodity (amount_required or amount_delivered) |
| `/api/hotkey/next-tab` | POST | `hotkey.js` | Navigate to next tab |
| `/api/hotkey/prev-tab` | POST | `hotkey.js` | Navigate to previous tab |
| `/api/events` | GET | `sse-handler.js` | SSE stream |

## Phase Transitions

Valid phases: `scanning` → `collection` → `done`

Enforced by `PhaseMachine.transition()` - throws if invalid transition attempted.

## Key Files Reference

| Feature | Primary File | Secondary Files |
|---------|-------------|-----------------|
| Log parsing | `journal-watcher.js` | `config.js` |
| Ship inventory | `cargo-tracker.js` | `commodity-repo.js` |
| Construction sites | `construction-manager.js` | `construction-repo.js` |
| Delivery detection | `delivery-detector.js` | `commodity-repo.js` |
| Frontend rendering | `app.js` | `index.html`, `styles.css` |
| Real-time updates | `sse-handler.js` | `http-server.js` |
| Database | `database.js` | `schema.sql`, `*.repo.js` |
| Event system | `event-bus.js` | All core modules |

## Running the Application

```bash
bun run index.js
# Or compiled:
./ed-colonisation-tracker.exe
```

**Environment variables:**
```bash
ED_JOURNAL_DIR=/path/to/journal bun run index.js
PORT=8080 DB_PATH=/tmp/test.db bun run index.js
```
