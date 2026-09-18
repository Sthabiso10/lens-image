#!/usr/bin/env node
/**
 * Builds every brand asset from the two source exports.
 *
 *   node scripts/build-brand.mjs
 *
 * ### Why this is a script and not a folder of hand-exported files
 *
 * The same reason the docs hero is generated: a project whose whole claim is
 * that it optimizes images should not ship hand-dragged screenshots. Every
 * raster below is produced here, and the resize-and-encode half runs through
 * Lens itself.
 *
 * ### What the sources need fixing for
 *
 * They are opaque raster exports of a mark on a dark canvas, not vectors, so
 * three things are handled here rather than assumed:
 *
 * 1. **The mark is not square and sits close to the edges.** It is padded onto
 *    a square rather than cropped, so nothing is clipped and app-icon corner
 *    rounding has room.
 *
 * 2. **The background is a vertical gradient, and it differs per source.** It
 *    is sampled at build time rather than hardcoded. It was hardcoded once, the
 *    artwork was replaced, and every social card grew a visible rectangle where
 *    the old constants no longer matched.
 *
 * 3. **Transparency has to be recovered.** The mark is thresholded off its
 *    background, at the output's resolution rather than the source's, which is
 *    what keeps the matte one pixel wide instead of a soft halo.
 *
 * Compositing is sharp's job and the resize-and-encode ladder is Lens's. Both
 * are used for what they are actually for.
 *
 * ### One caveat
 *
 * The sources are small, so the larger outputs are upscales. A flat geometric
 * mark survives that far better than a photograph would, but a vector export
 * would sharpen every size above about 200px and make the cutout unnecessary.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';
import { ImageOptimizer, formatBytes } from '@lens-image/core';
import { LocalAdapter } from '@lens-image/adapter-local';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SOURCE_ICON = join(root, 'docs/media/source/icon-source.png');
const SOURCE_LOGO = join(root, 'docs/media/source/logo-source.png');

const mediaDir = join(root, 'docs/media');
const publicBrand = join(root, 'packages/docs/public/brand');
const appDir = join(root, 'packages/docs/app');

/**
 * Reads a source's own background gradient, top and bottom.
 *
 * These were hardcoded constants until the artwork was replaced and the numbers
 * silently stopped matching, which put a visible rectangle around the logo on
 * every social card. Measuring the source means the next swap needs no edit
 * here, and the two sources are allowed to differ from each other.
 *
 * The median of a row is used rather than a corner pixel, so a stray pixel or a
 * mark that reaches an edge cannot skew it.
 */
async function sampleCanvas(sourcePath) {
  const { data, info } = await sharp(sourcePath)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;

  const medianOfRow = (y) => {
    const reds = [];
    const greens = [];
    const blues = [];
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      reds.push(data[i]);
      greens.push(data[i + 1]);
      blues.push(data[i + 2]);
    }
    const mid = (values) => values.sort((a, b) => a - b)[values.length >> 1];
    return { r: mid(reds), g: mid(greens), b: mid(blues) };
  };

  return { top: medianOfRow(0), bottom: medianOfRow(height - 1) };
}

/**
 * A canvas whose gradient lines up with the artwork that will sit on it.
 *
 * The naive version, a gradient spanning the whole canvas, leaves a visible
 * rectangle: the source's own gradient is compressed into the inset box, so at
 * any given row the two differ by a few levels and the edge of the composited
 * image reads as a seam.
 *
 * Passing where the artwork lands lets the ramp be built so that `artTop` is
 * exactly the source's top colour and `artTop + artHeight` is exactly its
 * bottom one. Rows outside that span continue the same slope, clamped, so the
 * join is invisible at any size.
 */
async function canvas(stops, width, height, artTop = 0, artHeight = height) {
  const column = Buffer.alloc(height * 4);

  for (let y = 0; y < height; y++) {
    const t = Math.max(0, Math.min(1, (y - artTop) / Math.max(1, artHeight)));
    column[y * 4 + 0] = Math.round(stops.top.r + (stops.bottom.r - stops.top.r) * t);
    column[y * 4 + 1] = Math.round(stops.top.g + (stops.bottom.g - stops.top.g) * t);
    column[y * 4 + 2] = Math.round(stops.top.b + (stops.bottom.b - stops.top.b) * t);
    column[y * 4 + 3] = 255;
  }

  return sharp(column, { raw: { width: 1, height, channels: 4 } })
    .resize(width, height, { fit: 'fill' })
    .png()
    .toBuffer();
}

/**
 * Lifts the mark off its background, producing straight alpha.
 *
 * The sources are opaque exports, so an icon with a visible dark tile is all
 * you can get from them directly. The mark separates cleanly though: measured
 * on the source, 58% of pixels sit exactly at the background level and 33% sit
 * ten or more levels above it, with almost nothing in between. That gap is
 * what makes a threshold safe rather than destructive.
 *
 * The background is sampled per row from the outer columns rather than assumed,
 * so any horizontal variation is handled too. Alpha ramps across the narrow
 * band between the two thresholds, which is where the anti-aliased edges and
 * the glow around the teal live, and the original RGB is kept untouched so the
 * mark's own gradient survives.
 */
async function cutout(sourcePath, lowerThreshold = 2, upperThreshold = 8) {
  const { data, info } = await sharp(sourcePath)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const luminance = (i) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];

  const out = Buffer.alloc(width * height * 4);
  const EDGE = 6;

  for (let y = 0; y < height; y++) {
    // Median of the outer columns: robust to a stray bright pixel in a way a
    // mean is not.
    const edges = [];
    for (let x = 0; x < EDGE; x++) edges.push(luminance((y * width + x) * channels));
    for (let x = width - EDGE; x < width; x++) edges.push(luminance((y * width + x) * channels));
    edges.sort((a, b) => a - b);
    const background = edges[edges.length >> 1];

    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const o = (y * width + x) * 4;

      const delta = luminance(i) - background;
      const t = Math.max(
        0,
        Math.min(1, (delta - lowerThreshold) / (upperThreshold - lowerThreshold)),
      );

      out[o] = data[i];
      out[o + 1] = data[i + 1];
      out[o + 2] = data[i + 2];
      // smoothstep, so the edge ramp has no visible banding.
      out[o + 3] = Math.round(t * t * (3 - 2 * t) * 255);
    }
  }

  smoothAlpha(out, width, height);

  return sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

/**
 * Blurs the alpha channel only, in place.
 *
 * Where the outer ring fades toward the background, the source's own dithering
 * puts neighbouring pixels either side of the threshold, and the cut-out edge
 * breaks up into speckle. Softening alpha turns that back into the smooth fade
 * the artwork intended. RGB is left alone, so no colour is touched: this is a
 * matte repair, not a blur of the mark.
 *
 * Separable 1-2-1 kernel. One pass, because it now runs at the *output*
 * resolution rather than the source's: two passes there widened the matte
 * enough to read as a halo once composited on white.
 */
function smoothAlpha(rgba, width, height, passes = 1) {
  const alphaAt = (x, y) => rgba[(y * width + x) * 4 + 3];
  const scratch = new Uint8Array(width * height);

  for (let pass = 0; pass < passes; pass++) {
    // Horizontal.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const left = alphaAt(Math.max(0, x - 1), y);
        const right = alphaAt(Math.min(width - 1, x + 1), y);
        scratch[y * width + x] = (left + 2 * alphaAt(x, y) + right) >> 2;
      }
    }
    for (let i = 0; i < scratch.length; i++) rgba[i * 4 + 3] = scratch[i];

    // Vertical.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const up = alphaAt(x, Math.max(0, y - 1));
        const down = alphaAt(x, Math.min(height - 1, y + 1));
        scratch[y * width + x] = (up + 2 * alphaAt(x, y) + down) >> 2;
      }
    }
    for (let i = 0; i < scratch.length; i++) rgba[i * 4 + 3] = scratch[i];
  }
}

/**
 * Centres a cut-out mark on a transparent square.
 *
 * The inset is small on purpose. A safe area exists so a platform's corner
 * rounding does not clip an opaque tile, and a transparent mark has no tile to
 * clip: padding it just renders the mark smaller than the 16px the tab strip
 * gave it. The source already carries a few percent of its own margin, so 2%
 * here lands the mark very close to the edge without touching it.
 */
async function transparentSquare(sourcePath, size, inset = 0.02) {
  const { width, height } = await sharp(sourcePath).metadata();

  const box = Math.round(size * (1 - inset * 2));
  const scale = Math.min(box / width, box / height);
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);

  /*
   * Resize first, cut out second.
   *
   * The other order looks equivalent and is not. Cutting out at the source's
   * 108px gives a one-pixel alpha ramp, and enlarging that to 512 stretches it
   * to nine, which composites as a soft grey halo on any light surface.
   * Thresholding after the resize instead reads a smooth, wide gradient and
   * still emits a tight one-pixel matte, because the threshold is applied at
   * the output's own resolution.
   *
   * Lanczos on the opaque source keeps the edge contrast high enough for that
   * threshold to land in the same place the artwork's edge actually is.
   */
  const enlarged = await sharp(sourcePath)
    .resize(w, h, { kernel: 'lanczos3' })
    .png()
    .toBuffer();

  const resized = await cutout(enlarged);

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: resized, left: Math.round((size - w) / 2), top: Math.round((size - h) / 2) },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * A multi-resolution .ico.
 *
 * The format is a small directory followed by embedded PNGs, so this needs no
 * encoder beyond the one already producing them. Worth having because Windows
 * taskbar pins and a few older browsers still ask for `/favicon.ico` by name
 * and ignore the PNG link.
 */
function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(pngs.length, 4);

  let offset = 6 + pngs.length * 16;
  const entries = [];

  for (const { size, data } of pngs) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette size
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.byteLength, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.byteLength;
  }

  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

/**
 * Centres artwork on a square canvas, leaving a safe margin.
 *
 * @param inset Fraction of the square left empty around the art. 0.12 keeps the
 *   mark clear of the corner rounding every platform applies to app icons.
 */
async function squareMaster(sourcePath, size, inset = 0.12) {
  const art = sharp(sourcePath);
  const { width, height } = await art.metadata();

  const box = Math.round(size * (1 - inset * 2));
  const scale = Math.min(box / width, box / height);
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);

  const resized = await sharp(sourcePath)
    .resize(w, h, { kernel: 'lanczos3' })
    .png()
    .toBuffer();

  const top = Math.round((size - h) / 2);
  const stops = await sampleCanvas(sourcePath);

  return sharp(await canvas(stops, size, size, top, h))
    .composite([{ input: resized, left: Math.round((size - w) / 2), top }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * Rounds the corners of an opaque raster.
 *
 * The logo keeps its dark card, because the wordmark is white and would vanish
 * against GitHub's light theme without one. A hard-cornered dark rectangle
 * dropped into a light README reads as a screenshot rather than a mark, so the
 * card gets the same corner radius an app icon would.
 *
 * The radius is a fraction of the short side rather than a constant, so it
 * survives the source being re-exported at another size.
 */
async function roundCorners(input, fraction = 0.104) {
  const { width, height } = await sharp(input).metadata();
  const r = Math.round(Math.min(width, height) * fraction);

  const mask = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="${width}" height="${height}" rx="${r}" ry="${r}" fill="#fff"/>` +
      `</svg>`,
  );

  // `dest-in` keeps the card's own pixels and takes alpha from the mask, so the
  // corners are cut rather than painted over with a guessed background colour.
  return sharp(input)
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Centres the horizontal logo on a canvas of a given aspect, for social cards. */
async function socialCard(sourcePath, width, height, occupancy = 0.62) {
  const { width: lw, height: lh } = await sharp(sourcePath).metadata();

  const scale = Math.min((width * occupancy) / lw, (height * occupancy) / lh);
  const w = Math.round(lw * scale);
  const h = Math.round(lh * scale);

  const resized = await sharp(sourcePath).resize(w, h, { kernel: 'lanczos3' }).png().toBuffer();

  const top = Math.round((height - h) / 2);
  const stops = await sampleCanvas(sourcePath);

  return sharp(await canvas(stops, width, height, top, h))
    .composite([{ input: resized, left: Math.round((width - w) / 2), top }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  await mkdir(mediaDir, { recursive: true });
  await rm(publicBrand, { recursive: true, force: true });
  await mkdir(publicBrand, { recursive: true });

  const written = [];
  const record = async (path, buffer) => {
    await writeFile(path, buffer);
    written.push([path.replace(root, '.').split('\\').join('/'), buffer.byteLength]);
  };

  // --- Masters -------------------------------------------------------------
  // 1024 is the largest anything asks for (App Store, GitHub org avatar), and
  // everything smaller is derived from it rather than from the 203px source.
  //
  // Transparent, so the favicon is the mark rather than a dark tile sitting in
  // the tab strip. Every icon below inherits that.
  const iconMaster = await transparentSquare(SOURCE_ICON, 1024, 0.06);
  await record(join(mediaDir, 'icon.png'), iconMaster);

  const logoSource = await readFile(SOURCE_LOGO);

  // Rounded once here, then used for every logo output, so the README, the npm
  // package pages and the site header all show the same shape.
  const logoMaster = await roundCorners(logoSource);
  await record(join(mediaDir, 'logo.png'), logoMaster);

  await record(join(mediaDir, 'social-preview.png'), await socialCard(SOURCE_LOGO, 1280, 640));

  // --- The size ladder, through Lens --------------------------------------
  // This is the part Lens is for: one source, a set of widths, real encoding.
  const optimizer = new ImageOptimizer({
    adapter: new LocalAdapter({ root: publicBrand, baseUrl: '/brand' }),
    formats: ['png'],
    quality: 90,
    key: '{name}-{width}.{ext}',
  });

  const iconLadder = await optimizer.optimize({
    source: { data: iconMaster, filename: 'icon.png' },
    sizes: [512, 192, 180, 128, 64, 48, 32, 16].map((width) => ({ width, height: width })),
  });

  for (const variant of iconLadder.variants) {
    written.push([`./packages/docs/public/brand/${variant.key}`, variant.size]);
  }

  // The header and footer render the mark small; one file covers both at 2x.
  const logoLadder = await optimizer.optimize({
    source: { data: logoMaster, filename: 'logo.png' },
    sizes: [{ width: 478 }, { width: 240 }],
  });
  for (const variant of logoLadder.variants) {
    written.push([`./packages/docs/public/brand/${variant.key}`, variant.size]);
  }

  // --- Next.js file conventions -------------------------------------------
  // app/icon.png, app/apple-icon.png and app/favicon.ico are picked up
  // automatically, so none of them need a <link> tag.
  await record(join(appDir, 'icon.png'), await transparentSquare(SOURCE_ICON, 512));

  // The touch icon stays opaque on purpose. iOS composites a home-screen icon
  // onto black rather than honouring alpha, so a transparent one would render
  // as the mark on a hard black square with no control over the edge. Recall
  // ships an opaque one for the same reason.
  await record(join(appDir, 'apple-icon.png'), await squareMaster(SOURCE_ICON, 180, 0.1));

  const icoSizes = [16, 32, 48];
  const icoPngs = await Promise.all(
    icoSizes.map(async (size) => ({ size, data: await transparentSquare(SOURCE_ICON, size) })),
  );
  await record(join(appDir, 'favicon.ico'), buildIco(icoPngs));
  await record(join(appDir, 'opengraph-image.png'), await socialCard(SOURCE_LOGO, 1200, 630));
  await record(join(appDir, 'twitter-image.png'), await socialCard(SOURCE_LOGO, 1200, 630));

  // --- Report --------------------------------------------------------------
  const total = written.reduce((sum, [, bytes]) => sum + bytes, 0);
  for (const [path, bytes] of written) {
    console.log(`  ${formatBytes(bytes).padStart(10)}  ${path}`);
  }
  console.log(`\n  ${written.length} files, ${formatBytes(total)} total`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
