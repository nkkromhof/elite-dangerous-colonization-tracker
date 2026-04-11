# ED Colonisation Tracker - Agent Quick Reference

**Bun app** (not Node). Tracks material delivery to construction sites in Elite Dangerous via journal file parsing + automatic docking detection. SQLite, vanilla frontend, SSE updates.

## Stack

- Runtime: **Bun** (Bun.serve, bun:sqlite)
- DB: **SQLite** (WAL)
- Frontend: Vanilla JS + CSS (per [DESIGN.md](DESIGN.md))
- Events: Internal EventBus + SSE to frontend
- Dep: chokidar

## Structure

```
index.js → DB setup, starts all services
src/core/ → JournalWatcher, CargoTracker, ConstructionManager, DeliveryDetector, PhaseMachine
src/core/ → ShipTracker, MarketTracker, StationLookupService (Inara lookups), Logger
src/db/ → Database + repos (construction, commodity, market cache)
src/transport/ → HTTP server, SSE handler, API routes
public/ → index.html, app.js, styles.css
```

## Core Flow

```
ED Journal Files → JournalWatcher → EventBus → CargoTracker, DeliveryDetector, ...
                                              ↓
                                         SSE Handler → Frontend
```

## Modules

| Module | Purpose |
|--------|---------|
| JournalWatcher | Parse ED journal, emit events, track file offset |
| CargoTracker | Track ship + FC cargo from journal events |
| ConstructionManager | CRUD constructions + commodity slots |
| DeliveryDetector | Detect docking @ construction sites |
| PhaseMachine | Validate phase transitions |
| ShipTracker | Recover ship state on restart |
| MarketTracker | Cache local market.json data for Inara lookups |
| StationLookupService | Queue + rate-limit Inara API calls |

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed event flow, event bus events, DB schema, features.

## API Routes

| Endpoint | Action |
|----------|--------|
| `GET /api/state` | Full state snapshot |
| `GET /api/events` | SSE stream |
| `GET/POST /api/constructions` | List/create |
| `GET/DELETE /api/constructions/:id` | View/delete |
| `POST /api/constructions/:id/phase` | Update phase |
| `PATCH /api/constructions/:id/commodities/:name` | Update commodity |
| `POST /api/constructions/:id/refresh-stations` | Manual station lookup |
| `POST /api/hotkey/next-tab` | Next tab |
| `POST /api/hotkey/prev-tab` | Prev tab |

## Config

Via `src/config.js` + env vars:

| Var | Default |
|-----|---------|
| `ED_JOURNAL_DIR` | `Saved Games/Frontier Developments/Elite Dangerous` |
| `DB_PATH` | `./data/colonisation.db` |
| `PORT` | `3000` |
| `LOG_LEVEL` | `info` |
| `INARA_USER_COOKIE` | (optional, for rate limit bump) |

## Run

```bash
bun run index.js
# Build: bun build --compile --target=bun-windows-x64 ./index.js --outfile tracker.exe
```

## Design

[DESIGN.md](DESIGN.md) is authority for frontend decisions. Follow it; consult user if deviation needed.

See [ARCHITECTURE.md](ARCHITECTURE.md) for deeper context on features, event payloads, DB schema, and implementation details.
