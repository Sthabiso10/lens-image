/** Format normalisation and per-format encoding defaults. */

import { LensError } from './errors.js';
import type { ImageFormat, ImageFormatInput } from './types.js';

const ALIASES: Record<string, ImageFormat> = {
  jpg: 'jpeg',
  jpeg: 'jpeg',
  jpe: 'jpeg',
  png: 'png',
  webp: 'webp',
  avif: 'avif',
  gif: 'gif',
  tif: 'tiff',
  tiff: 'tiff',
};

/** Every format Lens can encode to. */
export const ENCODABLE_FORMATS: readonly ImageFormat[] = [
  'jpeg',
  'png',
  'webp',
  'avif',
  'gif',
  'tiff',
];

/**
 * Maps a user-supplied format name onto its canonical form.
 *
 * `'jpg'` and `'JPEG'` both become `'jpeg'` so results are keyed consistently
 * no matter how the caller spelled it.
 *
 * @throws {LensError} `INVALID_OPTIONS` for an unknown name.
 */
export function normalizeFormat(input: ImageFormatInput | string): ImageFormat {
  const key = String(input).trim().toLowerCase().replace(/^\./, '');
  const format = ALIASES[key];
  if (!format) {
    throw new LensError(
      'INVALID_OPTIONS',
      `Unknown output format "${input}". Supported: ${ENCODABLE_FORMATS.join(', ')} (and the alias "jpg").`,
      { details: { actual: input as unknown as number } },
    );
  }
  return format;
}

/** Normalises a list, dropping duplicates while preserving the caller's order. */
export function normalizeFormats(
  inputs: readonly (ImageFormatInput | string)[],
): readonly ImageFormat[] {
  const seen = new Set<ImageFormat>();
  const out: ImageFormat[] = [];
  for (const input of inputs) {
    const format = normalizeFormat(input);
    if (!seen.has(format)) {
      seen.add(format);
      out.push(format);
    }
  }
  return out;
}

/** True when the format stores an alpha channel. */
export function supportsAlpha(format: ImageFormat): boolean {
  return format !== 'jpeg';
}

/** True when `quality` has any effect on the encode. */
export function isLossy(format: ImageFormat): boolean {
  return format === 'jpeg' || format === 'webp' || format === 'avif';
}

/**
 * Sensible per-format encoder defaults.
 *
 * AVIF gets a lower quality number than JPEG on purpose: the scales are not
 * comparable, and AVIF at q80 is wastefully large for the same perceived
 * result. Callers who pass an explicit quality always win over this.
 */
export function defaultQuality(format: ImageFormat): number {
  switch (format) {
    case 'avif':
      return 60;
    case 'webp':
      return 80;
    case 'jpeg':
      return 82;
    default:
      return 80;
  }
}

/**
 * Default encoder effort. AVIF is slow enough that the top setting is a
 * production hazard, so we sit mid-scale.
 */
export function defaultEffort(format: ImageFormat): number | undefined {
  switch (format) {
    case 'avif':
      return 4;
    case 'webp':
      return 4;
    default:
      return undefined;
  }
}
