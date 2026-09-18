/**
 * Turning an {@link UploadedImage} into props you can spread onto elements.
 *
 * Plain functions rather than components, so they work with any styling
 * approach and add nothing to your render tree.
 */

import type { UploadedImage, UploadedVariant } from './types.js';

/** Props for one `<source>`. */
export interface SourceProps {
  readonly type: string;
  readonly srcSet: string;
  readonly sizes?: string;
}

/** Props for the `<img>` fallback. */
export interface ImgProps {
  readonly src: string;
  readonly srcSet?: string;
  readonly sizes?: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
  readonly loading?: 'lazy' | 'eager';
  readonly decoding?: 'async' | 'sync' | 'auto';
}

const MIME: Record<string, string> = {
  avif: 'image/avif',
  webp: 'image/webp',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  tiff: 'image/tiff',
};

/**
 * Builds `<picture>` props from an upload result.
 *
 * Source order follows the order the server generated formats in, which is the
 * order the browser will try them - so a server configured with
 * `['avif', 'webp', 'jpg']` produces the right progressive-enhancement ladder
 * with no extra work here.
 *
 * `width` and `height` are always set, because a missing intrinsic size is the
 * single most common cause of layout shift on image-heavy pages.
 *
 * @example
 * ```tsx
 * const { sources, img } = toPictureProps(image, {
 *   alt: 'Sunset over the bay',
 *   sizes: '(max-width: 768px) 100vw, 50vw',
 * });
 *
 * <picture>
 *   {sources.map((source) => <source key={source.type} {...source} />)}
 *   <img {...img} />
 * </picture>
 * ```
 */
export function toPictureProps(
  image: UploadedImage,
  options: { alt?: string; sizes?: string; loading?: 'lazy' | 'eager' } = {},
): { sources: SourceProps[]; img: ImgProps } {
  const entries = Object.entries(image.formats);

  const sources = entries
    .filter(([, group]) => group.srcset.length > 0)
    .map(([format, group]) => ({
      type: MIME[format] ?? `image/${format}`,
      srcSet: group.srcset,
      ...(options.sizes ? { sizes: options.sizes } : {}),
    }));

  const last = entries[entries.length - 1]?.[1];
  const fallback = last ? widest(last.variants) : undefined;

  return {
    sources,
    img: {
      src: fallback?.url ?? '',
      ...(last?.srcset ? { srcSet: last.srcset } : {}),
      ...(options.sizes ? { sizes: options.sizes } : {}),
      width: fallback?.width ?? image.source.width,
      height: fallback?.height ?? image.source.height,
      alt: options.alt ?? '',
      loading: options.loading ?? 'lazy',
      decoding: 'async',
    },
  };
}

/**
 * Picks the smallest variant at least `targetWidth` wide, so the browser never
 * upscales. Falls back to the widest available.
 */
export function pickVariant(
  image: UploadedImage,
  targetWidth: number,
  format?: string,
): UploadedVariant | undefined {
  const pool = format
    ? (image.formats[format]?.variants ?? [])
    : Object.values(image.formats).flatMap((group) => group.variants);

  const sorted = [...pool].sort((a, b) => a.width - b.width);
  return sorted.find((variant) => variant.width >= targetWidth) ?? sorted[sorted.length - 1];
}

function widest(variants: readonly UploadedVariant[]): UploadedVariant | undefined {
  return variants.reduce<UploadedVariant | undefined>(
    (best, variant) => (best === undefined || variant.width > best.width ? variant : best),
    undefined,
  );
}
