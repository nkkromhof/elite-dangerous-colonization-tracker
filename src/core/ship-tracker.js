import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

export class ShipTracker {
  constructor(eventBus, journalDir) {
    this._ship = null;
    this._bus = eventBus;
    this._journalDir = journalDir;

    eventBus.on('journal:event', (event) => this._handle(event));

    // Scan the latest journal on startup to recover ship state
    // in case the app was restarted mid-session after the Loadout event
    this._initFromJournal();
  }

  _findLatestJournal() {
    if (!this._journalDir || !existsSync(this._journalDir)) return null;
    const files = readdirSync(this._journalDir)
      .filter(f => /^Journal\.\d{4}-\d{2}-\d{2}T\d{6}\.\d+\.log$/.test(f))
      .sort((a, b) => b.localeCompare(a));
    return files.length ? join(this._journalDir, files[0]) : null;
  }

  _initFromJournal() {
    const journalPath = this._findLatestJournal();
    if (!journalPath) return;

    try {
      const lines = readFileSync(journalPath, 'utf8').split('\n');
      const sessionEvents = [];

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.event === 'LoadGame') {
            sessionEvents.length = 0; // new session resets state
            sessionEvents.push(event);
          } else if (event.event === 'ShipyardSwap' || event.event === 'Loadout') {
            sessionEvents.push(event);
          }
        } catch { /* skip malformed lines */ }
      }

      sessionEvents.forEach(e => this._handle(e));
    } catch { /* journal unreadable */ }
  }

  _handle(event) {
    switch (event.event) {
      case 'LoadGame': {
        const name = event.Ship_Localised ?? event.Ship ?? null;
        this._ship = { ...this._ship, name };
        this._bus.emit('ship:updated', this._ship);
        break;
      }
      case 'ShipyardSwap': {
        const name = event.ShipType_Localised ?? event.ShipType ?? null;
        this._ship = { ...this._ship, name };
        console.log('[ShipTracker] Ship switched:', this._ship);
        this._bus.emit('ship:updated', this._ship);
        break;
      }
      case 'Loadout': {
        this._ship = {
          name: this._ship?.name ?? event.Ship ?? null,
          hullHealth: event.HullHealth ?? null,
          maxJumpRange: event.MaxJumpRange ?? null,
          cargoCapacity: event.CargoCapacity ?? null,
        };
        console.log('[ShipTracker] Ship updated:', this._ship);
        this._bus.emit('ship:updated', this._ship);
        break;
      }
      case 'HullDamage': {
        // PlayerPilot flag confirms it's your ship, not an NPC
        if (event.PlayerPilot && this._ship) {
          this._ship.hullHealth = event.Health ?? this._ship.hullHealth;
          this._bus.emit('ship:updated', this._ship);
        }
        break;
      }
      case 'RepairAll':
      case 'Repair': {
        if (this._ship) {
          this._ship.hullHealth = 1.0;
          this._bus.emit('ship:updated', this._ship);
        }
        break;
      }
    }
  }

  getShip() { return this._ship; }
}
