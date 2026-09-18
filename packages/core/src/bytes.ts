/**
 * Byte formatting.
 *
 * Its own module so that `validation.ts` - and therefore the whole `./browser`
 * entry point - does not have to import `source.ts`, which pulls in `node:fs`
 * and `node:path` at the top level.
 */

/**
 * Human-readable byte count, using binary units.
 *
 * @example
 * ```ts
 * formatBytes(900);       // '900 B'
 * formatBytes(5_242_880); // '5.0 MiB'
 * ```
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}
