import { watch as chokidarWatch } from 'chokidar';
import { readdirSync, createReadStream } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';

export class JournalWatcher {
  /** @param {string} journalDir @param {import('events').EventEmitter} eventBus */
  constructor(journalDir, eventBus) {
    this.journalDir = journalDir;
    this.bus = eventBus;
    this._watcher = null;
    this._currentFile = null;
    this._byteOffset = 0;
  }

  /** Find the most recently modified Journal.*.log */
  _findLatestJournal() {
    try {
      const files = readdirSync(this.journalDir)
        .filter(f => /^Journal\.\d{4}-\d{2}-\d{2}T\d{6}\.\d+\.log$/.test(f))
        .map(f => ({ name: f, path: join(this.journalDir, f) }));
      if (!files.length) return null;
      files.sort((a, b) => b.name.localeCompare(a.name));
      return files[0].path;
    } catch {
      return null;
    }
  }

  /** Read from byte offset, emit each parsed JSON line, return new offset */
  async _readFrom(filePath, offset = 0) {
    return new Promise((resolve) => {
      let newOffset = offset;
      const stream = createReadStream(filePath, { start: offset, encoding: 'utf8' });
      const rl = createInterface({ input: stream, crlfDelay: Infinity });
      const lines = [];
      rl.on('line', line => {
        if (!line.trim()) return;
        try {
          const parsed = JSON.parse(line);
          lines.push(parsed);
          newOffset += Buffer.byteLength(line + '\n', 'utf8');
        } catch { /* skip malformed */ }
      });
      rl.on('close', () => {
        lines.forEach(parsed => this.bus.emit('journal:event', parsed));
        resolve(newOffset);
      });
      stream.on('error', () => resolve(offset));
    });
  }

  async start(initialOffset = 0) {
    const latestJournal = this._findLatestJournal();
    if (latestJournal) {
      this._currentFile = latestJournal;
      this._byteOffset = await this._readFrom(latestJournal, initialOffset);
    }

    this._watcher = chokidarWatch(
      [join(this.journalDir, 'Journal.*.log'), join(this.journalDir, 'Cargo.json'), join(this.journalDir, 'Market.json')],
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
      this._byteOffset = await this._readFrom(filePath, 0);
    });

    this.bus.emit('journal:connected', { path: this._currentFile });
  }

  async stop() {
    await this._watcher?.close();
  }

  getCurrentFile() { return this._currentFile; }
  getByteOffset()  { return this._byteOffset; }
}
