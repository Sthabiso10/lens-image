/**
 * The sharp-backed {@link ImageEngine}.
 *
 * ### Why this is not a dependency
 *
 * `@lens-image/core` declares sharp as an *optional peer*. Nothing in this file is
 * evaluated until you actually call the engine, and the import is dynamic, so
 * `npm install @lens-image/core` pulls in zero packages and installs zero native
 * binaries. If you never resize an image - you only validate and re-key, say -
 * you never need sharp at all.
 *
 * The moment you do need it, you run `npm install sharp` yourself, which means
 * the native binary, its platform matrix and its release cadence are all
 * visible in *your* lockfile rather than smuggled in under ours.
 */

import { join } from 'node:path';
import { LensError, wrapError } from './../errors.js';
import { defaultEffort } from './../format.js';
import type { EncodedImage, ImageEngine, ImageFormat, ImageMetadata, TransformOp } from './../types.js';

/** Minimal structural typing of the bits of sharp we use. */
interface SharpInstance {
  metadata(): Promise<Record<string, unknown>>;
  rotate(): SharpInstance;
  resize(options: Record<string, unknown>): SharpInstance;
  toFormat(format: string, options: Record<string, unknown>): SharpInstance;
  withMetadata(): SharpInstance;
  toBuffer(options: { resolveWithObject: true }): Promise<{ data: Uint8Array; info: { width: number; height: number; size: number; format: string } }>;
}

interface SharpModule {
  (input: Uint8Array, options?: Record<string, unknown>): SharpInstance;
  format: Record<string, { output?: unknown }>;
  cache?(options: false | { memory?: number; files?: number; items?: number }): unknown;
  concurrency?(threads?: number): number;
}

/**
 * Formats whose capability is reported under a different key.
 *
 * sharp reports support per *container*, and AVIF is not one of its containers:
 * AVIF is HEIF with AV1 compression, so `sharp.format.avif` is `undefined` even
 * on builds that encode AVIF perfectly well. Checking only the literal name
 * makes every AVIF request degrade to JPEG for no reason - the exact failure
 * the fallback exists to handle, triggered by a bug rather than a real
 * limitation.
 *
 * The first entry that reports an encoder wins.
 */
const CAPABILITY_KEYS: Partial<Record<ImageFormat, readonly string[]>> = {
  avif: ['avif', 'heif'],
};

let cached: Promise<SharpModule> | undefined;

/**
 * True when the failure really is "there is no sharp here".
 *
 * `ERR_MODULE_NOT_FOUND` is also thrown when sharp itself is present but one of
 * *its* dependencies fails to resolve, and the two cases need opposite advice.
 * Telling someone to install a package they have already installed sends them
 * looking in exactly the wrong place, so the specifier in the message is what
 * decides which message they get.
 */
function isMissingSharp(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  if (code !== 'ERR_MODULE_NOT_FOUND' && code !== 'MODULE_NOT_FOUND') return false;

  const message = (error as Error)?.message ?? '';
  return /(^|[^\w/-])'?sharp'?([^\w/-]|$)/.test(message) && !/node_modules[\\/](?!sharp)/.test(message);
}

/**
 * Resolves sharp, memoising both success and failure.
 *
 * Two loaders, not one. The dynamic `import()` is tried first because it works
 * in every runtime including ESM-only ones, but it can fail on a perfectly good
 * installation: sharp's own ESM entry point resolves `detect-libc` in a way
 * that some Node versions reject, and the resulting `ERR_MODULE_NOT_FOUND`
 * names an inner file rather than sharp. `require` resolves the CJS entry and
 * is unaffected, so it is worth trying before giving up.
 *
 * That is not hypothetical. sharp 0.35.4 with detect-libc 2.1.2 on Node 20
 * fails the import and succeeds the require, which made Lens fall back to the
 * passthrough engine and tell the user to install a package they already had.
 */
async function loadSharp(): Promise<SharpModule> {
  cached ??= (async () => {
    // The template literal defeats bundler static analysis, so tools like
    // webpack and esbuild do not try to resolve sharp at build time in
    // projects that never use it.
    const specifier = 'sharp';
    let importError: unknown;

    try {
      const mod = (await import(/* @vite-ignore */ `${specifier}`)) as
        | SharpModule
        | { default: SharpModule };
      return ('default' in mod ? mod.default : mod) as SharpModule;
    } catch (error) {
      importError = error;
    }

    try {
      const { createRequire } = await import('node:module');
      // Seeded from the working directory so resolution walks the consumer's
      // own node_modules, which is where their sharp lives.
      const require = createRequire(join(process.cwd(), 'noop.js'));
      const mod = require(specifier) as SharpModule | { default: SharpModule };
      return ('default' in mod ? mod.default : mod) as SharpModule;
    } catch (requireError) {
      // Both failed. Which message to give depends on whether sharp is absent
      // or merely unloadable.
      if (isMissingSharp(importError) && isMissingSharp(requireError)) {
        throw new LensError(
          'ENGINE_UNAVAILABLE',
          'Image processing needs sharp, which is not installed. Run `npm install sharp`. ' +
            'It is an optional peer dependency of @lens-image/core so that installing the core ' +
            'library never pulls in a native binary you might not need.',
          { cause: importError, details: { engine: 'sharp' } },
        );
      }

      throw new LensError(
        'ENGINE_UNAVAILABLE',
        'sharp is installed but could not be loaded, so it is not a missing dependency. ' +
          `Importing it failed with: ${describeError(importError)}. ` +
          `Requiring it failed with: ${describeError(requireError)}. ` +
          'A mismatched or partially installed native binary is the usual cause; ' +
          'reinstalling sharp for this platform normally clears it.',
        { cause: importError, details: { engine: 'sharp' } },
      );
    }
  })();
  return cached;
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return `${(error as { code?: string }).code ?? error.name}: ${error.message.split('\n')[0]}`;
}

/** Options for {@link createSharpEngine}. */
export interface SharpEngineOptions {
  /**
   * libvips operation cache. Defaults to `false`.
   *
   * sharp caches decoded operations globally, which is a memory leak shaped
   * like a performance feature in a long-lived server that processes unbounded
   * user uploads. Turn it on only if you re-process the same images repeatedly.
   */
  readonly cache?: false | { memory?: number; files?: number; items?: number };

  /**
   * libvips worker threads per operation. Defaults to sharp's own choice.
   *
   * Set this to 1 when you are already running several optimize jobs in
   * parallel: `concurrency: 4` in Lens plus 4 libvips threads each is 16
   * threads fighting over the same cores.
   */
  readonly threads?: number;

  /** Pixel limit handed to sharp's own decoder guard. Default 100 megapixels. */
  readonly pixelLimit?: number;

  /** Pull every frame of an animated GIF/WebP through the pipeline. Default `false`. */
  readonly animated?: boolean;
}

/**
 * Creates an {@link ImageEngine} backed by sharp.
 *
 * @example
 * ```ts
 * const optimizer = new ImageOptimizer({
 *   engine: createSharpEngine({ threads: 1 }),  // we do our own parallelism
 *   adapter,
 * });
 * ```
 */
export function createSharpEngine(options: SharpEngineOptions = {}): ImageEngine {
  const { cache = false, threads, pixelLimit = 100_000_000, animated = false } = options;
  let configured = false;

  async function sharp(): Promise<SharpModule> {
    const mod = await loadSharp();
    if (!configured) {
      configured = true;
      mod.cache?.(cache);
      if (threads !== undefined) mod.concurrency?.(threads);
    }
    return mod;
  }

  return {
    name: 'sharp',

    async supports(format: ImageFormat): Promise<boolean> {
      try {
        const mod = await sharp();
        // Capability depends on how libvips was built - AVIF in particular is
        // missing from some prebuilt binaries - so this asks sharp rather than
        // assuming. See CAPABILITY_KEYS for why the name is not always literal.
        const keys = CAPABILITY_KEYS[format] ?? [format];
        return keys.some((key) => Boolean(mod.format[key]?.output));
      } catch {
        return false;
      }
    },

    async probe(input: Uint8Array): Promise<ImageMetadata> {
      const mod = await sharp();
      try {
        const meta = (await mod(input, { limitInputPixels: pixelLimit }).metadata()) as {
          format?: string;
          width?: number;
          height?: number;
          size?: number;
          hasAlpha?: boolean;
          pages?: number;
          orientation?: number;
          space?: string;
        };
        return {
          format: (meta.format as ImageMetadata['format']) ?? 'unknown',
          width: meta.width ?? 0,
          height: meta.height ?? 0,
          size: meta.size ?? input.byteLength,
          hasAlpha: meta.hasAlpha ?? false,
          isAnimated: (meta.pages ?? 1) > 1,
          ...(meta.orientation !== undefined ? { orientation: meta.orientation } : {}),
          ...(meta.space !== undefined ? { space: meta.space } : {}),
        };
      } catch (error) {
        throw wrapError('UNSUPPORTED_INPUT', 'sharp could not read this image', error, {
          engine: 'sharp',
        });
      }
    },

    async transform(input: Uint8Array, op: TransformOp): Promise<EncodedImage> {
      const mod = await sharp();
      try {
        let pipeline = mod(input, { limitInputPixels: pixelLimit, animated });

        // Auto-orient first: rotating after a resize would resize against the
        // wrong axis for any photo shot in portrait on a phone.
        if (op.autoOrient) pipeline = pipeline.rotate();

        if (op.resize) {
          pipeline = pipeline.resize({
            ...(op.resize.width !== undefined ? { width: op.resize.width } : {}),
            ...(op.resize.height !== undefined ? { height: op.resize.height } : {}),
            fit: op.resize.fit ?? 'cover',
            position: op.resize.position ?? 'center',
            withoutEnlargement: op.resize.withoutEnlargement ?? true,
            ...(op.resize.background ? { background: op.resize.background } : {}),
          });
        }

        pipeline = pipeline.toFormat(op.format, encoderOptions(op));

        // sharp strips metadata unless asked; `withMetadata()` keeps EXIF/ICC.
        if (op.preserveMetadata) pipeline = pipeline.withMetadata();

        const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
        return {
          data,
          format: op.format,
          width: info.width,
          height: info.height,
          size: info.size ?? data.byteLength,
        };
      } catch (error) {
        throw wrapError(
          'ENCODE_FAILED',
          `sharp failed to encode ${op.format}`,
          error,
          { engine: 'sharp', format: op.format },
        );
      }
    },
  };
}

/** Maps a {@link TransformOp} onto sharp's per-format encoder options. */
function encoderOptions(op: TransformOp): Record<string, unknown> {
  const effort = op.effort ?? defaultEffort(op.format);
  const base: Record<string, unknown> = { quality: op.quality };

  switch (op.format) {
    case 'jpeg':
      return {
        ...base,
        progressive: op.progressive ?? true,
        // 4:4:4 avoids the colour smearing that 4:2:0 causes on saturated reds
        // and fine text, which is exactly what high-quality output is for.
        chromaSubsampling: op.chromaSubsampling ?? (op.quality >= 90 ? '4:4:4' : '4:2:0'),
        mozjpeg: true,
      };
    case 'png':
      return {
        progressive: op.progressive ?? false,
        compressionLevel: 9,
        // Palette quantisation is where PNG size actually comes from; without
        // it `quality` is ignored entirely and output is often larger than input.
        palette: true,
        quality: op.quality,
        effort: effort ?? 7,
      };
    case 'webp':
      return {
        ...base,
        ...(op.lossless !== undefined ? { lossless: op.lossless } : {}),
        ...(effort !== undefined ? { effort } : {}),
        smartSubsample: true,
      };
    case 'avif':
      return {
        ...base,
        ...(op.lossless !== undefined ? { lossless: op.lossless } : {}),
        ...(effort !== undefined ? { effort } : {}),
        chromaSubsampling: op.chromaSubsampling ?? '4:4:4',
      };
    case 'gif':
      return { ...(effort !== undefined ? { effort } : {}) };
    case 'tiff':
      return { ...base, compression: 'lzw' };
    default:
      return base;
  }
}

/** Test seam: forget the memoised sharp module. */
export function resetSharpCache(): void {
  cached = undefined;
}
