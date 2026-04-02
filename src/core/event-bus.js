import { EventEmitter } from 'events';

export const eventBus = new EventEmitter();
eventBus.setMaxListeners(50);

export function emitError(source, message, details = null) {
  const error = {
    id: Date.now() + Math.random(),
    timestamp: new Date().toISOString(),
    source,
    message,
    details,
  };
  eventBus.emit('app:error', error);
  console.error(`[${source}] ${message}`, details ?? '');
}
