/**
 * The planning half of an `optimize()` call, run in the browser.
 *
 * Every function this uses: `sniff`, `validateImage`, `normalizeFormats`,
 * `defaultLabel`, `buildKey`, `defaultQuality`: is imported from
 * `@lens-image/core/browser`. The playground is not a reimplementation: it is the
 * real library, minus the codec.
 *
 * What it cannot do is encode, so it reports dimensions and keys rather than
 * predicted file sizes. Guessing at byte counts would be the one number on the
 * page that was made up.
 */

import {
  buildKey,
  defaultLabel,
  defaultQuality,
  extensionFor,
  normalizeFormats,
  resolveValidation,
  sniff,
  validateImage,
  LensError,
  type DetectedFormat,
  type ImageFormat,
  type ImageMetadata,
} from '@lens-image/core/browser';

/** What the controls collect. */
export interface PlanInput {
  readonly formats: readonly string[];
  readonly widths: readonly number[];
  readonly quality: number;
  readonly keyTemplate: string;
  readonly prefix: string;
  readonly thumbnail: boolean;
  readonly maxBytes: number;
}

/** One planned output. */
export interface PlannedVariant {
  readonly format: ImageFormat;
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly quality: number;
  readonly key: string;
  readonly isThumbnail: boolean;
  /** True when the requested width exceeded the source and was clamped. */
  readonly clamped: boolean;
}

export interface Plan {
  readonly meta: ImageMetadata;
  readonly filename: string;
  readonly hash: string;
  readonly variants: readonly PlannedVariant[];
  readonly srcsets: Readonly<Record<string, string>>;
  readonly error?: { code: string; message: string };
}

/** The sample used before anyone drops a file in. */
export const SAMPLE = {
  filename: 'cabin-at-dusk.jpg',
  meta: {
    format: 'jpeg' as DetectedFormat,
    width: 4032,
    height: 3024,
    size: 3_618_204,
    orientation: 6,
  },
  hash: 'a1b2c3d4e5',
};

/**
 * Reads only as much of a file as the sniffer needs.
 *
 * This is the point of header sniffing: identifying a 40 MB image costs four
 * kilobytes, so a browser can reject it before the upload begins rather than
 * after two minutes of waiting.
 */
export async function readHeader(file: File): Promise<{ meta: ImageMetadata; hash: string }> {
  const header = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  const meta = sniff(header, file.size);

  return { meta, hash: await hashFile(file) };
}

/**
 * Content hash, matching the server's `shortHash`: SHA-256, first 10 hex chars.
 *
 * `crypto.subtle` is unavailable on insecure origins, so this degrades to a
 * placeholder rather than throwing: the keys are then illustrative, which the
 * UI says.
 */
async function hashFile(file: File): Promise<string> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 10);
  } catch {
    return 'a1b2c3d4e5';
  }
}

/** Expands the controls into the variant list Lens would produce. */
export function plan(
  input: PlanInput,
  meta: ImageMetadata,
  filename: string,
  hash: string,
): Plan {
  const base: Omit<Plan, 'variants' | 'srcsets'> = { meta, filename, hash };

  // Validation runs first here too, exactly as it does on the server.
  try {
    const policy = resolveValidation({ maxBytes: input.maxBytes });
    validateImage(meta, policy, filename);
  } catch (error) {
    if (LensError.is(error)) {
      return {
        ...base,
        variants: [],
        srcsets: {},
        error: { code: error.code, message: error.message },
      };
    }
    throw error;
  }

  let formats: readonly ImageFormat[];
  try {
    formats = normalizeFormats(input.formats);
  } catch (error) {
    return {
      ...base,
      variants: [],
      srcsets: {},
      error: {
        code: 'INVALID_OPTIONS',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }

  const widths = input.widths.length > 0 ? input.widths : [meta.width];
  const variants: PlannedVariant[] = [];

  for (const format of formats) {
    for (const requested of widths) {
      variants.push(
        buildVariant(input, meta, hash, filename, format, requested, false, input.quality),
      );
    }
  }

  if (input.thumbnail && formats[0]) {
    variants.push(
      buildVariant(input, meta, hash, filename, formats[0], 256, true, input.quality),
    );
  }

  const srcsets: Record<string, string> = {};
  for (const format of formats) {
    srcsets[format] = variants
      .filter((v) => v.format === format && !v.isThumbnail)
      .sort((a, b) => a.width - b.width)
      .map((v) => `/${v.key} ${v.width}w`)
      .join(', ');
  }

  return { ...base, variants, srcsets };
}

function buildVariant(
  input: PlanInput,
  meta: ImageMetadata,
  hash: string,
  filename: string,
  format: ImageFormat,
  requested: number,
  isThumbnail: boolean,
  quality: number,
): PlannedVariant {
  // `withoutEnlargement` is on by default, so a requested width above the
  // source is clamped rather than producing a blurry upscale.
  const clamped = meta.width > 0 && requested > meta.width;
  const width = clamped ? meta.width : requested;
  const height =
    meta.width > 0 ? Math.round((width / meta.width) * meta.height) : 0;

  const resolvedQuality = quality || defaultQuality(format);
  const label = isThumbnail ? 'thumb' : defaultLabel(width);

  const key = buildKey(
    input.keyTemplate,
    {
      name: slug(filename),
      hash,
      fullHash: hash.padEnd(64, '0'),
      format,
      ext: extensionFor(format),
      width,
      height,
      quality: resolvedQuality,
      label,
    },
    input.prefix,
  );

  return { format, label, width, height, quality: resolvedQuality, key, isThumbnail, clamped };
}

/** Mirrors the core's `slugify(stem(filename))`. */
function slug(filename: string): string {
  const withoutExt = filename.replace(/\.[^.]+$/, '');
  return (
    withoutExt
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100) || 'image'
  );
}
