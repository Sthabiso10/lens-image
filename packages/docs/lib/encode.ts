/**
 * Real image encoding, in the browser.
 *
 * The playground used to stop at planning: it could tell you what keys and
 * dimensions Lens would produce, but not what the files would weigh, so the
 * single most interesting thing the library does was the one thing it refused
 * to show. `canvas.toBlob()` is a genuine WebP/JPEG encoder sitting in every
 * browser, so the sizes here are measured rather than guessed.
 *
 * ### What this is not
 *
 * It is **not sharp**. The browser uses its own encoder with its own defaults,
 * so the same image at the same quality will not come out at exactly the byte
 * count libvips produces: in practice sharp does a little better, because it
 * tunes effort and chroma subsampling that the canvas API does not expose.
 *
 * The shape of the curve is the same, which is what a playground is for. The
 * UI says so plainly rather than implying these are server numbers.
 */

/** Formats a browser may be able to encode. */
export type BrowserFormat = 'webp' | 'jpeg' | 'avif' | 'png';

export interface EncodedVariant {
  readonly format: BrowserFormat;
  readonly width: number;
  readonly height: number;
  /** Measured bytes. */
  readonly size: number;
  /** Object URL. Revoke it when you are done, see {@link revoke}. */
  readonly url: string;
  readonly quality: number;
  /** Milliseconds the encode took. */
  readonly durationMs: number;
}

/**
 * Which formats this browser can actually encode.
 *
 * `toDataURL` silently falls back to PNG for a format it does not know, so the
 * only reliable test is to encode one pixel and read back what came out.
 */
export function detectFormats(): BrowserFormat[] {
  if (typeof document === 'undefined') return ['jpeg', 'png'];

  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;

  return (['webp', 'avif', 'jpeg', 'png'] as const).filter((format) => {
    try {
      return canvas.toDataURL(`image/${format}`).startsWith(`data:image/${format}`);
    } catch {
      return false;
    }
  });
}

/** Decodes a file, blob or URL into a bitmap ready to draw. */
export async function loadBitmap(source: File | Blob | string): Promise<ImageBitmap> {
  const blob =
    typeof source === 'string' ? await (await fetch(source)).blob() : source;

  // `imageOrientation: 'from-image'` applies EXIF rotation, which is what the
  // server does with `autoOrient`, without it a portrait phone photo decodes
  // sideways and every derived dimension here would be wrong.
  return createImageBitmap(blob, { imageOrientation: 'from-image' });
}

export interface EncodeOptions {
  /** Target width. The height follows from the aspect ratio. */
  readonly width?: number;
  readonly format: BrowserFormat;
  /** 1-100. Ignored by PNG. */
  readonly quality: number;
}

/**
 * Resizes and encodes one variant.
 *
 * Never upscales, matching the server's `withoutEnlargement` default: asking
 * for a width above the source returns the source size rather than a soft,
 * larger file that only looks worse.
 */
export async function encodeVariant(
  bitmap: ImageBitmap,
  options: EncodeOptions,
): Promise<EncodedVariant> {
  const started = performance.now();

  const target = options.width ?? bitmap.width;
  const scale = Math.min(1, target / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser refused a 2D canvas context.');

  // The browser's own downscaler. 'high' asks for a multi-step filter rather
  // than the box filter it would otherwise use, which is the difference
  // between a sharp thumbnail and a crunchy one.
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, `image/${options.format}`, options.quality / 100),
  );

  if (!blob) throw new Error(`This browser could not encode ${options.format}.`);

  return {
    format: options.format,
    width,
    height,
    size: blob.size,
    url: URL.createObjectURL(blob),
    quality: options.quality,
    durationMs: Math.round(performance.now() - started),
  };
}

/** Releases the object URLs on a set of variants. */
export function revoke(variants: readonly { url: string }[]): void {
  for (const variant of variants) {
    try {
      URL.revokeObjectURL(variant.url);
    } catch {
      /* Already revoked, or never a blob URL. Nothing to do. */
    }
  }
}

/**
 * Runs a list of encodes one after another.
 *
 * Sequential on purpose. Canvas work is synchronous on the main thread, so
 * firing ten encodes at once does not make them finish sooner: it just holds
 * the thread long enough for the quality slider to stop tracking the pointer.
 */
export async function encodeAll(
  bitmap: ImageBitmap,
  jobs: readonly EncodeOptions[],
  signal?: AbortSignal,
): Promise<EncodedVariant[]> {
  const out: EncodedVariant[] = [];

  for (const job of jobs) {
    if (signal?.aborted) break;
    out.push(await encodeVariant(bitmap, job));
    // Yield so the slider keeps repainting between variants.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  if (signal?.aborted) {
    revoke(out);
    return [];
  }
  return out;
}
