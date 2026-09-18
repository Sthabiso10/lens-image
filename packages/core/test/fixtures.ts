/**
 * Hand-built image fixtures.
 *
 * Real image files would mean binary blobs in git and a codec to generate them.
 * These are the actual byte layouts the sniffer parses, written out by hand -
 * which has the pleasant side effect that a test failure points at the exact
 * header field that broke.
 */

import { sniff } from '../src/sniff.js';
import type { EncodedImage, ImageEngine, ImageFormat, ImageMetadata, TransformOp } from '../src/types.js';

const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const be16 = (n: number) => [(n >>> 8) & 0xff, n & 0xff];
const le16 = (n: number) => [n & 0xff, (n >>> 8) & 0xff];
const le32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
const chars = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** A minimal but structurally valid PNG header. */
export function pngFixture(width = 800, height = 600, colorType = 6): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...be32(13), ...chars('IHDR'),
    ...be32(width), ...be32(height),
    8, colorType, 0, 0, 0,
    ...be32(0), // Fake CRC - the sniffer does not verify it.
    ...be32(0), ...chars('IDAT'), ...be32(0),
  ]);
}

/** A JPEG with an SOF0 frame header, optionally carrying an EXIF orientation. */
export function jpegFixture(width = 1024, height = 768, orientation?: number): Uint8Array {
  const exif = orientation
    ? [
        0xff, 0xe1,
        ...be16(2 + 6 + 8 + 2 + 12 + 4),
        ...chars('Exif'), 0x00, 0x00,
        ...chars('II'), ...le16(42), ...le32(8), // TIFF header, little-endian.
        ...le16(1), // One IFD entry.
        ...le16(0x0112), ...le16(3), ...le32(1), ...le16(orientation), 0x00, 0x00,
        ...le32(0), // Next-IFD offset.
      ]
    : [];

  return new Uint8Array([
    0xff, 0xd8,
    ...exif,
    0xff, 0xc0, ...be16(17), 8, ...be16(height), ...be16(width), 3,
    1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
    0xff, 0xd9,
  ]);
}

/** A GIF89a header. Pass `frames > 1` for an animated one. */
export function gifFixture(width = 320, height = 240, frames = 1): Uint8Array {
  const gce = [0x00, 0x21, 0xf9, 0x04, 0x00, 0x00, 0x00, 0x00];
  return new Uint8Array([
    ...chars('GIF89a'),
    ...le16(width), ...le16(height),
    0x00, 0x00, 0x00,
    ...Array.from({ length: frames }, () => gce).flat(),
    0x3b,
  ]);
}

/** A lossy (VP8) WebP. */
export function webpFixture(width = 640, height = 480): Uint8Array {
  const body = [
    ...chars('WEBP'), ...chars('VP8 '), ...le32(20),
    0x00, 0x00, 0x00, // Frame tag.
    0x9d, 0x01, 0x2a, // Start code.
    ...le16(width), ...le16(height),
    0, 0, 0, 0, 0, 0, 0, 0,
  ];
  return new Uint8Array([...chars('RIFF'), ...le32(body.length), ...body]);
}

/** An extended (VP8X) WebP, which is how animated and alpha WebPs are stored. */
export function webpExtendedFixture(width = 1200, height = 900, animated = false): Uint8Array {
  const flags = (animated ? 0x02 : 0) | 0x10; // Alpha bit always set here.
  const body = [
    ...chars('WEBP'), ...chars('VP8X'), ...le32(10),
    flags, 0, 0, 0,
    ...le16(width - 1), (width - 1) >>> 16,
    ...le16(height - 1), (height - 1) >>> 16,
  ];
  return new Uint8Array([...chars('RIFF'), ...le32(body.length), ...body]);
}

/** An AVIF with a `meta > iprp > ipco > ispe` box chain. */
export function avifFixture(width = 1920, height = 1080): Uint8Array {
  const ispe = [...be32(20), ...chars('ispe'), ...be32(0), ...be32(width), ...be32(height)];
  const ipco = [...be32(8 + ispe.length), ...chars('ipco'), ...ispe];
  const iprp = [...be32(8 + ipco.length), ...chars('iprp'), ...ipco];
  const meta = [...be32(12 + iprp.length), ...chars('meta'), ...be32(0), ...iprp];
  const ftyp = [...be32(20), ...chars('ftyp'), ...chars('avif'), ...be32(0), ...chars('mif1')];
  return new Uint8Array([...ftyp, ...meta]);
}

/** A little-endian TIFF with width and height IFD tags. */
export function tiffFixture(width = 400, height = 300): Uint8Array {
  return new Uint8Array([
    ...chars('II'), ...le16(42), ...le32(8),
    ...le16(2),
    ...le16(0x0100), ...le16(4), ...le32(1), ...le32(width),
    ...le16(0x0101), ...le16(4), ...le32(1), ...le32(height),
    ...le32(0),
  ]);
}

/** An SVG document with explicit width and height attributes. */
export function svgFixture(width = 100, height = 50): Uint8Array {
  return new TextEncoder().encode(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect/></svg>`,
  );
}

/** Bytes that are not any image format. */
export function garbageFixture(size = 64): Uint8Array {
  return new Uint8Array(Array.from({ length: size }, (_, i) => (i * 37) % 251));
}

// ---------------------------------------------------------------------------
// A fake engine
// ---------------------------------------------------------------------------

/** Options for {@link createFakeEngine}. */
export interface FakeEngineOptions {
  /** Formats it claims to encode. Default: webp, jpeg, png. */
  readonly supported?: readonly ImageFormat[];
  /** Formats whose `transform` always throws, even though `supports` says yes. */
  readonly failing?: readonly ImageFormat[];
  /** Output bytes per encoded pixel. Default 0.1, so output is visibly smaller. */
  readonly bytesPerPixel?: number;
  /** Intrinsic size reported for any input. */
  readonly sourceSize?: { width: number; height: number };
}

/** Per-engine call log, so tests can assert on what was asked for. */
export interface FakeEngineCalls {
  readonly transforms: TransformOp[];
  readonly probes: number;
}

/**
 * A deterministic engine with no codec.
 *
 * Lets the optimizer's planning, fallback, concurrency and caching logic be
 * tested exactly, with no sharp install and no timing variance.
 */
export function createFakeEngine(
  options: FakeEngineOptions = {},
): ImageEngine & { calls: FakeEngineCalls } {
  const supported = new Set(options.supported ?? (['webp', 'jpeg', 'png'] as ImageFormat[]));
  const failing = new Set(options.failing ?? []);
  const bytesPerPixel = options.bytesPerPixel ?? 0.1;
  const source = options.sourceSize ?? { width: 2000, height: 1500 };

  const calls: { transforms: TransformOp[]; probes: number } = { transforms: [], probes: 0 };

  return {
    name: 'fake',
    calls,

    supports: (format) => supported.has(format),

    async probe(input: Uint8Array): Promise<ImageMetadata> {
      calls.probes++;
      // Report the real container format, like a real decoder would, so tests
      // that turn on the format allowlist exercise it honestly.
      return {
        format: sniff(input).format,
        width: source.width,
        height: source.height,
        size: input.byteLength,
        hasAlpha: false,
        isAnimated: false,
      };
    },

    async transform(input: Uint8Array, op: TransformOp): Promise<EncodedImage> {
      calls.transforms.push(op);

      if (failing.has(op.format)) {
        throw new Error(`fake engine: ${op.format} encoding is broken`);
      }

      // Emulate `withoutEnlargement` and aspect-ratio preservation so the
      // dimensions in results are believable.
      const requested = op.resize?.width ?? source.width;
      const width = op.resize?.withoutEnlargement === false ? requested : Math.min(requested, source.width);
      const height = op.resize?.height ?? Math.round((width / source.width) * source.height);
      const size = Math.max(64, Math.round(width * height * bytesPerPixel * (op.quality / 100)));

      return { data: new Uint8Array(size).fill(op.quality), format: op.format, width, height, size };
    },
  };
}
