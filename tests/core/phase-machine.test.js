import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { EventEmitter } from 'events';
import { initDb, getDb } from '../../src/db/database.js';
import { ConstructionManager } from '../../src/core/construction-manager.js';
import { PhaseMachine } from '../../src/core/phase-machine.js';
import { getConstruction } from '../../src/db/repositories/construction-repo.js';

describe('PhaseMachine', () => {
  let bus, manager, machine, cid;

  beforeEach(() => {
    initDb(':memory:');
    bus = new EventEmitter();
    manager = new ConstructionManager(bus);
    machine = new PhaseMachine(bus);
    cid = manager.createConstruction({ system_name: 'Sol', station_name: 'Site A', station_type: 'SurfaceStation', market_id: 1 });
  });
  afterEach(() => getDb()?.close());

  test('transitions scanning → collection', () => {
    machine.transition(cid, 'collection');
    expect(getConstruction(cid).phase).toBe('collection');
  });

  test('transitions collection → done', () => {
    machine.transition(cid, 'collection');
    machine.transition(cid, 'done');
    expect(getConstruction(cid).phase).toBe('done');
  });

  test('rejects invalid transition', () => {
    expect(() => machine.transition(cid, 'done')).toThrow();
  });

  test('emits phase_changed event on valid transition', () => {
    let changed = null;
    bus.on('construction:phase_changed', d => { changed = d; });
    machine.transition(cid, 'collection');
    expect(changed).toMatchObject({ constructionId: cid, from: 'scanning', to: 'collection' });
  });
});
