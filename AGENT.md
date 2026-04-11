# ED Colonisation Tracker - Contributor Guide

Bun application that tracks material delivery to colonisation construction sites in Elite Dangerous. Parses the game's journal files in real time, detects docking at construction depots, records commodity deliveries, and finds nearby supply stations via Inara. SQLite for persistence, vanilla JS frontend, SSE for live updates.

## Quick Reference

```bash
# Run
bun run index.js

# Test
bun test

# Frontend dev (with hot reload)
bun run dev:frontend

# Frontend production build
bun run build:frontend

# Build (Windows exe)
bun build --compile --target=bun-windows-x64 ./index.js --outfile tracker.exe
```

Environment variables (all optional, see `src/config.js`):

| Variable | Default | Purpose |
|---|---|---|
| `ED_JOURNAL_DIR` | `~/Saved Games/Frontier Developments/Elite Dangerous` | Where ED writes journal files |
| `DB_PATH` | `./data/colonisation.db` | SQLite database location |
| `PORT` | `3000` | HTTP server port |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `INARA_USER_COOKIE` | (none) | `__Host-InaraUser` cookie value from inara.cz for higher rate limits |

## Architecture Overview

```
ED Journal Dir
  |
  ├── Journal.*.log ──► JournalWatcher ──► EventBus ──► [ CargoTracker        ]
  ├── Cargo.json ────►  (chokidar)                      [ DeliveryDetector     ]
  └── Market.json ───►                                   [ ConstructionManager  ]
                                                         [ ShipTracker          ]
                                                         [ MarketTracker        ]
                                                         [ CurrentStationTracker]
                                                         [ StationLookupService ]
                                                                │
                                                         SseHandler ──► Browser
                                                                │
                                                         HTTP API ◄── Browser
```

### Frontend Architecture

```
src/frontend/
  main.js ──► App.svelte
                ├── Header.svelte (zoom, theme, status)
                ├── ShipBar.svelte (ship stats)
                ├── TabBar.svelte (construction tabs)
                └── AllTab.svelte / ConstructionTab.svelte
                     └── CommodityTable + CommodityRow components

  lib/stores/
    sse.svelte.js ──► dispatches to:
      ├── constructions.svelte.js (construction state + aggregation)
      ├── cargo.svelte.js (ship + FC cargo)
      ├── ship.svelte.js (current ship)
      ├── station.svelte.js (docked station)
      ├── errors.svelte.js (session errors)
      └── ui.svelte.js (zoom, theme, phase)
```

The entire application is event-driven. `JournalWatcher` watches the ED journal directory with chokidar, parses new JSON lines from journal files, and emits them as `journal:event` on the shared `EventBus` (a Node.js `EventEmitter`). Every core module subscribes to events it cares about and emits its own events in turn. The `SseHandler` maps internal bus events to SSE event types and pushes them to connected browser clients.

Entry point is `index.js`. Startup sequence:
1. Create data directory, init SQLite database
2. Load persisted cargo and journal state from DB
3. Instantiate core modules (CargoTracker, ConstructionManager, PhaseMachine, ShipTracker)
4. Wire up event listeners between modules (delivery detection, cargo file sync, FC market sync)
5. Instantiate DeliveryDetector, MarketTracker, CurrentStationTracker, StationLookupService
6. Start HTTP server and SSE handler
7. Queue any stale station lookups (`stationLookupService.checkAll()`)
8. Start JournalWatcher with skip flag to prevent double-counting FC cargo during journal replay

## Module Responsibility Map

### `src/core/journal-watcher.js` -- JournalWatcher
Watches the ED journal directory using chokidar. On startup, finds the latest `Journal.*.log` and reads from a persisted byte offset (or from the end of file on first run). Emits `journal:event` for each parsed JSON line, `journal:cargo_changed` when `Cargo.json` changes, and `journal:market_changed` when `Market.json` changes. When a brand-new journal file appears (new game session), it skips all events until it sees a `StartUp` event to avoid replaying stale data.

### `src/core/cargo-tracker.js` -- CargoTracker
Maintains in-memory ship and fleet carrier cargo inventories. Ship cargo is set externally via `setShipCargo()` (called when `Cargo.json` changes -- the game writes this file authoritatively). FC cargo is tracked incrementally from journal events (`MarketBuy`, `MarketSell`, `CargoTransfer`) that occur at the registered FC market ID. Also supports bulk FC sync from `Market.json` via `setFcCargoFromMarket()`. Emits `cargo:updated` on every change. See "Common Pitfalls" for why ship and FC cargo use different update strategies.

### `src/core/delivery-detector.js` -- DeliveryDetector
Listens for three journal events: `Docked` at construction depots (auto-creates the construction via ConstructionManager), `ColonisationContribution` (emits `delivery:detected` for each contributed commodity), and `ColonisationConstructionDepot` (syncs the full commodity requirements list including already-provided amounts). This is the bridge between raw journal events and the construction tracking domain.

### `src/core/construction-manager.js` -- ConstructionManager
CRUD for construction sites and their commodity slots. Maintains an in-memory `marketId -> constructionId` index for fast lookups. `getOrCreateByMarketId` is idempotent -- docking at a known depot reuses the existing record. `syncFromDepot` upserts commodity requirements and sets delivered amounts from the depot's own report. `recordDelivery` increments the delivered count and logs the delivery. All mutations emit events.

### `src/core/phase-machine.js` -- PhaseMachine
Validates construction phase transitions against a fixed state machine: `scanning -> collection -> done`. Throws on invalid transitions. Writes to DB and emits `construction:phase_changed`.

### `src/core/ship-tracker.js` -- ShipTracker
Tracks the player's current ship (name, hull health, jump range, cargo capacity) from journal events (`LoadGame`, `ShipyardSwap`, `Loadout`, `HullDamage`, `Repair`). On startup, replays the latest journal file to recover ship state in case the app was restarted mid-session after the initial `Loadout` event.

### `src/core/market-tracker.js` -- MarketTracker
Caches station market data from `Market.json` into the database (via `market-cache-repo`). Also tracks system coordinates from `FSDJump` and `Location` events for distance calculations. The cached data feeds into StationLookupService and CurrentStationTracker.

### `src/core/current-station-tracker.js` -- CurrentStationTracker
Tracks where the player is currently docked. On docking, queries the market cache to find which construction-needed commodities are available at the current station. Emits `station:commodities_available` so the frontend can highlight shopping opportunities.

### `src/core/station-lookup-service.js` -- StationLookupService
Orchestrates Inara lookups to find the best stations to buy construction commodities. When a commodity slot is added or updated, it queues a lookup. The queue processor: (1) deduplicates by commodity+system, (2) checks the local `commodity_station_results` cache, (3) queries Inara for cache misses with rate limiting (5s between requests, 60s retry on transient failure), (4) runs one-stop analysis for affected constructions. Filters out the player's own fleet carrier from results.

### `src/core/one-stop-analyzer.js` -- analyzeOneStop
Pure function (no side effects, no DB access). Greedy set-cover algorithm that assigns commodities to stations, minimizing the number of stops. Pass 1 applies a strict supply rule (station must have >= 3x the remaining demand). Pass 2 assigns anything still unassigned to the station with the highest absolute supply, flagged as `lowSupply`. Extracted from StationLookupService for testability.

### `src/core/commodity-name.js` -- commodityName, normalizeSavedName
Name normalization utilities. ED journal uses two formats for commodity names: a human-readable `Name_Localised` (e.g. "Liquid Oxygen") and an internal `Name` in `$name;` format (e.g. `$liquidoxygen_name;`). `commodityName()` prefers the localised name, falling back to stripping `$` and `;` from the internal name. `normalizeSavedName()` re-normalizes previously stored names that may have been saved in older formats.

### `src/core/inara-lookup.js` -- lookupNearestStation
HTTP scraper for Inara's commodity search page. Builds a URL matching Inara's form parameters, fetches HTML, parses the results table. Handles Inara's JS challenge page (503 response) by extracting and POSTing the embedded token. Maintains a cookie jar across requests. Maps internal commodity names to Inara IDs via the static `INARA_COMMODITY_IDS` table. **To add support for a new commodity, add an entry to `INARA_COMMODITY_IDS` in `public/inara-commodity-ids.js` mapping the internal name (e.g. `steel: 123`) to its numeric Inara ID.**

### `src/core/event-bus.js`
Exports a shared `EventEmitter` instance and an `emitError()` helper that standardizes error payloads and logs them.

### `src/core/logger.js`
Structured logger with level filtering (`debug`/`info`/`warn`/`error`). Every log call takes a component tag as the first argument: `logger.info('CargoTracker', 'message')`.

### `src/core/commodity-categories.js`
Static mapping of ED commodity symbols to market categories (Metals, Chemicals, Machinery, etc.). Used for grouping in UI and Inara queries.

### `src/db/database.js`
SQLite database initialization with versioned migrations. See "Database Conventions" below.

### `src/db/repositories/`
Data access layer. Each repo file exports plain functions (not classes) that operate on the shared DB singleton from `getDb()`:
- `construction-repo.js` -- constructions table CRUD
- `slot-repo.js` -- commodity_slots + slot_lookup_cache reads/writes
- `delivery-repo.js` -- deliveries log
- `cargo-repo.js` -- cargo_items persistence, journal state save/load
- `commodity-repo.js` -- commodities reference table
- `market-cache-repo.js` -- station_market_cache, market_inventory_index, system_coordinates, commodity_station_results

### `src/transport/http-server.js`
Bun.serve-based HTTP server. Routes requests to handler functions in `src/transport/routes/`. Serves static files from `public/`. CORS enabled.

### `src/transport/sse-handler.js`
Maps internal EventBus events to SSE event types (e.g., `cargo:updated` becomes `cargo_updated`). Manages connected SSE clients via `ReadableStream` controllers.

### `src/transport/routes/`
Route handlers organized by domain: `constructions.js`, `phase.js`, `cargo.js`, `hotkey.js`, `state.js`. Each exports handler functions that receive the request, extract params, call into the appropriate manager/service, and return a `Response`.

### `src/frontend/`
Svelte 5 frontend. Source compiled by Vite to `public/dist/`. Connects to `/api/events` for SSE updates and calls the REST API for mutations. State managed by reactive stores (`lib/stores/*.svelte.js`); UI composed from components (`lib/components/`). See `DESIGN.md` for frontend design authority.

### `public/`
Static assets served by the backend. `public/dist/` contains the Vite build output. `public/inara-commodity-ids.js` is shared between frontend and backend.

## Database Conventions

The database uses a versioned migration system in `src/db/database.js`.

**Key constants:**
- `CURRENT_VERSION` (currently 10) -- bump this when adding a migration
- `CURRENT_SCHEMA_SQL` -- the complete schema for a fresh install
- `MIGRATIONS` -- array of incremental upgrade functions, index `N` upgrades from version `N` to `N+1`

**How fresh installs work:** `CURRENT_SCHEMA_SQL` runs directly. No migrations are executed. This keeps new installs clean (no dead tables from removed features).

**How upgrades work:** The `_schema_version` table stores the current version. On startup, `initDb()` runs migrations from the stored version up to `CURRENT_VERSION`. Pre-versioned databases (created before the migration system) are detected by checking for existing tables, and their version is inferred by `_detectLegacyVersion()`.

**To add a new table or column:**
1. Add the table/column to `CURRENT_SCHEMA_SQL` (for fresh installs)
2. Append a new migration function to the `MIGRATIONS` array that applies the change to existing databases
3. Increment `CURRENT_VERSION`
4. Never modify an existing migration -- always append a new one

**SQLite conventions:**
- WAL journal mode and foreign keys are always enabled
- UUIDs (`randomUUID()`) for primary keys on domain tables
- Timestamps stored as ISO 8601 strings
- Repositories use `getDb()` from `database.js` (module-level singleton)

## Testing Standards

Tests use `bun test` with Bun's built-in test runner.

**Directory structure mirrors src:**
```
tests/
  core/
    cargo-tracker.test.js
    delivery-detector.test.js
    commodity-name.test.js
    one-stop-analyzer.test.js
    construction-manager.test.js
    event-bus.test.js
    journal-watcher.test.js
    phase-machine.test.js
  db/
    database.test.js
    cargo-items.test.js
    commodity-repo.test.js
    commodity-table-repo.test.js
    construction-repo.test.js
```

**Patterns:**
- Import `describe`, `test`, `expect`, `afterEach` from `bun:test`
- Use `describe()` blocks per module/class, `test()` for individual behaviors
- Tests that touch the database call `initDb(':memory:')` to get an isolated in-memory SQLite instance
- Always add `afterEach(() => getDb()?.close())` in describe blocks that use the DB -- this prevents leaked handles between tests
- Pure modules (like `commodity-name.js`, `one-stop-analyzer.js`) are tested without DB setup
- Use a factory helper at the top of the file (e.g., `makeTracker()`, `makeSetup()`) to wire up the EventBus and dependencies
- Tests emit events directly on the bus to simulate journal input rather than mocking file I/O
- Assertions use `expect().toEqual()` for value equality, `expect().toBe()` for identity/primitives, `expect().toMatchObject()` for partial matching

**What to test:**
- State mutations from event handling (emit event, check state)
- Edge cases: zero counts, missing fields, duplicate events
- Event emission (subscribe before acting, capture in a variable)
- Idempotency where relevant (e.g., getOrCreateByMarketId)

### Frontend Testing

Frontend stores and utilities follow the same `bun test` workflow as backend tests.

**Test location:** `tests/frontend/stores/` and `tests/frontend/utils/`

**Requirements:**
- When modifying frontend stores or utilities, run the relevant tests before committing
- When adding new store logic or utility functions, write corresponding tests
- Tests are not required for `.svelte` component files (declarative templates), but are required for JavaScript logic in stores and utilities that drives application behavior
- Store tests import functions directly from `.svelte.js` files and assert on state mutations
- Utility tests are pure function tests -- no DOM or framework setup needed

## Code Style

- **Svelte 5 frontend.** Frontend uses Svelte 5 with Vite. Source in `src/frontend/`, builds to `public/dist/`. Backend remains vanilla JS with Bun-first APIs -- no frameworks on the backend.
- **ESM imports** (`import`/`export`), never CommonJS `require()`.
- **Bun-first APIs.** Use `Bun.serve`, `bun:sqlite`, `bun:test`. Avoid Node-specific alternatives where Bun provides its own.
- **Classes for stateful modules** (CargoTracker, JournalWatcher, etc.), **plain exported functions for stateless logic** (repositories, commodity-name, one-stop-analyzer).
- **EventBus coupling.** Modules receive the bus via constructor injection and subscribe in the constructor. They do not import the global `eventBus` directly (only `index.js` and `event-bus.js` touch the singleton).
- **Logger convention.** Define a `const TAG = 'ModuleName'` at the top of each file. Use `logger.info(TAG, 'message')`.
- **No TypeScript, but JSDoc.** Constructor params and complex functions use `@param` JSDoc annotations for editor support.
- **Frontend authority.** `DESIGN.md` governs all frontend decisions. Consult it before changing `public/`.

## Common Pitfalls

### Ship cargo vs. FC cargo: different update models
Ship cargo is set wholesale from `Cargo.json` via `setShipCargo()`. The game writes this file authoritatively after every cargo change, so we treat it as the source of truth. FC cargo has no equivalent file -- it is tracked incrementally from journal events (`MarketBuy`, `MarketSell`, `CargoTransfer`) that occur at the FC's registered market ID. The `setFcCargoFromMarket()` method provides a bulk sync path from `Market.json` when the player is docked at their FC, but this only works when `Market.json` happens to contain FC data. This asymmetry is fundamental to ED's data model, not a design choice.

### FC market ID registration
CargoTracker only processes FC cargo changes for events whose `MarketID` matches `this._fcMarketId`. This ID is set when the player docks at a FleetCarrier (`Docked` event with `StationType === 'FleetCarrier'`). If the app starts fresh with no docking history, FC cargo tracking is inert until the player docks at their carrier. `setFcCargoFromMarket()` also sets the market ID on first call, but rejects subsequent calls with a different market ID to prevent cross-contamination from other carriers.

### The skip flag (`setSkipFcJournalUpdates`)
During startup, the JournalWatcher replays journal events from the persisted byte offset. These replayed events include `MarketBuy`/`MarketSell`/`CargoTransfer` that already happened in a previous session. Without protection, they would double-count FC cargo changes. The solution: `index.js` sets `cargoTracker.setSkipFcJournalUpdates(true)` before starting the watcher and clears it after the initial read completes. While the flag is set, all journal-driven FC cargo mutations are silently ignored. Ship cargo is unaffected because it is reset from `Cargo.json` which always reflects the current state.

### Commodity name normalization (`$name;` format)
ED's journal uses two formats for commodity names: `Name_Localised` (human-readable, e.g., "Liquid Oxygen") and `Name` (internal, e.g., `$liquidoxygen_name;`). The `$..._name;` prefix/suffix is not always present -- sometimes just the bare symbol appears. `commodityName(localised, internal)` always prefers the localised form. When only the internal form is available, it strips `$` and `;`, then capitalizes. `normalizeSavedName()` does the same for values that were previously persisted and may be in any legacy format. Always use these functions rather than ad-hoc string manipulation.

### Journal replay and the StartUp sentinel
When the JournalWatcher encounters a new journal file (via chokidar `add` event), it reads from offset 0 but skips all events until it sees a `StartUp` event. This prevents processing stale events from a previous game session that happen to be in a newly rotated journal file. The regular `change` handler does not apply this filter -- it trusts the byte offset to position correctly within the current session.

### Inara challenge page
Inara serves a JavaScript challenge page (HTTP 503) to unrecognized clients. The lookup module detects this by checking for `challenge-container` in the response body, extracts the embedded token, POSTs it to `/validatechallenge.php`, and retries. The `inarasite=1` cookie is always set to bypass the initial JS check, and the optional `INARA_USER_COOKIE` env var provides an authenticated session for higher rate limits.

### Database: never modify existing migrations
Migrations are append-only. Users in the wild have databases at various versions. If you change migration v5, it will never re-run for anyone already at v5+. Always add a new migration and bump `CURRENT_VERSION`. Update `CURRENT_SCHEMA_SQL` as well so fresh installs get the correct schema directly.
