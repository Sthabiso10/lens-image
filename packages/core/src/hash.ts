/** Content hashing, via `node:crypto`. Used for cache keys, ETags and filenames. */

import { createHash } from 'node:crypto';

/** Full lowercase hex SHA-256 of some bytes. */
export function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Short hash for use in URLs and filenames.
 *
 * 10 hex characters is 40 bits. For content-addressed asset names that is a
 * ~1-in-a-million collision chance at a million distinct images, which is the
 * same trade-off webpack and friends make for chunk hashes.
 */
export function shortHash(data: Uint8Array | string, length = 10): string {
  const hash = typeof data === 'string' ? createHash('sha256').update(data).digest('hex') : sha256(data);
  return hash.slice(0, length);
}

/**
 * Stable hash of an arbitrary options object.
 *
 * Object keys are sorted so `{ a, b }` and `{ b, a }` produce the same cache
 * key - otherwise property order would silently fragment the cache.
 */
export function hashOptions(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex').slice(0, 16);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(',')}}`;
}
