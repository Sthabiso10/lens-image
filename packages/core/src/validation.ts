/**
 * Input validation, run against the sniffed header before any decode happens.
 */

import { LensError } from './errors.js';
import { formatBytes } from './bytes.js';
import type { DetectedFormat, ImageMetadata, ValidationOptions } from './types.js';

/** 25 MiB. Large enough for a phone photo, small enough to bound memory. */
export const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

/**
 * 100 megapixels. A 10,000 x 10,000 image is already 400 MB decoded at
 * 4 bytes/pixel, so this is the line between "big photo" and "denial of service".
 */
export const DEFAULT_MAX_PIXELS = 100_000_000;

/** Formats accepted as input unless the caller narrows the list. */
export const DEFAULT_ALLOWED_FORMATS: readonly DetectedFormat[] = [
  'jpeg',
  'png',
  'webp',
  'avif',
  'gif',
  'tiff',
];

/** A fully-resolved validation policy. */
export interface ResolvedValidation {
  readonly maxBytes: number;
  readonly maxPixels: number;
  readonly allowedFormats: readonly DetectedFormat[];
  readonly minWidth: number;
  readonly minHeight: number;
}

/** Fills in defaults for anything the caller left out. */
export function resolveValidation(options: ValidationOptions | false | undefined): ResolvedValidation | null {
  if (options === false) return null;
  return {
    maxBytes: options?.maxBytes ?? DEFAULT_MAX_BYTES,
    maxPixels: options?.maxPixels ?? DEFAULT_MAX_PIXELS,
    allowedFormats: options?.allowedFormats ?? DEFAULT_ALLOWED_FORMATS,
    minWidth: options?.minWidth ?? 0,
    minHeight: options?.minHeight ?? 0,
  };
}

/**
 * Applies a resolved policy to sniffed metadata.
 *
 * @throws {LensError} `VALIDATION_FAILED` or `UNSUPPORTED_INPUT`, with the limit
 *   and the actual value on `error.details` so callers can build a useful
 *   response without re-deriving them.
 *
 * @example
 * ```ts
 * const policy = resolveValidation({ maxBytes: 5_000_000, allowedFormats: ['jpeg', 'png'] });
 * validateImage(sniff(bytes), policy, 'avatar.png');
 * ```
 */
export function validateImage(
  meta: ImageMetadata,
  policy: ResolvedValidation | null,
  filename = 'image',
): void {
  if (!policy) return;

  if (meta.format === 'unknown') {
    throw new LensError(
      'UNSUPPORTED_INPUT',
      `"${filename}" is not a recognisable image. The first bytes match no known image container.`,
      { details: { detected: 'unknown' } },
    );
  }

  if (!policy.allowedFormats.includes(meta.format)) {
    throw new LensError(
      'VALIDATION_FAILED',
      `"${filename}" is ${meta.format}, which is not in the allowed list (${policy.allowedFormats.join(', ')}).`,
      { details: { detected: meta.format, allowed: policy.allowedFormats } },
    );
  }

  if (meta.size > policy.maxBytes) {
    throw new LensError(
      'VALIDATION_FAILED',
      `"${filename}" is ${formatBytes(meta.size)}, over the ${formatBytes(policy.maxBytes)} limit.`,
      { details: { limit: policy.maxBytes, actual: meta.size } },
    );
  }

  const pixels = meta.width * meta.height;
  if (pixels > policy.maxPixels) {
    throw new LensError(
      'VALIDATION_FAILED',
      `"${filename}" is ${meta.width}x${meta.height} (${formatMegapixels(pixels)}), over the ` +
        `${formatMegapixels(policy.maxPixels)} limit. This guard exists to stop decompression bombs.`,
      { details: { limit: policy.maxPixels, actual: pixels } },
    );
  }

  if (policy.minWidth > 0 && meta.width > 0 && meta.width < policy.minWidth) {
    throw new LensError(
      'VALIDATION_FAILED',
      `"${filename}" is ${meta.width}px wide, under the ${policy.minWidth}px minimum.`,
      { details: { limit: policy.minWidth, actual: meta.width } },
    );
  }

  if (policy.minHeight > 0 && meta.height > 0 && meta.height < policy.minHeight) {
    throw new LensError(
      'VALIDATION_FAILED',
      `"${filename}" is ${meta.height}px tall, under the ${policy.minHeight}px minimum.`,
      { details: { limit: policy.minHeight, actual: meta.height } },
    );
  }
}

function formatMegapixels(pixels: number): string {
  return `${(pixels / 1_000_000).toFixed(1)}MP`;
}
