/**
 * The public type surface of `@lens-image/core`.
 *
 * Everything in this file is an interface or a plain data shape - there is no
 * runtime code here, so adapter and engine authors can depend on these types
 * without pulling in any of the implementation.
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Formats
// ---------------------------------------------------------------------------

/**
 * Canonical image formats Lens understands.
 *
 * Note that `jpg` is not a member: it is accepted everywhere as an *input*
 * alias and normalised to `jpeg`. Results are always keyed by the canonical
 * name so `result.formats.jpeg` is the only place you have to look.
 *
 * @see {@link normalizeFormat}
 */
export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'gif' | 'tiff';

/** Anything accepted where a {@link ImageFormat} is expected. */
export type ImageFormatInput = ImageFormat | 'jpg' | 'tif';

/**
 * Formats Lens can detect but never encodes to. Useful for validation
 * (`allowedFormats`) and for reporting what was actually uploaded.
 */
export type DetectedFormat = ImageFormat | 'svg' | 'bmp' | 'ico' | 'heic' | 'unknown';

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

/**
 * Anything you can hand to {@link ImageOptimizer.optimize} as `source`.
 *
 * - `string` - an absolute or relative filesystem path.
 * - `Uint8Array` / `Buffer` - raw bytes already in memory.
 * - `URL` - a `file:` URL, or an `http(s):` URL when `allowRemote` is enabled.
 * - `AsyncIterable<Uint8Array>` - a Node stream, a web stream, a multipart part.
 * - `{ data, filename }` - bytes plus the original filename, which is used for
 *   output naming when it would otherwise be a content hash.
 */
export type ImageSource =
  | string
  | URL
  | Uint8Array
  | AsyncIterable<Uint8Array>
  | { data: Uint8Array | AsyncIterable<Uint8Array>; filename?: string; contentType?: string };

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

/** What Lens knows about an image before it touches a codec. */
export interface ImageMetadata {
  /** Detected container format. */
  readonly format: DetectedFormat;
  /** Pixel width, or `0` when the format carries no readable dimensions. */
  readonly width: number;
  /** Pixel height, or `0` when the format carries no readable dimensions. */
  readonly height: number;
  /** Byte length of the encoded image. */
  readonly size: number;
  /** True when the source declares an alpha channel. */
  readonly hasAlpha?: boolean;
  /** True for animated GIF / WebP. Animated sources skip resizing by default. */
  readonly isAnimated?: boolean;
  /** EXIF orientation (1-8) when present. */
  readonly orientation?: number;
  /** Colour space reported by the codec, when the engine can supply it. */
  readonly space?: string;
}

// ---------------------------------------------------------------------------
// Engine (codec) contract
// ---------------------------------------------------------------------------

/** How a resize should fill the requested box. Mirrors the familiar CSS names. */
export type FitMode = 'cover' | 'contain' | 'fill' | 'inside' | 'outside';

/** Gravity used when `fit: 'cover'` has to crop. */
export type Position =
  | 'center'
  | 'top'
  | 'right'
  | 'bottom'
  | 'left'
  | 'entropy'
  | 'attention';

/** A single resize instruction. At least one of `width` / `height` is required. */
export interface ResizeSpec {
  readonly width?: number;
  readonly height?: number;
  /** Default `'cover'`. */
  readonly fit?: FitMode;
  /** Default `'center'`. */
  readonly position?: Position;
  /** Never scale an image above its intrinsic size. Default `true`. */
  readonly withoutEnlargement?: boolean;
  /** Flat background for `contain` letterboxing, as `#rrggbb` or `#rrggbbaa`. */
  readonly background?: string;
}

/** A fully resolved instruction handed to an {@link ImageEngine}. */
export interface TransformOp {
  /** Omitted for a straight re-encode at native size. */
  readonly resize?: ResizeSpec;
  /** Target output format. */
  readonly format: ImageFormat;
  /** 1-100. Ignored by lossless formats. */
  readonly quality: number;
  /** Keep EXIF / ICC / XMP in the output. Default `false`. */
  readonly preserveMetadata: boolean;
  /** Apply EXIF orientation and drop the tag. Default `true`. */
  readonly autoOrient: boolean;
  /** Encode losslessly where the format supports it (webp, avif). */
  readonly lossless?: boolean;
  /** Progressive / interlaced encode where supported (jpeg, png). */
  readonly progressive?: boolean;
  /** Encoder effort, 0-9. Higher is slower and smaller. */
  readonly effort?: number;
  /** Chroma subsampling override, e.g. `'4:4:4'`. */
  readonly chromaSubsampling?: string;
}

/** The bytes an engine produced, plus what they turned out to be. */
export interface EncodedImage {
  readonly data: Uint8Array;
  readonly format: ImageFormat;
  readonly width: number;
  readonly height: number;
  readonly size: number;
}

/**
 * A codec backend. Implement this to swap sharp for squoosh, an ImageMagick
 * shell-out, a WASM codec, or a stub in tests.
 *
 * Engines are expected to be stateless and safe to call concurrently.
 */
export interface ImageEngine {
  /** Short identifier, surfaced in errors and results (e.g. `'sharp'`). */
  readonly name: string;

  /**
   * Whether this engine can *encode* the given format. Lens calls this before
   * planning work so it can degrade gracefully instead of failing mid-run.
   */
  supports(format: ImageFormat): boolean | Promise<boolean>;

  /**
   * Read dimensions and metadata. Engines may return richer data than the
   * built-in header sniffer, and Lens prefers the engine's answer when present.
   */
  probe(input: Uint8Array): Promise<ImageMetadata>;

  /** Resize and/or re-encode. Must not mutate `input`. */
  transform(input: Uint8Array, op: TransformOp): Promise<EncodedImage>;
}

// ---------------------------------------------------------------------------
// Storage adapter contract
// ---------------------------------------------------------------------------

/** One object about to be written to storage. */
export interface StorageFile {
  /** Storage key / relative path, already templated. No leading slash. */
  readonly key: string;
  readonly data: Uint8Array;
  /** MIME type, e.g. `image/webp`. */
  readonly contentType: string;
  /** Suggested `Cache-Control`. Adapters may override from their own config. */
  readonly cacheControl?: string;
  /** Arbitrary key/value metadata. Adapters map this to their native concept. */
  readonly metadata?: Readonly<Record<string, string>>;
  /** Hex content hash of `data`, handy for ETags and dedupe. */
  readonly checksum?: string;
}

/** Context passed alongside every upload so adapters can log or route. */
export interface StorageContext {
  /** Abort signal propagated from `optimize({ signal })`. */
  readonly signal?: AbortSignal;
  /** Which attempt this is, starting at 1. Set by the retry wrapper. */
  readonly attempt: number;
  /** The optimize run this upload belongs to. */
  readonly runId: string;
}

/** What an adapter reports back after a successful write. */
export interface StorageObject {
  /** The key actually written - adapters may prefix or rewrite it. */
  readonly key: string;
  /** Publicly reachable URL, or a best-effort local URL. */
  readonly url: string;
  /** Bytes written. */
  readonly size: number;
  readonly etag?: string;
  /** Adapter-specific extras (S3 versionId, Cloudinary public_id, ...). */
  readonly meta?: Readonly<Record<string, unknown>>;
}

/**
 * A storage backend.
 *
 * Only {@link StorageAdapter.upload} is required. Implementing `exists` unlocks
 * cache short-circuiting; implementing `remove` unlocks
 * {@link ImageOptimizer.delete}.
 *
 * @example A minimal in-memory adapter
 * ```ts
 * const files = new Map<string, Uint8Array>();
 *
 * const adapter: StorageAdapter = {
 *   name: 'memory',
 *   async upload(file) {
 *     files.set(file.key, file.data);
 *     return { key: file.key, url: `memory://${file.key}`, size: file.data.byteLength };
 *   },
 * };
 * ```
 */
export interface StorageAdapter {
  /** Short identifier, surfaced in errors (e.g. `'s3'`). */
  readonly name: string;

  /** Write one object. Should throw on failure; Lens handles the retries. */
  upload(file: StorageFile, ctx: StorageContext): Promise<StorageObject>;

  /** Cheap existence probe. Enables `cache: 'storage'`. */
  exists?(key: string, ctx?: Partial<StorageContext>): Promise<boolean>;

  /** Delete one object. Enables {@link ImageOptimizer.delete}. */
  remove?(key: string, ctx?: Partial<StorageContext>): Promise<void>;

  /** Public URL for a key without performing a write. */
  getUrl?(key: string): string;

  /** Release sockets, flush buffers. Called by {@link ImageOptimizer.dispose}. */
  dispose?(): Promise<void> | void;
}

// ---------------------------------------------------------------------------
// Optimizer options
// ---------------------------------------------------------------------------

/** One requested output size. */
export interface SizeSpec extends ResizeSpec {
  /**
   * Name used in the output key and in `formats[f].urls`. Defaults to
   * `"<width>w"`, or `"<height>h"` when only a height is given.
   */
  readonly label?: string;
  /** Per-size quality override. */
  readonly quality?: number;
}

/** Validation limits applied before any pixels are decoded. */
export interface ValidationOptions {
  /** Reject sources larger than this many bytes. Default 25 MiB. */
  readonly maxBytes?: number;
  /** Reject sources whose `width * height` exceeds this. Default 100 megapixels. */
  readonly maxPixels?: number;
  /** Allowed input formats. Default: every format the engine can decode. */
  readonly allowedFormats?: readonly DetectedFormat[];
  /** Reject images narrower than this. */
  readonly minWidth?: number;
  /** Reject images shorter than this. */
  readonly minHeight?: number;
}

/** Retry policy for adapter writes. */
export interface RetryOptions {
  /** Total attempts including the first. Default 3. Set to 1 to disable. */
  readonly attempts?: number;
  /** Delay before the second attempt, in ms. Default 200. */
  readonly baseDelayMs?: number;
  /** Ceiling for the exponential backoff, in ms. Default 5000. */
  readonly maxDelayMs?: number;
  /**
   * Decide whether an error is worth retrying. Default: retry network-ish and
   * 5xx errors, never 4xx.
   */
  readonly isRetryable?: (error: unknown) => boolean;
  /** Called before each sleep. Useful for logging and tests. */
  readonly onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
}

/** Where processed-output bookkeeping lives. */
export interface CacheStore {
  get(key: string): Promise<OptimizeResult | undefined> | OptimizeResult | undefined;
  set(key: string, value: OptimizeResult): Promise<void> | void;
  delete?(key: string): Promise<void> | void;
}

/** Tokens available to a key template or key function. */
export interface KeyContext {
  /** Source basename without extension, slugified. */
  readonly name: string;
  /** Short content hash of the source bytes. */
  readonly hash: string;
  /** Full content hash of the source bytes. */
  readonly fullHash: string;
  readonly format: ImageFormat;
  /** File extension without the dot - `jpg` for `jpeg`. */
  readonly ext: string;
  readonly width: number;
  readonly height: number;
  readonly quality: number;
  /** Size label, e.g. `1200w` or `thumb`. */
  readonly label: string;
}

/** Everything `new ImageOptimizer(...)` accepts. */
export interface ImageOptimizerOptions {
  /**
   * Where output goes. Omit to run in "process only" mode: results carry bytes
   * in `variant.data` and no URLs.
   */
  readonly adapter?: StorageAdapter;

  /**
   * Codec backend. Defaults to sharp when it is installed, otherwise a
   * passthrough engine that can re-key and validate but not resize.
   */
  readonly engine?: ImageEngine;

  /** Default quality for every output. 1-100. Default 80. */
  readonly quality?: number;

  /** Default formats when a call does not specify any. Default `['webp']`. */
  readonly formats?: readonly ImageFormatInput[];

  /** Default sizes when a call does not specify any. Default: original size. */
  readonly sizes?: readonly SizeSpec[];

  /**
   * Format to fall back to when a requested format cannot be produced.
   * Default `'jpeg'`. Set to `null` to disable fallback entirely.
   */
  readonly fallbackFormat?: ImageFormatInput | null;

  /**
   * Output key template, or a function. Tokens: `{name} {hash} {fullHash}
   * {format} {ext} {width} {height} {quality} {label}`.
   *
   * Default: `'{hash}/{name}-{label}.{ext}'`.
   */
  readonly key?: string | ((ctx: KeyContext) => string);

  /** Prepended to every key. A trailing slash is added if missing. */
  readonly prefix?: string;

  /** Keep EXIF / ICC / XMP. Default `false` - metadata is stripped. */
  readonly preserveMetadata?: boolean;

  /** Apply EXIF orientation before resizing. Default `true`. */
  readonly autoOrient?: boolean;

  /** How many encode+upload pipelines run at once. Default 4. */
  readonly concurrency?: number;

  /** Validation limits. */
  readonly validate?: ValidationOptions | false;

  /** Retry policy for adapter writes. */
  readonly retry?: RetryOptions;

  /**
   * Result caching.
   * - `false` (default) - always reprocess.
   * - `'memory'` - process-lifetime LRU keyed by source hash + options.
   * - `'storage'` - `'memory'`, plus skip work when `adapter.exists` says the
   *   keys are already there.
   * - a {@link CacheStore} - bring your own (Redis, SQLite, ...).
   */
  readonly cache?: false | 'memory' | 'storage' | CacheStore;

  /** Entries kept by the built-in memory cache. Default 500. */
  readonly cacheSize?: number;

  /** `Cache-Control` applied to every upload. Default `public, max-age=31536000, immutable`. */
  readonly cacheControl?: string;

  /** Allow `http(s):` sources. Off by default - it is an SSRF surface. */
  readonly allowRemote?: boolean;

  /** Called for every non-fatal degradation. Default: silent. */
  readonly onWarning?: (warning: LensWarning) => void;
}

/** Per-call options. Anything omitted falls back to the constructor value. */
export interface OptimizeOptions
  extends Pick<
    ImageOptimizerOptions,
    | 'quality'
    | 'formats'
    | 'sizes'
    | 'fallbackFormat'
    | 'key'
    | 'prefix'
    | 'preserveMetadata'
    | 'autoOrient'
    | 'concurrency'
    | 'validate'
    | 'retry'
    | 'cacheControl'
    | 'onWarning'
  > {
  /** The image to process. */
  readonly source: ImageSource;

  /** Overrides the filename derived from `source`. */
  readonly filename?: string;

  /**
   * Also emit a small square-ish preview.
   * `true` means 256px wide in the first requested format.
   */
  readonly thumbnail?: boolean | ThumbnailSpec;

  /** Metadata attached to every uploaded object. */
  readonly metadata?: Readonly<Record<string, string>>;

  /** Keep encoded bytes on each variant. Default `true` without an adapter. */
  readonly keepData?: boolean;

  /** Cancel in-flight encodes and uploads. */
  readonly signal?: AbortSignal;

  /** Skip the cache for this call only. */
  readonly force?: boolean;
}

/** Thumbnail configuration. */
export interface ThumbnailSpec extends ResizeSpec {
  /** Default 256. */
  readonly width?: number;
  readonly height?: number;
  /** Defaults to the first requested output format. */
  readonly format?: ImageFormatInput;
  /** Defaults to the run quality. */
  readonly quality?: number;
  /** Default `'thumb'`. */
  readonly label?: string;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/** One generated file. */
export interface Variant {
  readonly format: ImageFormat;
  readonly label: string;
  readonly width: number;
  readonly height: number;
  /** Bytes of the encoded output. */
  readonly size: number;
  readonly quality: number;
  /** Storage key, or the templated key when running without an adapter. */
  readonly key: string;
  /** Public URL. Empty string when running without an adapter. */
  readonly url: string;
  readonly contentType: string;
  /** Hex content hash of the encoded bytes. */
  readonly checksum: string;
  /** Present when `keepData` is on, or when there is no adapter. */
  readonly data?: Uint8Array;
  /** True when this variant was produced by the fallback format. */
  readonly isFallback?: boolean;
  /** True for the variant generated by the `thumbnail` option. */
  readonly isThumbnail?: boolean;
  /** ETag reported by the adapter, when it supplies one. */
  readonly etag?: string;
  /** Adapter extras. */
  readonly meta?: Readonly<Record<string, unknown>>;
}

/** All variants of one format, grouped for convenient template access. */
export interface FormatResult {
  readonly format: ImageFormat;
  /** `{ '1200w': 'https://...', '600w': 'https://...' }` */
  readonly urls: Readonly<Record<string, string>>;
  readonly variants: readonly Variant[];
  /** Total bytes across every variant of this format. */
  readonly size: number;
  /** Ready-to-use `srcset` attribute value. Empty when URLs are unavailable. */
  readonly srcset: string;
  /** The widest variant - a sensible `src` fallback. */
  readonly largest: Variant;
  /** The narrowest variant. */
  readonly smallest: Variant;
}

/** A non-fatal degradation. */
export interface LensWarning {
  /** Machine-readable reason, e.g. `'format_unsupported'`. */
  readonly code: string;
  readonly message: string;
  /** Format the warning relates to, when applicable. */
  readonly format?: ImageFormat;
  readonly label?: string;
  /** The underlying error, when the warning came from a thrown exception. */
  readonly cause?: unknown;
}

/** What {@link ImageOptimizer.optimize} resolves to. */
export interface OptimizeResult {
  /** Stable id for this source + options combination. Also the cache key. */
  readonly id: string;
  /** Unique per call, even on a cache hit. Correlates logs. */
  readonly runId: string;
  /** What the input turned out to be. */
  readonly source: ImageMetadata & { readonly filename: string; readonly checksum: string };
  /** Grouped by canonical format name: `result.formats.webp.urls['600w']`. */
  readonly formats: Readonly<Partial<Record<ImageFormat, FormatResult>>>;
  /** Every variant, in plan order. */
  readonly variants: readonly Variant[];
  /** Present when `thumbnail` was requested and succeeded. */
  readonly thumbnail?: Variant;
  /** Non-fatal degradations - unsupported formats, fallbacks taken. */
  readonly warnings: readonly LensWarning[];
  /** Total output bytes across every variant. */
  readonly totalSize: number;
  /** `1 - totalSize / source.size`, clamped to 0. Negative savings report 0. */
  readonly savings: number;
  /** Wall-clock duration in ms. */
  readonly durationMs: number;
  /** True when the result came from cache rather than fresh work. */
  readonly cached: boolean;
  /** Engine that produced the output. */
  readonly engine: string;
  /** Adapter that stored it, or `null` in process-only mode. */
  readonly adapter: string | null;
}
