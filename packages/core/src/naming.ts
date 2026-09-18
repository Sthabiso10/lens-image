/**
 * Output key templating.
 *
 * Keys are how everything downstream addresses a variant - the S3 object key,
 * the path under a local root, the public URL. They must be deterministic
 * (so caching works), URL-safe (so nobody has to think about encoding), and
 * predictable enough that a developer can eyeball a bucket listing.
 */

import { LensError } from './errors.js';
import type { KeyContext } from './types.js';

/** `{hash}/{name}-{label}.{ext}` - content-addressed and cacheable forever. */
export const DEFAULT_KEY_TEMPLATE = '{hash}/{name}-{label}.{ext}';

const TOKEN = /\{(\w+)\}/g;

/**
 * Makes a string safe for a URL path segment.
 *
 * Lowercases, strips diacritics, collapses anything non-alphanumeric to a
 * single dash. Empty input becomes `'image'` so a key is never malformed.
 *
 * @example
 * ```ts
 * slugify('Café Photo (2).JPG'); // 'cafe-photo-2-jpg'
 * ```
 */
export function slugify(input: string): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return slug.length > 0 ? slug : 'image';
}

/**
 * Renders a key template, or calls a key function.
 *
 * Tokens: `{name} {hash} {fullHash} {format} {ext} {width} {height}
 * {quality} {label}`.
 *
 * @throws {LensError} `INVALID_OPTIONS` when the template references an unknown
 *   token, or a key function returns something unusable. Failing loudly here
 *   beats silently uploading a file called `undefined.webp`.
 *
 * @example
 * ```ts
 * buildKey('{name}/{width}x{height}.{ext}', ctx);  // 'hero/1200x800.webp'
 * buildKey((c) => `${c.format}/${c.hash}.${c.ext}`, ctx);
 * ```
 */
export function buildKey(
  template: string | ((ctx: KeyContext) => string),
  ctx: KeyContext,
  prefix = '',
): string {
  const raw = typeof template === 'function' ? template(ctx) : renderTemplate(template, ctx);

  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new LensError(
      'INVALID_OPTIONS',
      'The key function must return a non-empty string. ' +
        `Received ${raw === undefined ? 'undefined' : JSON.stringify(raw)}.`,
    );
  }
  return joinKey(prefix, raw);
}

function renderTemplate(template: string, ctx: KeyContext): string {
  return template.replace(TOKEN, (_match, token: string) => {
    if (!(token in ctx)) {
      throw new LensError(
        'INVALID_OPTIONS',
        `Unknown token "{${token}}" in key template "${template}". ` +
          `Available: ${Object.keys(ctx).map((k) => `{${k}}`).join(' ')}.`,
      );
    }
    return String((ctx as unknown as Record<string, unknown>)[token]);
  });
}

/** Joins a prefix and a key, normalising slashes and stripping `..` segments. */
export function joinKey(prefix: string, key: string): string {
  const parts = `${prefix}/${key}`
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
  return parts.join('/');
}

/**
 * Default label for a size spec: `1200w`, `800h`, or `1200x800` when both
 * dimensions are pinned.
 */
export function defaultLabel(width?: number, height?: number): string {
  if (width && height) return `${width}x${height}`;
  if (width) return `${width}w`;
  if (height) return `${height}h`;
  return 'original';
}
