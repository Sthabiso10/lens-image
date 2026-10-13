import { resolveValidation } from '@lens-image/core/browser';
import type { ImageMetadata } from '@lens-image/core/browser';
import type { BrowserFormat } from '@/lib/encode';

/** The formats offered, with the label the button shows. */
export const FORMATS: { id: BrowserFormat; label: string }[] = [
  { id: 'avif', label: 'avif' },
  { id: 'webp', label: 'webp' },
  { id: 'jpeg', label: 'jpg' },
  { id: 'png', label: 'png' },
];

/** How a format is written in prose: the status line and the image labels. */
export const FORMAT_NAME: Record<BrowserFormat, string> = {
  avif: 'AVIF',
  webp: 'WebP',
  jpeg: 'JPEG',
  png: 'PNG',
};

export const WIDTH_PRESETS = [
  { label: 'Responsive', widths: [1600, 1200, 800, 400] },
  { label: 'Article', widths: [1200, 600] },
  { label: 'Avatar', widths: [256, 96, 48] },
  { label: 'Original', widths: [] as number[] },
];

/** Largest file the playground accepts, matching what it plans against. */
export const MAX_BYTES = 25 * 1024 * 1024;

/**
 * The library's own limits: the byte cap above, and its default 100-megapixel
 * decompression-bomb guard. Checked from the file header, before anything is
 * decoded.
 */
export const POLICY = resolveValidation({ maxBytes: MAX_BYTES });

export const KEY_TEMPLATES = [
  '{hash}/{name}-{label}.{ext}',
  '{format}/{name}-{width}w.{ext}',
  '{name}/{label}.{ext}',
];

/** What the playground is currently working on. */
export interface Source {
  readonly name: string;
  readonly bytes: number;
  readonly url: string;
  readonly bitmap: ImageBitmap;
  readonly meta: ImageMetadata;
  readonly hash: string;
  /** True when we created the object URL and therefore owe a revoke. */
  readonly owned: boolean;
  /** The bundled sample this came from, or null for a file the user chose. */
  readonly sample: string | null;
}
