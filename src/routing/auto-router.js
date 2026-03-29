export class AutoRouter {
  /**
   * Listens for Docked journal events at known construction sites and
   * automatically queries nearest stations for all unfulfilled commodities,
   * then emits `routing:results` on the event bus for SSE broadcast.
   *
   * @param {import('events').EventEmitter} eventBus
   * @param {import('../core/construction-manager.js').ConstructionManager} constructionManager
   * @param {import('./station-finder.js').StationFinder} finder
   */
  constructor(eventBus, constructionManager, finder) {
    this._bus = eventBus;
    this._manager = constructionManager;
    this._finder = finder;

    eventBus.on('journal:event', e => this._onJournalEvent(e));
  }

  async _onJournalEvent(event) {
    if (event.event !== 'Docked') return;

    const construction = this._manager.findByMarketId(event.MarketID);
    if (!construction) return;

    const slots = await this._manager.getCommoditySlots(construction.id);
    const needed = slots.filter(s => s.amount_delivered < s.amount_required);
    if (needed.length === 0) return;

    const system = event.StarSystem;

    const entries = await Promise.all(
      needed.map(async slot => {
        const stations = await this._finder.findNearest(slot.name, system);
        return [slot.name, stations];
      })
    );

    this._bus.emit('routing:results', {
      constructionId: construction.id,
      system,
      results: Object.fromEntries(entries),
    });
  }
}
