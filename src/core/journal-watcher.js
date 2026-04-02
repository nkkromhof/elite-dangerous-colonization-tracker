import { watch as chokidarWatch } from 'chokidar';
import { readdirSync, createReadStream, statSync, existsSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';
import { emitError } from './event-bus.js';

export class JournalWatcher {
  /** @param {string} journalDir @param {import('events').EventEmitter} eventBus */
  constructor(journalDir, eventBus) {
    this.journalDir = journalDir;
    this.bus = eventBus;
    this._watcher = null;
    this._currentFile = null;
    this._byteOffset = 0;
    this._journalDirError = false;
  }

  /** Find the most recently modified Journal.*.log */
  _findLatestJournal() {
    if (!existsSync(this.journalDir)) {
      if (!this._journalDirError) {
        emitError('Journal', `Journal directory not found`, this.journalDir);
        this._journalDirError = true;
      }
      return null;
    }
    try {
      const files = readdirSync(this.journalDir)
        .filter(f => /^Journal\.\d{4}-\d{2}-\d{2}T\d{6}\.\d+\.log$/.test(f))
        .map(f => ({ name: f, path: join(this.journalDir, f) }));
      if (!files.length) return null;
      files.sort((a, b) => b.name.localeCompare(a.name));
      return files[0].path;
    } catch (e) {
      emitError('Journal', `Cannot read journal directory`, e.message);
      return null;
    }
  }

  /** Read from byte offset, emit each parsed JSON line, return new offset.
   *  awaitStartup: if true, skip events until a StartUp event is seen (new game session). */
  async _readFrom(filePath, offset = 0, awaitStartup = false) {
    return new Promise((resolve) => {
      let newOffset = offset;
      let seenStartup = !awaitStartup;
      const stream = createReadStream(filePath, { start: offset, encoding: 'utf8' });
      const rl = createInterface({ input: stream, crlfDelay: Infinity });
      const lines = [];
      rl.on('line', line => {
        if (!line.trim()) return;
        try {
          const parsed = JSON.parse(line);
          // Skip all events until we see StartUp (fresh game session)
          if (!seenStartup) {
            if (parsed.event === 'StartUp') {
              seenStartup = true;
              console.log('[JournalWatcher] Session started, processing events');
            } else {
              newOffset += Buffer.byteLength(line + '\n', 'utf8');
              return; // Skip pre-StartUp events
            }
          }
          lines.push(parsed);
          newOffset += Buffer.byteLength(line + '\n', 'utf8');
        } catch { /* skip malformed */ }
      });
      rl.on('close', () => {
        lines.forEach(parsed => this.bus.emit('journal:event', parsed));
        resolve(newOffset);
      });
      stream.on('error', (err) => {
        emitError('Journal', `Error reading log file`, `${filePath}: ${err.message}`);
        resolve(offset);
      });
    });
  }

  async start(initialOffset = null) {
    const latestJournal = this._findLatestJournal();
    if (latestJournal) {
      this._currentFile = latestJournal;
      // If no saved offset (first run, null), start from end of file (only watch new events)
      if (initialOffset === null) {
        const stats = statSync(latestJournal);
        initialOffset = stats.size;
        console.log(`[JournalWatcher] First run - starting from end of journal at offset ${initialOffset}`);
      }
      this._byteOffset = await this._readFrom(latestJournal, initialOffset);
    }

    this._watcher = chokidarWatch(
      this.journalDir,
      { ignoreInitial: true, usePolling: false, awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 } }
    );

    this._watcher.on('change', async (filePath) => {
      if (filePath.endsWith('Cargo.json')) {
        this.bus.emit('journal:cargo_changed', { path: filePath });
        return;
      }
      if (filePath.endsWith('Market.json')) {
        this.bus.emit('journal:market_changed', { path: filePath });
        return;
      }
      if (!filePath.match(/Journal\.\d{4}-\d{2}-\d{2}T\d{6}\.\d+\.log$/)) return;
      if (filePath !== this._currentFile) {
        this._currentFile = filePath;
        this._byteOffset = 0;
      }
      this._byteOffset = await this._readFrom(filePath, this._byteOffset);
    });

    this._watcher.on('add', async (filePath) => {
      if (filePath.endsWith('Cargo.json')) {
        this.bus.emit('journal:cargo_changed', { path: filePath });
        return;
      }
      if (filePath.endsWith('Market.json')) {
        this.bus.emit('journal:market_changed', { path: filePath });
        return;
      }
      if (!filePath.match(/Journal\.\d{4}-\d{2}-\d{2}T\d{6}\.\d+\.log$/)) return;
      this._currentFile = filePath;
      this._byteOffset = await this._readFrom(filePath, 0, true);
    });

    this.bus.emit('journal:connected', { path: this._currentFile });
  }

  async stop() {
    await this._watcher?.close();
  }

  getCurrentFile() { return this._currentFile; }
  getByteOffset()  { return this._byteOffset; }
}
