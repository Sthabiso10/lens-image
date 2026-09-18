/**
 * `@lens-image/core` - composable image optimization for Node.js.
 *
 * Zero runtime dependencies. The codec (sharp) and the storage backend are both
 * injected interfaces, so the core is testable, swappable and installs nothing
 * you did not ask for.
 *
 * @example
 * ```ts
 * import { ImageOptimizer } from '@lens-image/core';
 * import { LocalAdapter } from '@lens-image/adapter-local';
 *
 * const optimizer = new ImageOptimizer({
 *   adapter: new LocalAdapter({ root: './public/images', baseUrl: '/images' }),
 *   quality: 80,
 * });
 *
 * const result = await optimizer.optimize({
 *   source: './photo.jpg',
 *   formats: ['webp', 'jpg'],
 *   sizes: [{ width: 1200 }, { width: 600 }, { width: 300 }],
 * });
 *
 * console.log(result.formats.webp.srcset);
 * ```
 *
 * @packageDocumentation
 */

// --- The main entry point ---------------------------------------------------
export { ImageOptimizer, DEFAULT_CACHE_CONTROL } from './optimizer.js';

// --- Errors -----------------------------------------------------------------
export { LensError, throwIfAborted, wrapError } from './errors.js';
export type { LensErrorCode, LensErrorDetails } from './errors.js';

// --- Engines ----------------------------------------------------------------
export {
  createSharpEngine,
  createPassthroughEngine,
  detectEngine,
  resetEngineDetection,
  resetSharpCache,
} from './engines/index.js';
export type { SharpEngineOptions, PassthroughEngineOptions } from './engines/index.js';

// --- Built-in adapters ------------------------------------------------------
export { MemoryAdapter } from './adapters/memory.js';
export type { MemoryAdapterOptions, MemoryEntry } from './adapters/memory.js';

// --- Caching ----------------------------------------------------------------
export { MemoryCacheStore, nullCacheStore } from './cache.js';

// --- Server helpers ---------------------------------------------------------
export { createUploadHandler, serializeResult } from './server/handler.js';
export type { UploadHandlerOptions } from './server/handler.js';

// --- HTML helpers -----------------------------------------------------------
export { buildSrcset, toPicture, pickVariant } from './srcset.js';
export type { PictureData, PictureSource } from './srcset.js';

// --- Utilities, exported because adapter authors need them ------------------
export { sniff, sniffFormat, mimeTypeFor, extensionFor, SNIFF_HEADER_BYTES } from './sniff.js';
export { resolveSource, stem, formatBytes } from './source.js';
export type { ResolvedSource, ResolveOptions } from './source.js';
export {
  normalizeFormat,
  normalizeFormats,
  supportsAlpha,
  isLossy,
  defaultQuality,
  defaultEffort,
  ENCODABLE_FORMATS,
} from './format.js';
export { buildKey, joinKey, slugify, defaultLabel, DEFAULT_KEY_TEMPLATE } from './naming.js';
export {
  validateImage,
  resolveValidation,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_PIXELS,
  DEFAULT_ALLOWED_FORMATS,
} from './validation.js';
export type { ResolvedValidation } from './validation.js';
export { withRetry, resolveRetry, backoffDelay, isRetryableError } from './retry.js';
export type { ResolvedRetry } from './retry.js';
export { mapLimit, delay } from './concurrency.js';
export type { Settled } from './concurrency.js';
export { sha256, shortHash, hashOptions } from './hash.js';

// --- Types ------------------------------------------------------------------
export type {
  CacheStore,
  DetectedFormat,
  EncodedImage,
  FitMode,
  FormatResult,
  ImageEngine,
  ImageFormat,
  ImageFormatInput,
  ImageMetadata,
  ImageOptimizerOptions,
  ImageSource,
  KeyContext,
  LensWarning,
  OptimizeOptions,
  OptimizeResult,
  Position,
  ResizeSpec,
  RetryOptions,
  SizeSpec,
  StorageAdapter,
  StorageContext,
  StorageFile,
  StorageObject,
  ThumbnailSpec,
  TransformOp,
  ValidationOptions,
  Variant,
} from './types.js';

/** The version of `@lens-image/core`, useful in `User-Agent` strings and bug reports. */
export const VERSION = '0.1.0';
