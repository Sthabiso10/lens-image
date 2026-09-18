/**
 * `@lens-image/core/browser` - the part of Lens that runs anywhere.
 *
 * Everything re-exported here is pure computation over bytes and strings, with
 * no `node:` imports at all. It works in a browser, a Worker, an edge runtime
 * or React Native.
 *
 * ### Why this exists
 *
 * The main entry point imports `node:crypto` and `node:fs`, so a bundler
 * targeting the browser either fails or ships a polyfill for them. But the
 * *useful* half for a client is Node-free: you can identify an image and read
 * its dimensions from its first few kilobytes, which means you can reject a
 * 40,000 x 40,000 PNG **before** uploading it rather than after.
 *
 * @example Validate before the upload starts
 * ```ts
 * import { sniff, resolveValidation, validateImage, LensError } from '@lens-image/core/browser';
 *
 * const policy = resolveValidation({ maxBytes: 10_000_000, allowedFormats: ['jpeg', 'png', 'webp'] });
 * const header = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
 *
 * try {
 *   validateImage({ ...sniff(header, file.size) }, policy, file.name);
 * } catch (error) {
 *   if (LensError.is(error)) showToast(error.message);   // the same message the server would give
 * }
 * ```
 *
 * Note the `file.slice(0, 4096)` - only the header is read, so validating a
 * 40 MB file costs 4 KB.
 *
 * @packageDocumentation
 */

// --- Format detection -------------------------------------------------------
export { sniff, sniffFormat, mimeTypeFor, extensionFor, SNIFF_HEADER_BYTES } from './sniff.js';

// --- Validation -------------------------------------------------------------
export {
  validateImage,
  resolveValidation,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_PIXELS,
  DEFAULT_ALLOWED_FORMATS,
} from './validation.js';
export type { ResolvedValidation } from './validation.js';

// --- Errors -----------------------------------------------------------------
export { LensError } from './errors.js';
export type { LensErrorCode, LensErrorDetails } from './errors.js';

// --- Formats ----------------------------------------------------------------
export {
  normalizeFormat,
  normalizeFormats,
  supportsAlpha,
  isLossy,
  defaultQuality,
  defaultEffort,
  ENCODABLE_FORMATS,
} from './format.js';

// --- Key templating ---------------------------------------------------------
export { buildKey, joinKey, slugify, defaultLabel, DEFAULT_KEY_TEMPLATE } from './naming.js';

// --- HTML helpers -----------------------------------------------------------
export { buildSrcset, toPicture, pickVariant } from './srcset.js';
export type { PictureData, PictureSource } from './srcset.js';

// --- Formatting -------------------------------------------------------------
export { formatBytes } from './bytes.js';

// --- Types ------------------------------------------------------------------
export type {
  DetectedFormat,
  FitMode,
  FormatResult,
  ImageFormat,
  ImageFormatInput,
  ImageMetadata,
  KeyContext,
  LensWarning,
  OptimizeResult,
  Position,
  ResizeSpec,
  SizeSpec,
  ValidationOptions,
  Variant,
} from './types.js';
