export class ShipTracker {
  constructor(eventBus) {
    this._ship = null;
    this._bus = eventBus;
    eventBus.on('journal:event', (event) => this._handle(event));
  }

  _handle(event) {
    if (event.event === 'LoadGame') {
      // Capture localised ship name; stats come from Loadout
      const name = event.Ship_Localised ?? event.Ship ?? null;
      this._ship = { ...this._ship, name };
      this._bus.emit('ship:updated', this._ship);
    } else if (event.event === 'Loadout') {
      this._ship = {
        name: this._ship?.name ?? event.Ship ?? null,
        hullHealth: event.HullHealth ?? null,
        maxJumpRange: event.MaxJumpRange ?? null,
        cargoCapacity: event.CargoCapacity ?? null,
      };
      this._bus.emit('ship:updated', this._ship);
    }
  }

  getShip() { return this._ship; }
}
