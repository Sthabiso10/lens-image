/**
 * Helpers for getting an {@link OptimizeResult} into HTML.
 *
 * These are pure functions over the result object, deliberately framework-free
 * so they work in Express templates, Next.js, Astro or a string concatenation
 * in a cron job.
 */

import { mimeTypeFor } from './sniff.js';
import type { FormatResult, ImageFormat, OptimizeResult, Variant } from './types.js';

/**
 * Builds a `srcset` attribute value from variants.
 *
 * Variants without a URL (process-only mode) and zero-width variants are
 * skipped, and the list is sorted ascending so browsers pick sensibly.
 *
 * @example
 * ```ts
 * buildSrcset(result.formats.webp!.variants);
 * // 'https://cdn/…-300w.webp 300w, https://cdn/…-600w.webp 600w'
 * ```
 */
export function buildSrcset(variants: readonly Variant[]): string {
  return [...variants]
    .filter((v) => v.url && v.width > 0)
    .sort((a, b) => a.width - b.width)
    .map((v) => `${v.url} ${v.width}w`)
    .join(', ');
}

/** One `<source>` element's worth of data. */
export interface PictureSource {
  readonly type: string;
  readonly srcset: string;
  readonly sizes?: string;
}

/** Everything needed to render a `<picture>`. */
export interface PictureData {
  /** In the order given to `optimize`, which is the order they should be tried. */
  readonly sources: readonly PictureSource[];
  /** `src` for the `<img>` fallback - the widest variant of the last format. */
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
}

/**
 * Reshapes a result into `<picture>`-ready data.
 *
 * Source order is the order formats were requested, which matters: the browser
 * takes the first `<source>` it supports. Request `['avif', 'webp', 'jpeg']`
 * and you get exactly the progressive-enhancement ladder you wanted.
 *
 * @example
 * ```tsx
 * const pic = toPicture(result, { alt: 'Cabin at dusk', sizes: '(max-width: 768px) 100vw, 50vw' });
 *
 * <picture>
 *   {pic.sources.map((s) => <source key={s.type} type={s.type} srcSet={s.srcset} sizes={s.sizes} />)}
 *   <img src={pic.src} width={pic.width} height={pic.height} alt={pic.alt} loading="lazy" />
 * </picture>
 * ```
 */
export function toPicture(
  result: OptimizeResult,
  options: { alt?: string; sizes?: string } = {},
): PictureData {
  const groups = Object.values(result.formats).filter(Boolean) as FormatResult[];

  const sources = groups
    .filter((group) => group.srcset.length > 0)
    .map((group) => ({
      type: mimeTypeFor(group.format),
      srcset: group.srcset,
      ...(options.sizes ? { sizes: options.sizes } : {}),
    }));

  // The <img> fallback should be the most compatible format available, which is
  // the last one requested in a properly ordered format list.
  const fallback = groups[groups.length - 1]?.largest;

  return {
    sources,
    src: fallback?.url ?? '',
    width: fallback?.width ?? result.source.width,
    height: fallback?.height ?? result.source.height,
    alt: options.alt ?? '',
  };
}

/**
 * Picks the variant closest to a target width without going under it, so the
 * rendered image is never upscaled.
 *
 * @example `pickVariant(result, 800, 'webp')`
 */
export function pickVariant(
  result: OptimizeResult,
  targetWidth: number,
  format?: ImageFormat,
): Variant | undefined {
  const pool = format ? (result.formats[format]?.variants ?? []) : result.variants;
  const sorted = [...pool].sort((a, b) => a.width - b.width);
  return sorted.find((v) => v.width >= targetWidth) ?? sorted[sorted.length - 1];
}
