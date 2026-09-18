/**
 * The orchestrator: validate, plan, encode, upload, assemble.
 *
 * Deliberately the only stateful class in the library. Everything it calls -
 * sniffing, validation, key building, retry, the engine, the adapter - is a
 * pure function or an injected interface, which is what makes the whole thing
 * testable without a codec or a network.
 */

import { randomUUID } from 'node:crypto';
import { MemoryCacheStore, nullCacheStore } from './cache.js';
import { mapLimit } from './concurrency.js';
import { detectEngine } from './engines/index.js';
import { LensError, throwIfAborted, wrapError } from './errors.js';
import { defaultEffort, defaultQuality, normalizeFormat, normalizeFormats } from './format.js';
import { hashOptions, sha256, shortHash } from './hash.js';
import { DEFAULT_KEY_TEMPLATE, buildKey, defaultLabel, slugify } from './naming.js';
import { resolveRetry, withRetry } from './retry.js';
import { extensionFor, mimeTypeFor, sniff } from './sniff.js';
import { resolveSource, stem } from './source.js';
import { buildSrcset } from './srcset.js';
import { resolveValidation, validateImage } from './validation.js';
import type {
  CacheStore,
  FormatResult,
  ImageEngine,
  ImageFormat,
  ImageMetadata,
  ImageOptimizerOptions,
  KeyContext,
  LensWarning,
  OptimizeOptions,
  OptimizeResult,
  ResizeSpec,
  SizeSpec,
  StorageAdapter,
  StorageFile,
  ThumbnailSpec,
  TransformOp,
  Variant,
} from './types.js';

/** `public, max-age=31536000, immutable` - safe because keys are content-addressed. */
export const DEFAULT_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** One unit of work: encode this size in this format, then store it. */
interface PlannedVariant {
  readonly format: ImageFormat;
  readonly label: string;
  readonly quality: number;
  readonly resize: ResizeSpec | undefined;
  readonly isThumbnail: boolean;
}

/**
 * Optimizes images and hands them to a storage backend.
 *
 * Construct one per configuration and reuse it - it memoises engine detection
 * and owns the result cache, so a fresh instance per request throws both away.
 *
 * @example Upload responsive WebP + JPEG to S3
 * ```ts
 * import { ImageOptimizer } from '@lens-image/core';
 * import { S3Adapter } from '@lens-image/adapter-s3';
 *
 * const optimizer = new ImageOptimizer({
 *   adapter: new S3Adapter({ bucket: 'my-images', region: 'us-east-1' }),
 *   quality: 80,
 * });
 *
 * const result = await optimizer.optimize({
 *   source: '/path/to/image.jpg',
 *   formats: ['webp', 'jpg'],
 *   sizes: [{ width: 1200 }, { width: 600 }, { width: 300 }],
 * });
 *
 * result.formats.webp.urls['600w'];  // 'https://my-images.s3.amazonaws.com/…-600w.webp'
 * result.formats.webp.srcset;        // ready for <source srcset={…}>
 * ```
 *
 * @example Process without storing
 * ```ts
 * const optimizer = new ImageOptimizer();          // no adapter
 * const { variants } = await optimizer.optimize({ source: bytes, formats: ['webp'] });
 * await writeFile('out.webp', variants[0].data!);  // bytes come back on the variant
 * ```
 */
export class ImageOptimizer {
  readonly #options: ImageOptimizerOptions;
  readonly #cacheStore: CacheStore;
  readonly #cacheMode: 'off' | 'memory' | 'storage' | 'custom';
  #engine: ImageEngine | Promise<ImageEngine>;

  constructor(options: ImageOptimizerOptions = {}) {
    assertValidOptions(options);
    this.#options = options;
    this.#engine = options.engine ?? detectEngine();

    const cache = options.cache ?? false;
    if (cache === false) {
      this.#cacheMode = 'off';
      this.#cacheStore = nullCacheStore;
    } else if (cache === 'memory' || cache === 'storage') {
      this.#cacheMode = cache;
      this.#cacheStore = new MemoryCacheStore(options.cacheSize ?? 500);
    } else {
      this.#cacheMode = 'custom';
      this.#cacheStore = cache;
    }
  }

  /** The storage backend, or `null` in process-only mode. */
  get adapter(): StorageAdapter | null {
    return this.#options.adapter ?? null;
  }

  /** Resolves the codec backend, running detection on first use. */
  async engine(): Promise<ImageEngine> {
    this.#engine = await this.#engine;
    return this.#engine;
  }

  /**
   * Processes one image into every requested format and size.
   *
   * Formats are independent: if AVIF encoding fails, the WebP and JPEG outputs
   * still resolve and the failure is reported on `result.warnings` rather than
   * thrown. Only a total failure - nothing at all was produced - rejects.
   *
   * @throws {LensError} `VALIDATION_FAILED`, `UNSUPPORTED_INPUT`,
   *   `ALL_FORMATS_FAILED`, `UPLOAD_FAILED`, `ABORTED`.
   */
  async optimize(options: OptimizeOptions): Promise<OptimizeResult> {
    const started = Date.now();
    const runId = randomUUID();
    const settings = { ...this.#options, ...stripUndefined(options) };
    // Per-call options get the same scrutiny as constructor options; otherwise
    // `optimize({ sizes: [{ width: -1 }] })` would sail past the checks that
    // `new ImageOptimizer({ sizes: [...] })` performs.
    assertValidOptions(settings);

    const warnings: LensWarning[] = [];

    const warn = (warning: LensWarning) => {
      warnings.push(warning);
      settings.onWarning?.(warning);
    };

    throwIfAborted(options.signal, 'optimize');

    // --- 1. Read and validate -------------------------------------------------
    const policy = resolveValidation(settings.validate);
    const source = await resolveSource(options.source, {
      ...(options.filename !== undefined ? { filename: options.filename } : {}),
      ...(this.#options.allowRemote !== undefined ? { allowRemote: this.#options.allowRemote } : {}),
      ...(policy ? { maxBytes: policy.maxBytes } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });

    const engine = await this.engine();
    const meta = await this.#describe(source.data, engine, warn);
    validateImage(meta, policy, source.filename);

    const checksum = sha256(source.data);
    const name = slugify(stem(source.filename));

    // --- 2. Plan --------------------------------------------------------------
    const plan = this.#plan(settings, meta, warn);
    const available = await this.#filterSupported(plan, engine, settings, warn);

    if (available.length === 0) {
      throw new LensError(
        'ALL_FORMATS_FAILED',
        `No requested output format can be produced by the "${engine.name}" engine. ` +
          (engine.name === 'passthrough'
            ? 'Install sharp (`npm install sharp`) to enable format conversion and resizing.'
            : `Requested: ${plan.map((p) => p.format).join(', ')}.`),
        { details: { engine: engine.name } },
      );
    }

    // --- 3. Cache lookup ------------------------------------------------------
    const id = this.#cacheId(checksum, settings, available);
    if (!options.force && this.#cacheMode !== 'off') {
      const hit = await this.#lookup(id, options);
      if (hit) return { ...hit, runId, cached: true, durationMs: Date.now() - started };
    }

    // --- 4. Encode and upload -------------------------------------------------
    const keepData = options.keepData ?? this.adapter === null;
    const concurrency = settings.concurrency ?? 4;

    const settled = await mapLimit(
      available,
      concurrency,
      (planned) =>
        this.#produce(planned, {
          bytes: source.data,
          engine,
          settings,
          meta,
          checksum,
          name,
          runId,
          keepData,
          ...(options.metadata ? { metadata: options.metadata } : {}),
          ...(options.signal ? { signal: options.signal } : {}),
        }),
      options.signal,
    );

    const variants: Variant[] = [];
    const failedFormats = new Set<ImageFormat>();

    for (const outcome of settled) {
      const planned = available[outcome.index] as PlannedVariant;
      if (outcome.status === 'fulfilled') {
        variants.push(outcome.value);
      } else {
        failedFormats.add(planned.format);
        warn({
          code: LensError.is(outcome.reason) ? outcome.reason.code.toLowerCase() : 'variant_failed',
          message: `Failed to produce ${planned.format} at "${planned.label}": ${errorMessage(outcome.reason)}`,
          format: planned.format,
          label: planned.label,
          cause: outcome.reason,
        });
      }
    }

    // --- 5. Fall back ---------------------------------------------------------
    if (variants.length === 0) {
      const fallback = await this.#tryFallback(settings, available, {
        bytes: source.data,
        engine,
        meta,
        checksum,
        name,
        runId,
        keepData,
        concurrency,
        warn,
        ...(options.metadata ? { metadata: options.metadata } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
      });
      variants.push(...fallback);
    }

    if (variants.length === 0) {
      throw new LensError(
        'ALL_FORMATS_FAILED',
        `Every output failed for "${source.filename}". First failure: ${
          warnings[0]?.message ?? 'unknown'
        }`,
        { cause: warnings[0]?.cause, details: { engine: engine.name, warnings: warnings.length } },
      );
    }

    // --- 6. Assemble ----------------------------------------------------------
    const result = this.#assemble({
      id,
      runId,
      engine,
      variants,
      warnings,
      meta,
      checksum,
      filename: source.filename,
      durationMs: Date.now() - started,
    });

    // Never cache a result that is carrying encoded bytes: a 500-entry LRU of
    // results that each hold several megabytes of Uint8Array is a memory leak
    // wearing a performance feature's clothes. The metadata is still cached,
    // and re-encoding is the honest cost of asking for the bytes back.
    if (this.#cacheMode !== 'off' && !keepData) await this.#cacheStore.set(id, result);
    return result;
  }

  /**
   * Optimizes several images with the same options.
   *
   * Runs sequentially by design. Each `optimize` call already parallelises its
   * own variants, so overlapping whole images multiplies peak memory by the
   * number of images - and decoded bitmaps, not encoded files, are what fills
   * the heap. Wrap in your own queue if you have the headroom.
   */
  async optimizeMany(
    sources: readonly OptimizeOptions['source'][],
    options: Omit<OptimizeOptions, 'source'> = {},
  ): Promise<OptimizeResult[]> {
    const results: OptimizeResult[] = [];
    for (const source of sources) {
      results.push(await this.optimize({ ...options, source }));
    }
    return results;
  }

  /**
   * Reads an image's metadata without producing anything.
   *
   * Uses the engine when one is available and falls back to header sniffing,
   * so it works with or without sharp installed.
   */
  async inspect(source: OptimizeOptions['source']): Promise<ImageMetadata> {
    const resolved = await resolveSource(source, {
      ...(this.#options.allowRemote !== undefined ? { allowRemote: this.#options.allowRemote } : {}),
    });
    return this.#describe(resolved.data, await this.engine(), () => {});
  }

  /**
   * Deletes every variant of a previous result from storage.
   *
   * @throws {LensError} `ADAPTER_REQUIRED` with no adapter configured,
   *   `ADAPTER_UNSUPPORTED` when the adapter cannot delete.
   */
  async delete(result: OptimizeResult): Promise<void> {
    const adapter = this.adapter;
    if (!adapter) {
      throw new LensError('ADAPTER_REQUIRED', 'delete() needs a storage adapter, but none is configured.');
    }
    if (!adapter.remove) {
      throw new LensError(
        'ADAPTER_UNSUPPORTED',
        `The "${adapter.name}" adapter does not implement remove(), so delete() is unavailable.`,
        { details: { adapter: adapter.name } },
      );
    }
    await Promise.all(result.variants.map((variant) => adapter.remove!(variant.key)));
    await this.#cacheStore.delete?.(result.id);
  }

  /** Releases adapter resources. Safe to call more than once. */
  async dispose(): Promise<void> {
    await this.adapter?.dispose?.();
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** Engine metadata when trustworthy, header sniffing otherwise. */
  async #describe(
    bytes: Uint8Array,
    engine: ImageEngine,
    warn: (w: LensWarning) => void,
  ): Promise<ImageMetadata> {
    const sniffed = sniff(bytes);
    try {
      const probed = await engine.probe(bytes);
      // Trust the sniffer's format when the engine is unsure: sniffing reads the
      // container directly and cannot be confused by a wrong file extension.
      return {
        ...probed,
        format: probed.format === 'unknown' ? sniffed.format : probed.format,
        width: probed.width || sniffed.width,
        height: probed.height || sniffed.height,
        size: bytes.byteLength,
      };
    } catch (error) {
      if (sniffed.format === 'unknown') {
        throw wrapError('UNSUPPORTED_INPUT', 'Could not identify this image', error);
      }
      warn({
        code: 'probe_failed',
        message: `The ${engine.name} engine could not read metadata; using header sniffing instead.`,
        cause: error,
      });
      return sniffed;
    }
  }

  /** Expands formats x sizes (plus the thumbnail) into a flat work list. */
  #plan(
    settings: ImageOptimizerOptions & OptimizeOptions,
    meta: ImageMetadata,
    warn: (w: LensWarning) => void,
  ): PlannedVariant[] {
    const formats = normalizeFormats(settings.formats ?? ['webp']);
    const sizes: readonly SizeSpec[] = settings.sizes?.length ? settings.sizes : [{}];

    // Animated sources lose every frame but the first through a plain resize,
    // so unless the caller pinned a size we leave them alone.
    const skipResize = meta.isAnimated === true && !settings.sizes?.length;
    if (meta.isAnimated && settings.sizes?.length) {
      warn({
        code: 'animated_resize',
        message:
          'Resizing an animated image. Unless the engine is configured for animation, ' +
          'only the first frame survives.',
      });
    }

    const planned: PlannedVariant[] = [];
    for (const format of formats) {
      for (const size of sizes) {
        const hasDimensions = size.width !== undefined || size.height !== undefined;
        planned.push({
          format,
          label: size.label ?? defaultLabel(size.width, size.height),
          quality: clampQuality(size.quality ?? settings.quality ?? defaultQuality(format)),
          resize: hasDimensions && !skipResize ? toResizeSpec(size) : undefined,
          isThumbnail: false,
        });
      }
    }

    assertUniqueLabels(planned);

    const thumb = resolveThumbnail(settings.thumbnail, formats[0]);
    if (thumb) {
      planned.push({
        format: thumb.format,
        label: thumb.label,
        quality: clampQuality(thumb.quality ?? settings.quality ?? defaultQuality(thumb.format)),
        resize: thumb.resize,
        isThumbnail: true,
      });
    }

    return planned;
  }

  /** Drops formats the engine cannot encode, recording one warning per format. */
  async #filterSupported(
    plan: readonly PlannedVariant[],
    engine: ImageEngine,
    settings: ImageOptimizerOptions,
    warn: (w: LensWarning) => void,
  ): Promise<PlannedVariant[]> {
    const formats = [...new Set(plan.map((p) => p.format))];
    const support = new Map<ImageFormat, boolean>();

    await Promise.all(
      formats.map(async (format) => {
        try {
          support.set(format, await engine.supports(format));
        } catch {
          support.set(format, false);
        }
      }),
    );

    for (const [format, ok] of support) {
      if (!ok) {
        const fallback = settings.fallbackFormat === null ? null : normalizeFormat(settings.fallbackFormat ?? 'jpeg');
        warn({
          code: 'format_unsupported',
          message:
            `The "${engine.name}" engine cannot encode ${format}` +
            (format === 'avif' ? ' (common with prebuilt sharp binaries that ship without AV1)' : '') +
            (fallback ? `; falling back to ${fallback} if nothing else succeeds.` : '.'),
          format,
        });
      }
    }

    return plan.filter((p) => support.get(p.format) === true);
  }

  /** Encodes one variant and stores it. */
  async #produce(
    planned: PlannedVariant,
    ctx: {
      bytes: Uint8Array;
      engine: ImageEngine;
      settings: ImageOptimizerOptions & OptimizeOptions;
      meta: ImageMetadata;
      checksum: string;
      name: string;
      runId: string;
      keepData: boolean;
      metadata?: Readonly<Record<string, string>>;
      signal?: AbortSignal;
    },
    isFallback = false,
  ): Promise<Variant> {
    throwIfAborted(ctx.signal, 'encode');

    const op: TransformOp = {
      ...(planned.resize ? { resize: planned.resize } : {}),
      format: planned.format,
      quality: planned.quality,
      preserveMetadata: ctx.settings.preserveMetadata ?? false,
      autoOrient: ctx.settings.autoOrient ?? true,
      ...(defaultEffort(planned.format) !== undefined ? { effort: defaultEffort(planned.format) } : {}),
    };

    const encoded = await ctx.engine.transform(ctx.bytes, op);
    throwIfAborted(ctx.signal, 'upload');

    const keyContext: KeyContext = {
      name: ctx.name,
      hash: shortHash(ctx.checksum),
      fullHash: ctx.checksum,
      format: planned.format,
      ext: extensionFor(planned.format),
      width: encoded.width,
      height: encoded.height,
      quality: planned.quality,
      label: planned.label,
    };

    const key = buildKey(
      ctx.settings.key ?? DEFAULT_KEY_TEMPLATE,
      keyContext,
      normalizePrefix(ctx.settings.prefix),
    );

    const base = {
      format: encoded.format,
      label: planned.label,
      width: encoded.width,
      height: encoded.height,
      size: encoded.size,
      quality: planned.quality,
      contentType: mimeTypeFor(encoded.format),
      checksum: sha256(encoded.data),
      ...(planned.isThumbnail ? { isThumbnail: true } : {}),
      ...(isFallback ? { isFallback: true } : {}),
    };

    const adapter = this.adapter;
    if (!adapter) {
      // Process-only mode: the caller gets bytes and a key they can use however
      // they like. No URL, because inventing one would be a lie.
      return { ...base, key, url: '', data: encoded.data };
    }

    const file: StorageFile = {
      key,
      data: encoded.data,
      contentType: base.contentType,
      cacheControl: ctx.settings.cacheControl ?? DEFAULT_CACHE_CONTROL,
      checksum: base.checksum,
      ...(ctx.metadata ? { metadata: ctx.metadata } : {}),
    };

    const retry = resolveRetry(ctx.settings.retry);
    const stored = await withRetry(
      retry,
      (attempt) =>
        adapter.upload(file, {
          attempt,
          runId: ctx.runId,
          ...(ctx.signal ? { signal: ctx.signal } : {}),
        }),
      ctx.signal,
    ).catch((error) => {
      throw wrapError('UPLOAD_FAILED', `The "${adapter.name}" adapter failed to store "${key}"`, error, {
        adapter: adapter.name,
        key,
        attempts: retry.attempts,
      });
    });

    return {
      ...base,
      key: stored.key,
      url: stored.url,
      size: stored.size || encoded.size,
      ...(stored.etag ? { etag: stored.etag } : {}),
      ...(stored.meta ? { meta: stored.meta } : {}),
      ...(ctx.keepData ? { data: encoded.data } : {}),
    };
  }

  /** Last resort when every planned format failed. */
  async #tryFallback(
    settings: ImageOptimizerOptions & OptimizeOptions,
    attempted: readonly PlannedVariant[],
    ctx: {
      bytes: Uint8Array;
      engine: ImageEngine;
      meta: ImageMetadata;
      checksum: string;
      name: string;
      runId: string;
      keepData: boolean;
      concurrency: number;
      warn: (w: LensWarning) => void;
      metadata?: Readonly<Record<string, string>>;
      signal?: AbortSignal;
    },
  ): Promise<Variant[]> {
    if (settings.fallbackFormat === null) return [];

    const fallback = normalizeFormat(settings.fallbackFormat ?? 'jpeg');
    if (attempted.some((p) => p.format === fallback)) return []; // Already tried; do not thrash.

    const fallbackSupported = await Promise.resolve(ctx.engine.supports(fallback)).catch(() => false);
    if (!fallbackSupported) {
      ctx.warn({
        code: 'fallback_unavailable',
        message: `The fallback format ${fallback} is also unsupported by the "${ctx.engine.name}" engine.`,
        format: fallback,
      });
      return [];
    }

    ctx.warn({
      code: 'fallback_used',
      message: `Every requested format failed; retrying as ${fallback}.`,
      format: fallback,
    });

    // Preserve the size ladder, swap only the format.
    const retryPlan = dedupeByLabel(attempted).map((p) => ({
      ...p,
      format: fallback,
      quality: clampQuality(settings.quality ?? defaultQuality(fallback)),
    }));

    const settled = await mapLimit(
      retryPlan,
      ctx.concurrency,
      (planned) =>
        this.#produce(
          planned,
          {
            bytes: ctx.bytes,
            engine: ctx.engine,
            settings,
            meta: ctx.meta,
            checksum: ctx.checksum,
            name: ctx.name,
            runId: ctx.runId,
            keepData: ctx.keepData,
            ...(ctx.metadata ? { metadata: ctx.metadata } : {}),
            ...(ctx.signal ? { signal: ctx.signal } : {}),
          },
          true,
        ),
      ctx.signal,
    );

    const produced: Variant[] = [];
    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') produced.push(outcome.value);
      else {
        ctx.warn({
          code: 'fallback_failed',
          message: `The ${fallback} fallback also failed: ${errorMessage(outcome.reason)}`,
          format: fallback,
          cause: outcome.reason,
        });
      }
    }
    return produced;
  }

  /** Groups variants and computes the summary numbers. */
  #assemble(input: {
    id: string;
    runId: string;
    engine: ImageEngine;
    variants: readonly Variant[];
    warnings: readonly LensWarning[];
    meta: ImageMetadata;
    checksum: string;
    filename: string;
    durationMs: number;
  }): OptimizeResult {
    const thumbnail = input.variants.find((v) => v.isThumbnail === true);
    const main = input.variants.filter((v) => v !== thumbnail);

    const formats: Partial<Record<ImageFormat, FormatResult>> = {};
    for (const variant of main) {
      const group = (formats[variant.format] ??= {
        format: variant.format,
        urls: {},
        variants: [],
        size: 0,
        srcset: '',
        largest: variant,
        smallest: variant,
      } as unknown as FormatResult);

      (group.variants as Variant[]).push(variant);
      (group.urls as Record<string, string>)[variant.label] = variant.url;
    }

    for (const group of Object.values(formats) as FormatResult[]) {
      const sorted = [...group.variants].sort((a, b) => a.width - b.width);
      Object.assign(group, {
        size: group.variants.reduce((sum, v) => sum + v.size, 0),
        srcset: buildSrcset(group.variants),
        smallest: sorted[0],
        largest: sorted[sorted.length - 1],
      });
    }

    const totalSize = input.variants.reduce((sum, v) => sum + v.size, 0);

    return {
      id: input.id,
      runId: input.runId,
      source: {
        ...input.meta,
        filename: input.filename,
        checksum: input.checksum,
      },
      formats,
      variants: input.variants,
      ...(thumbnail ? { thumbnail } : {}),
      warnings: input.warnings,
      totalSize,
      // Comparing total output against one input is apples to oranges when you
      // asked for nine variants, so the headline number uses the largest single
      // output - the one that would actually replace the original.
      savings: computeSavings(input.meta.size, main),
      durationMs: input.durationMs,
      cached: false,
      engine: input.engine.name,
      adapter: this.adapter?.name ?? null,
    };
  }

  /** Stable id for a (source, options) pair. */
  #cacheId(
    checksum: string,
    settings: ImageOptimizerOptions & OptimizeOptions,
    plan: readonly PlannedVariant[],
  ): string {
    return `${shortHash(checksum, 16)}-${hashOptions({
      plan: plan.map((p) => [p.format, p.label, p.quality, p.resize]),
      key: typeof settings.key === 'function' ? 'fn' : (settings.key ?? DEFAULT_KEY_TEMPLATE),
      prefix: settings.prefix ?? '',
      preserveMetadata: settings.preserveMetadata ?? false,
      autoOrient: settings.autoOrient ?? true,
      adapter: this.adapter?.name ?? null,
    })}`;
  }

  /** Cache read, including the optional storage existence check. */
  async #lookup(id: string, options: OptimizeOptions): Promise<OptimizeResult | undefined> {
    const hit = await this.#cacheStore.get(id);
    if (!hit) return undefined;

    if (this.#cacheMode === 'storage' && this.adapter?.exists) {
      // A memory hit does not prove the object survived a bucket lifecycle rule
      // or a manual delete, so confirm before handing back stale URLs.
      const checks = await Promise.all(
        hit.variants.map((v) =>
          this.adapter!.exists!(v.key, options.signal ? { signal: options.signal } : {}).catch(() => false),
        ),
      );
      if (checks.some((ok) => !ok)) {
        await this.#cacheStore.delete?.(id);
        return undefined;
      }
    }
    return hit;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertValidOptions(options: ImageOptimizerOptions): void {
  if (options.quality !== undefined && (options.quality < 1 || options.quality > 100)) {
    throw new LensError(
      'INVALID_OPTIONS',
      `quality must be between 1 and 100, received ${options.quality}.`,
      { details: { actual: options.quality } },
    );
  }
  if (options.concurrency !== undefined && options.concurrency < 1) {
    throw new LensError(
      'INVALID_OPTIONS',
      `concurrency must be at least 1, received ${options.concurrency}.`,
      { details: { actual: options.concurrency } },
    );
  }
  if (options.formats) normalizeFormats(options.formats); // Throws on an unknown name.
  if (options.fallbackFormat != null) normalizeFormat(options.fallbackFormat);

  for (const size of options.sizes ?? []) {
    if (size.width === undefined && size.height === undefined && size.label === undefined) continue;
    for (const dim of ['width', 'height'] as const) {
      const value = size[dim];
      if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
        throw new LensError(
          'INVALID_OPTIONS',
          `sizes[].${dim} must be a positive number, received ${value}.`,
          { details: { actual: value } },
        );
      }
    }
  }
}

/**
 * Refuses two sizes that would produce the same label within one format.
 *
 * They would map to the same output key, so the second silently overwrites the
 * first and `formats[f].urls` quietly ends up one entry short. That is a
 * configuration mistake worth stopping on rather than a degradation to warn
 * about - `sizes: [{ width: 600 }, { width: 600, quality: 60 }]` looks
 * reasonable until you notice only one file exists.
 */
function assertUniqueLabels(plan: readonly PlannedVariant[]): void {
  const seen = new Set<string>();
  for (const { format, label } of plan) {
    const id = `${format}:${label}`;
    if (seen.has(id)) {
      throw new LensError(
        'INVALID_OPTIONS',
        `Two requested sizes both produce the label "${label}" for ${format}, so they would ` +
          'overwrite each other. Give one of them an explicit `label`.',
        { details: { format, label } },
      );
    }
    seen.add(id);
  }
}

function toResizeSpec(size: SizeSpec): ResizeSpec {
  return {
    ...(size.width !== undefined ? { width: Math.round(size.width) } : {}),
    ...(size.height !== undefined ? { height: Math.round(size.height) } : {}),
    fit: size.fit ?? 'cover',
    position: size.position ?? 'center',
    withoutEnlargement: size.withoutEnlargement ?? true,
    ...(size.background ? { background: size.background } : {}),
  };
}

function resolveThumbnail(
  spec: boolean | ThumbnailSpec | undefined,
  defaultFormat: ImageFormat | undefined,
): { format: ImageFormat; label: string; quality: number | undefined; resize: ResizeSpec } | null {
  if (!spec) return null;
  const config: ThumbnailSpec = spec === true ? {} : spec;
  const width = config.width ?? (config.height ? undefined : 256);

  return {
    format: config.format ? normalizeFormat(config.format) : (defaultFormat ?? 'webp'),
    label: config.label ?? 'thumb',
    quality: config.quality,
    resize: {
      ...(width !== undefined ? { width } : {}),
      ...(config.height !== undefined ? { height: config.height } : {}),
      fit: config.fit ?? 'cover',
      position: config.position ?? 'center',
      withoutEnlargement: config.withoutEnlargement ?? true,
      ...(config.background ? { background: config.background } : {}),
    },
  };
}

/** Keeps one entry per size label, so a fallback retry does not duplicate work. */
function dedupeByLabel(plan: readonly PlannedVariant[]): PlannedVariant[] {
  const seen = new Set<string>();
  return plan.filter((p) => (seen.has(p.label) ? false : (seen.add(p.label), true)));
}

function computeSavings(sourceSize: number, variants: readonly Variant[]): number {
  if (sourceSize <= 0 || variants.length === 0) return 0;
  const largest = variants.reduce((a, b) => (b.size > a.size ? b : a));
  return Math.max(0, 1 - largest.size / sourceSize);
}

function clampQuality(value: number): number {
  return Math.min(100, Math.max(1, Math.round(value)));
}

function normalizePrefix(prefix: string | undefined): string {
  return prefix ? prefix.replace(/^\/+|\/+$/g, '') : '';
}

/** Per-call options must not clobber constructor defaults with `undefined`. */
function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
