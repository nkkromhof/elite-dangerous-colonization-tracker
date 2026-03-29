export class TtlCache {
  /** @param {number} ttlMs */
  constructor(ttlMs) {
    this._ttl = ttlMs;
    this._store = new Map();
  }

  set(key, value) {
    this._store.set(key, { value, expiresAt: Date.now() + this._ttl });
  }

  get(key) {
    const entry = this._store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) { this._store.delete(key); return undefined; }
    return entry.value;
  }

  has(key) { return this.get(key) !== undefined; }
  clear()  { this._store.clear(); }
}
