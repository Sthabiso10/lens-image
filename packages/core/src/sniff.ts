/**
 * Container sniffing: format and dimensions straight from the file header.
 *
 * This is deliberately dependency-free and decode-free. It exists so Lens can
 * reject a 40,000 x 40,000 PNG *before* handing 1.6 gigapixels to a codec -
 * the classic decompression-bomb footgun. It also means validation works
 * identically whether or not sharp is installed.
 *
 * Supported: JPEG, PNG, GIF, WebP, AVIF/HEIC, TIFF, BMP, ICO, SVG.
 */

import type { DetectedFormat, ImageMetadata } from './types.js';

/** Bytes we need before a decision can be made for any supported format. */
export const SNIFF_HEADER_BYTES = 4096;

const ascii = (bytes: Uint8Array, start: number, length: number): string => {
  let out = '';
  for (let i = start; i < start + length && i < bytes.length; i++) {
    out += String.fromCharCode(bytes[i] as number);
  }
  return out;
};

const u16be = (b: Uint8Array, i: number) => ((b[i] as number) << 8) | (b[i + 1] as number);
const u16le = (b: Uint8Array, i: number) => (b[i] as number) | ((b[i + 1] as number) << 8);
const u32be = (b: Uint8Array, i: number) =>
  (((b[i] as number) << 24) >>> 0) +
  (((b[i + 1] as number) << 16) | ((b[i + 2] as number) << 8) | (b[i + 3] as number));
const u32le = (b: Uint8Array, i: number) =>
  ((b[i] as number) |
    ((b[i + 1] as number) << 8) |
    ((b[i + 2] as number) << 16) |
    ((b[i + 3] as number) << 24)) >>>
  0;
const u24le = (b: Uint8Array, i: number) =>
  (b[i] as number) | ((b[i + 1] as number) << 8) | ((b[i + 2] as number) << 16);

const startsWith = (b: Uint8Array, sig: readonly number[], offset = 0): boolean => {
  if (b.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (b[offset + i] !== sig[i]) return false;
  return true;
};

/**
 * Identifies an image and reads its intrinsic size from the header alone.
 *
 * Never throws: an unrecognised buffer comes back as
 * `{ format: 'unknown', width: 0, height: 0 }` and the caller decides whether
 * that is fatal.
 *
 * @param bytes - The full file, or at least the first {@link SNIFF_HEADER_BYTES}.
 * @param totalSize - Real byte length, when `bytes` is only a prefix.
 *
 * @example
 * ```ts
 * const meta = sniff(await readFile('photo.jpg'));
 * // { format: 'jpeg', width: 4032, height: 3024, size: 2118431, orientation: 6 }
 * ```
 */
export function sniff(bytes: Uint8Array, totalSize = bytes.byteLength): ImageMetadata {
  const base = { size: totalSize };

  if (isPng(bytes)) return { ...base, ...readPng(bytes) };
  if (isJpeg(bytes)) return { ...base, ...readJpeg(bytes) };
  if (isGif(bytes)) return { ...base, ...readGif(bytes) };
  if (isWebp(bytes)) return { ...base, ...readWebp(bytes) };
  if (isIsoBmff(bytes)) return { ...base, ...readIsoBmff(bytes) };
  if (isTiff(bytes)) return { ...base, ...readTiff(bytes) };
  if (isBmp(bytes)) return { ...base, ...readBmp(bytes) };
  if (isIco(bytes)) return { ...base, ...readIco(bytes) };
  if (isSvg(bytes)) return { ...base, ...readSvg(bytes) };

  return { ...base, format: 'unknown', width: 0, height: 0 };
}

/** Just the format, when dimensions are not needed. */
export function sniffFormat(bytes: Uint8Array): DetectedFormat {
  return sniff(bytes, bytes.byteLength).format;
}

/** Canonical MIME type for a detected format. */
export function mimeTypeFor(format: DetectedFormat): string {
  switch (format) {
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'avif':
      return 'image/avif';
    case 'gif':
      return 'image/gif';
    case 'tiff':
      return 'image/tiff';
    case 'svg':
      return 'image/svg+xml';
    case 'bmp':
      return 'image/bmp';
    case 'ico':
      return 'image/x-icon';
    case 'heic':
      return 'image/heic';
    default:
      return 'application/octet-stream';
  }
}

/** File extension (no dot) for a format. `jpeg` becomes `jpg`, as it should. */
export function extensionFor(format: DetectedFormat): string {
  switch (format) {
    case 'jpeg':
      return 'jpg';
    case 'tiff':
      return 'tif';
    case 'ico':
      return 'ico';
    default:
      return format;
  }
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const isPng = (b: Uint8Array) => startsWith(b, PNG_SIG);

function readPng(b: Uint8Array) {
  // IHDR is mandated to be the first chunk: 8 sig + 4 length + 4 type.
  const width = b.length >= 24 ? u32be(b, 16) : 0;
  const height = b.length >= 24 ? u32be(b, 20) : 0;
  const colorType = b[25];
  // Colour types 4 (grey+alpha) and 6 (truecolour+alpha) carry an alpha channel;
  // type 3 (palette) can too, via a tRNS chunk.
  const hasAlpha = colorType === 4 || colorType === 6 || hasChunk(b, 'tRNS');
  // "acTL" before the first IDAT means APNG.
  const isAnimated = hasChunk(b, 'acTL');
  return { format: 'png' as const, width, height, hasAlpha, isAnimated };
}

function hasChunk(b: Uint8Array, type: string): boolean {
  let offset = 8;
  while (offset + 8 <= b.length) {
    const length = u32be(b, offset);
    const name = ascii(b, offset + 4, 4);
    if (name === type) return true;
    if (name === 'IDAT' || name === 'IEND') return false;
    // Guard against a corrupt length walking us off the end or backwards.
    if (length > b.length) return false;
    offset += 12 + length;
  }
  return false;
}

// ---------------------------------------------------------------------------
// JPEG
// ---------------------------------------------------------------------------

const isJpeg = (b: Uint8Array) => startsWith(b, [0xff, 0xd8, 0xff]);

/** Start-of-frame markers that carry dimensions. Excludes DHT/DAC/RST/SOS. */
const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function readJpeg(b: Uint8Array) {
  let offset = 2;
  let orientation: number | undefined;
  let width = 0;
  let height = 0;
  let progressive = false;

  while (offset + 4 <= b.length) {
    if (b[offset] !== 0xff) {
      offset++; // Resynchronise across padding bytes.
      continue;
    }
    const marker = b[offset + 1] as number;

    // Standalone markers carry no length payload.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break; // EOI or start of scan.

    const length = u16be(b, offset + 2);
    if (length < 2) break;

    if (SOF_MARKERS.has(marker) && offset + 9 <= b.length) {
      height = u16be(b, offset + 5);
      width = u16be(b, offset + 7);
      progressive = marker === 0xc2 || marker === 0xc6 || marker === 0xca;
      if (orientation !== undefined) break;
    } else if (marker === 0xe1 && ascii(b, offset + 4, 4) === 'Exif') {
      orientation = readExifOrientation(b, offset + 10, length - 8);
      if (width !== 0) break;
    }
    offset += 2 + length;
  }

  return {
    format: 'jpeg' as const,
    width,
    height,
    hasAlpha: false,
    isAnimated: false,
    ...(orientation !== undefined ? { orientation } : {}),
    ...(progressive ? { space: 'progressive' } : {}),
  };
}

/**
 * Pulls tag 0x0112 (Orientation) out of an EXIF TIFF header.
 * Returns undefined rather than throwing on anything malformed.
 */
function readExifOrientation(b: Uint8Array, start: number, length: number): number | undefined {
  if (start + 8 > b.length) return undefined;
  const byteOrder = ascii(b, start, 2);
  const little = byteOrder === 'II';
  if (!little && byteOrder !== 'MM') return undefined;

  const u16 = (i: number) => (little ? u16le(b, i) : u16be(b, i));
  const u32 = (i: number) => (little ? u32le(b, i) : u32be(b, i));

  const ifdOffset = u32(start + 4);
  const ifd = start + ifdOffset;
  if (ifd + 2 > b.length || ifdOffset > length) return undefined;

  const entries = u16(ifd);
  for (let i = 0; i < entries; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > b.length) return undefined;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : undefined;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// GIF
// ---------------------------------------------------------------------------

const isGif = (b: Uint8Array) => ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a';

function readGif(b: Uint8Array) {
  return {
    format: 'gif' as const,
    width: b.length >= 10 ? u16le(b, 6) : 0,
    height: b.length >= 10 ? u16le(b, 8) : 0,
    hasAlpha: true,
    // More than one Graphic Control Extension means more than one frame. A
    // single-frame GIF with a GCE exists, so this counts occurrences.
    isAnimated: countGifFrames(b) > 1,
  };
}

function countGifFrames(b: Uint8Array): number {
  let count = 0;
  for (let i = 0; i + 2 < b.length && count < 2; i++) {
    if (b[i] === 0x00 && b[i + 1] === 0x21 && b[i + 2] === 0xf9) count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// WebP
// ---------------------------------------------------------------------------

const isWebp = (b: Uint8Array) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP';

function readWebp(b: Uint8Array) {
  const chunk = ascii(b, 12, 4);
  const base = { format: 'webp' as const, hasAlpha: false, isAnimated: false };

  if (chunk === 'VP8X' && b.length >= 30) {
    const flags = b[20] as number;
    return {
      ...base,
      // VP8X stores canvas dimensions minus one, as 24-bit little-endian.
      width: u24le(b, 24) + 1,
      height: u24le(b, 27) + 1,
      hasAlpha: (flags & 0x10) !== 0,
      isAnimated: (flags & 0x02) !== 0,
    };
  }

  if (chunk === 'VP8 ' && b.length >= 30) {
    // Lossy: 3-byte frame tag, then the 0x9d012a start code.
    if (b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
      return { ...base, width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
    }
  }

  if (chunk === 'VP8L' && b.length >= 25 && b[20] === 0x2f) {
    // Lossless: 14 bits width-1 then 14 bits height-1, packed little-endian.
    const bits = u32le(b, 21);
    return {
      ...base,
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
      hasAlpha: ((bits >> 28) & 0x01) !== 0,
    };
  }

  return { ...base, width: 0, height: 0 };
}

// ---------------------------------------------------------------------------
// AVIF / HEIC (ISO base media file format)
// ---------------------------------------------------------------------------

const isIsoBmff = (b: Uint8Array) => b.length >= 12 && ascii(b, 4, 4) === 'ftyp';

const AVIF_BRANDS = new Set(['avif', 'avis']);
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heim', 'heis']);

function readIsoBmff(b: Uint8Array) {
  const major = ascii(b, 8, 4);
  const brands = new Set<string>([major]);
  const ftypSize = u32be(b, 0);
  for (let i = 16; i + 4 <= Math.min(ftypSize, b.length); i += 4) brands.add(ascii(b, i, 4));

  let format: DetectedFormat = 'unknown';
  for (const brand of brands) {
    if (AVIF_BRANDS.has(brand)) {
      format = 'avif';
      break;
    }
    if (HEIC_BRANDS.has(brand)) format = 'heic';
  }
  if (format === 'unknown') return { format, width: 0, height: 0 };

  const ispe = findBox(b, ['meta', 'iprp', 'ipco', 'ispe'], 0, b.length);
  const dims = ispe ? { width: u32be(b, ispe + 4), height: u32be(b, ispe + 8) } : { width: 0, height: 0 };

  return {
    format,
    ...dims,
    hasAlpha: findBox(b, ['meta', 'iprp', 'ipco', 'auxC'], 0, b.length) !== undefined,
    isAnimated: brands.has('avis') || brands.has('msf1'),
  };
}

/** Container boxes whose payload starts with a 4-byte version/flags field. */
const FULL_BOXES = new Set(['meta']);

/**
 * Walks an ISO-BMFF box path and returns the payload offset of the final box.
 * Returns undefined when any segment of the path is missing or malformed.
 */
function findBox(
  b: Uint8Array,
  path: readonly string[],
  start: number,
  end: number,
): number | undefined {
  const [target, ...rest] = path;
  if (target === undefined) return start;

  let offset = start;
  while (offset + 8 <= end) {
    let size = u32be(b, offset);
    const type = ascii(b, offset + 4, 4);
    let headerSize = 8;

    if (size === 1) {
      // 64-bit extended size. We only care about the low word; images this
      // large are rejected by validation long before we get here.
      if (offset + 16 > end) return undefined;
      size = u32be(b, offset + 12);
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset; // Box runs to the end of the container.
    }
    if (size < headerSize || offset + size > end) return undefined;

    if (type === target) {
      const payload = offset + headerSize + (FULL_BOXES.has(type) ? 4 : 0);
      return rest.length === 0 ? payload : findBox(b, rest, payload, offset + size);
    }
    offset += size;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// TIFF
// ---------------------------------------------------------------------------

const isTiff = (b: Uint8Array) =>
  (startsWith(b, [0x49, 0x49, 0x2a, 0x00]) || startsWith(b, [0x4d, 0x4d, 0x00, 0x2a])) &&
  b.length >= 8;

function readTiff(b: Uint8Array) {
  const little = b[0] === 0x49;
  const u16 = (i: number) => (little ? u16le(b, i) : u16be(b, i));
  const u32 = (i: number) => (little ? u32le(b, i) : u32be(b, i));

  const ifd = u32(4);
  let width = 0;
  let height = 0;

  if (ifd + 2 <= b.length) {
    const entries = u16(ifd);
    for (let i = 0; i < entries; i++) {
      const entry = ifd + 2 + i * 12;
      if (entry + 12 > b.length) break;
      const tag = u16(entry);
      const type = u16(entry + 2);
      // Tag values are SHORT (3) or LONG (4); both fit inline in the value field.
      const value = type === 3 ? u16(entry + 8) : u32(entry + 8);
      if (tag === 0x0100) width = value;
      else if (tag === 0x0101) height = value;
      if (width && height) break;
    }
  }
  return { format: 'tiff' as const, width, height };
}

// ---------------------------------------------------------------------------
// BMP / ICO / SVG
// ---------------------------------------------------------------------------

const isBmp = (b: Uint8Array) => startsWith(b, [0x42, 0x4d]);

function readBmp(b: Uint8Array) {
  return {
    format: 'bmp' as const,
    width: b.length >= 26 ? u32le(b, 18) : 0,
    height: b.length >= 26 ? Math.abs(u32le(b, 22) | 0) : 0,
  };
}

const isIco = (b: Uint8Array) => startsWith(b, [0x00, 0x00, 0x01, 0x00]);

function readIco(b: Uint8Array) {
  // A zero in the width/height byte means 256.
  const w = b[6] ?? 0;
  const h = b[7] ?? 0;
  return { format: 'ico' as const, width: w === 0 ? 256 : w, height: h === 0 ? 256 : h };
}

function isSvg(b: Uint8Array): boolean {
  const head = ascii(b, 0, Math.min(1024, b.length)).trimStart().toLowerCase();
  return head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'));
}

function readSvg(b: Uint8Array) {
  const head = ascii(b, 0, Math.min(2048, b.length));
  const width = parseSvgLength(head, 'width');
  const height = parseSvgLength(head, 'height');
  if (width && height) return { format: 'svg' as const, width, height, hasAlpha: true };

  const viewBox = /viewBox\s*=\s*["']\s*[-\d.eE]+[\s,]+[-\d.eE]+[\s,]+([\d.eE]+)[\s,]+([\d.eE]+)/.exec(
    head,
  );
  return {
    format: 'svg' as const,
    width: viewBox ? Math.round(Number(viewBox[1])) || 0 : 0,
    height: viewBox ? Math.round(Number(viewBox[2])) || 0 : 0,
    hasAlpha: true,
  };
}

function parseSvgLength(head: string, attr: string): number {
  const match = new RegExp(`\\b${attr}\\s*=\\s*["']\\s*([\\d.]+)\\s*(px)?\\s*["']`).exec(head);
  return match ? Math.round(Number(match[1])) || 0 : 0;
}
