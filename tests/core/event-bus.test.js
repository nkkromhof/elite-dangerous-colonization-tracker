import { describe, test, expect } from 'bun:test';
import { eventBus } from '../../src/core/event-bus.js';

describe('eventBus', () => {
  test('emits and receives events', () => {
    let received = null;
    eventBus.once('test:ping', (data) => { received = data; });
    eventBus.emit('test:ping', { value: 42 });
    expect(received).toEqual({ value: 42 });
  });

  test('supports multiple listeners', () => {
    const results = [];
    eventBus.once('test:multi', (d) => results.push(d.n * 2));
    eventBus.once('test:multi', (d) => results.push(d.n * 3));
    eventBus.emit('test:multi', { n: 5 });
    expect(results.sort()).toEqual([10, 15]);
  });
});
