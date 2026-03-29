import { describe, test, expect, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, appendFileSync, rmSync } from 'fs';
import { join } from 'path';
import { EventEmitter } from 'events';
import { JournalWatcher } from '../../src/core/journal-watcher.js';

const TMP = '/tmp/ed-journal-test-' + Date.now();

afterEach(() => {
  try { rmSync(TMP, { recursive: true }); } catch {}
});

function makeJournal(name, lines = []) {
  mkdirSync(TMP, { recursive: true });
  const path = join(TMP, name);
  writeFileSync(path, lines.map(l => JSON.stringify(l)).join('\n') + (lines.length ? '\n' : ''));
  return path;
}

describe('JournalWatcher', () => {
  test('emits events from existing journal lines on start', async () => {
    makeJournal('Journal.2025-01-01T000000.01.log', [
      { timestamp: '2025-01-01T00:00:00Z', event: 'FileHeader', gameversion: '4.0' },
      { timestamp: '2025-01-01T00:01:00Z', event: 'LoadGame', Commander: 'CMDR Test' },
    ]);
    const bus = new EventEmitter();
    const watcher = new JournalWatcher(TMP, bus);
    const events = [];
    bus.on('journal:event', e => events.push(e));
    await watcher.start();
    await watcher.stop();
    expect(events.map(e => e.event)).toContain('FileHeader');
    expect(events.map(e => e.event)).toContain('LoadGame');
  });

  test('picks up new lines appended to journal', async () => {
    const path = makeJournal('Journal.2025-01-01T000000.01.log', [
      { timestamp: '2025-01-01T00:00:00Z', event: 'FileHeader', gameversion: '4.0' },
    ]);
    const bus = new EventEmitter();
    const watcher = new JournalWatcher(TMP, bus);
    const events = [];
    bus.on('journal:event', e => events.push(e));
    await watcher.start();
    await Bun.sleep(50);
    appendFileSync(path, JSON.stringify({ timestamp: '2025-01-01T00:01:00Z', event: 'Docked', StationName: 'Test' }) + '\n');
    await Bun.sleep(200);
    await watcher.stop();
    expect(events.map(e => e.event)).toContain('Docked');
  });

  test('emits journal:cargo_changed when Cargo.json is written', async () => {
    makeJournal('Journal.2025-01-01T000000.01.log', []);
    const bus = new EventEmitter();
    const watcher = new JournalWatcher(TMP, bus);
    let cargoChanged = false;
    bus.on('journal:cargo_changed', () => { cargoChanged = true; });
    await watcher.start();
    await Bun.sleep(50);
    writeFileSync(join(TMP, 'Cargo.json'), JSON.stringify({ Inventory: [] }));
    await Bun.sleep(200);
    await watcher.stop();
    expect(cargoChanged).toBe(true);
  });
});
