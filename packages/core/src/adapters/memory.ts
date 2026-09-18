/**
 * An in-memory {@link StorageAdapter}.
 *
 * Ships in core on purpose: it is the reference implementation of the adapter
 * contract (about 40 lines of real logic), and it makes every example in the
 * README runnable without credentials or a filesystem.
 */

import type { StorageAdapter, StorageContext, StorageFile, StorageObject } from './../types.js';

/** Options for {@link MemoryAdapter}. */
export interface MemoryAdapterOptions {
  /** URL scheme used for generated URLs. Default `'memory://'`. */
  readonly baseUrl?: string;
  /**
   * Inject a failure for the first N attempts on any key. Test-only, and the
   * reason retry behaviour is easy to verify without mocking a network.
   */
  readonly failAttempts?: number;
}

/** A stored object. */
export interface MemoryEntry {
  readonly key: string;
  readonly data: Uint8Array;
  readonly contentType: string;
  readonly cacheControl?: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

/**
 * @example
 * ```ts
 * const adapter = new MemoryAdapter();
 * const optimizer = new ImageOptimizer({ adapter });
 *
 * await optimizer.optimize({ source: './photo.jpg', formats: ['webp'] });
 * adapter.keys();            // ['a1b2c3d4e5/photo-original.webp']
 * adapter.get(key)?.data;    // the encoded bytes
 * ```
 */
export class MemoryAdapter implements StorageAdapter {
  readonly name = 'memory';

  readonly #files = new Map<string, MemoryEntry>();
  readonly #baseUrl: string;
  readonly #failAttempts: number;
  readonly #attempts = new Map<string, number>();

  constructor(options: MemoryAdapterOptions = {}) {
    this.#baseUrl = options.baseUrl ?? 'memory://';
    this.#failAttempts = options.failAttempts ?? 0;
  }

  async upload(file: StorageFile, _ctx: StorageContext): Promise<StorageObject> {
    const seen = (this.#attempts.get(file.key) ?? 0) + 1;
    this.#attempts.set(file.key, seen);

    if (seen <= this.#failAttempts) {
      // Shaped like a transient network error so the default retry predicate
      // treats it as retryable.
      const error = new Error(`Simulated transient failure ${seen}/${this.#failAttempts}`);
      (error as NodeJS.ErrnoException).code = 'ECONNRESET';
      throw error;
    }

    this.#files.set(file.key, {
      key: file.key,
      data: file.data,
      contentType: file.contentType,
      ...(file.cacheControl ? { cacheControl: file.cacheControl } : {}),
      ...(file.metadata ? { metadata: file.metadata } : {}),
    });

    return {
      key: file.key,
      url: this.getUrl(file.key),
      size: file.data.byteLength,
      ...(file.checksum ? { etag: file.checksum } : {}),
    };
  }

  async exists(key: string): Promise<boolean> {
    return this.#files.has(key);
  }

  async remove(key: string): Promise<void> {
    this.#files.delete(key);
  }

  getUrl(key: string): string {
    return `${this.#baseUrl}${key}`;
  }

  /** Reads back a stored object. */
  get(key: string): MemoryEntry | undefined {
    return this.#files.get(key);
  }

  /** Every stored key, in insertion order. */
  keys(): string[] {
    return [...this.#files.keys()];
  }

  /** Number of stored objects. */
  get size(): number {
    return this.#files.size;
  }

  /** Drops every object and resets the injected-failure counters. */
  clear(): void {
    this.#files.clear();
    this.#attempts.clear();
  }
}
