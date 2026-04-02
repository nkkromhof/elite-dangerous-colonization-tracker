/** Maps internal event-bus events to SSE event type names */
const EVENT_MAP = {
  'construction:phase_changed': 'phase_changed',
  'cargo:updated':              'cargo_updated',
  'delivery:detected':          'delivery_detected',
  'construction:added':         'construction_added',
  'commodity:updated':          'commodity_updated',
  'delivery:recorded':          'delivery_recorded',
  'journal:connected':          'journal_connected',
  'journal:error':              'journal_error',
  'app:error':                  'app_error',
  'ship:updated':               'ship_updated',
};

export class SseHandler {
  /** @param {import('events').EventEmitter} eventBus */
  constructor(eventBus) {
    this._clients = new Set();
    this._bus = eventBus;

    Object.entries(EVENT_MAP).forEach(([busEvent, sseType]) => {
      eventBus.on(busEvent, (data) => this._broadcast(sseType, data));
    });
  }

  /**
   * Upgrade an HTTP request to an SSE stream.
   * Returns a Response to pass straight back from a Bun.serve fetch handler.
   */
  createStream() {
    const clients = this._clients;
    let controller;

    const stream = new ReadableStream({
      start(c) {
        controller = c;
        clients.add(controller);
      },
      cancel() {
        clients.delete(controller);
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  _broadcast(type, data) {
    const chunk = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    const encoded = new TextEncoder().encode(chunk);
    for (const ctrl of this._clients) {
      try { ctrl.enqueue(encoded); } catch { this._clients.delete(ctrl); }
    }
  }

  broadcast(type, data) { this._broadcast(type, data); }

  clientCount() { return this._clients.size; }
}
