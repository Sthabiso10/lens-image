/**
 * Result caching.
 *
 * The expensive part of an optimize run is the encode, and the result is a pure
 * function of (source bytes, options). So the cache key is a hash of both, and
 * a hit skips encoding *and* uploading entirely.
 *
 * Three strategies, in increasing order of how much they trust the world:
 *
 * - `'memory'` - process-lifetime LRU. Fast, but a fresh deploy starts cold and
 *   a second instance does the work again.
 * - `'storage'` - memory, plus `adapter.exists()` so a warm bucket short-circuits
 *   a cold process.
 * - a {@link CacheStore} - your own Redis/SQLite, shared across instances.
 */

import type { CacheStore, OptimizeResult } from './types.js';

/**
 * A bounded LRU map.
 *
 * Insertion-ordered `Map` iteration gives us the eviction order for free: the
 * first key `keys().next()` yields is the least recently used, because reads
 * re-insert.
 */
export class MemoryCacheStore implements CacheStore {
  readonly #entries = new Map<string, OptimizeResult>();
  readonly #max: number;

  /** @param max - Entries to keep before evicting the least recently used. */
  constructor(max = 500) {
    this.#max = Math.max(1, Math.floor(max));
  }

  get(key: string): OptimizeResult | undefined {
    const value = this.#entries.get(key);
    if (value === undefined) return undefined;
    // Re-insert to mark as most recently used.
    this.#entries.delete(key);
    this.#entries.set(key, value);
    return value;
  }

  set(key: string, value: OptimizeResult): void {
    if (this.#entries.has(key)) this.#entries.delete(key);
    this.#entries.set(key, value);

    while (this.#entries.size > this.#max) {
      const oldest = this.#entries.keys().next();
      if (oldest.done) break;
      this.#entries.delete(oldest.value);
    }
  }

  delete(key: string): void {
    this.#entries.delete(key);
  }

  /** Drops every entry. */
  clear(): void {
    this.#entries.clear();
  }

  /** Current entry count. Handy in tests and metrics. */
  get size(): number {
    return this.#entries.size;
  }
}

/**
 * A cache store that never stores anything.
 *
 * Lets the optimizer treat "caching off" as just another store, rather than
 * branching on null at every call site.
 */
export const nullCacheStore: CacheStore = {
  get: () => undefined,
  set: () => undefined,
  delete: () => undefined,
};
