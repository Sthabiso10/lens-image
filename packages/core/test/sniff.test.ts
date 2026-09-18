import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extensionFor, mimeTypeFor, sniff, sniffFormat } from '../src/sniff.js';
import {
  avifFixture,
  garbageFixture,
  gifFixture,
  jpegFixture,
  pngFixture,
  svgFixture,
  tiffFixture,
  webpExtendedFixture,
  webpFixture,
} from './fixtures.js';

describe('sniff', () => {
  it('reads PNG dimensions from IHDR', () => {
    const meta = sniff(pngFixture(1920, 1080));
    assert.equal(meta.format, 'png');
    assert.equal(meta.width, 1920);
    assert.equal(meta.height, 1080);
  });

  it('detects PNG alpha from the colour type', () => {
    assert.equal(sniff(pngFixture(10, 10, 6)).hasAlpha, true, 'truecolour + alpha');
    assert.equal(sniff(pngFixture(10, 10, 4)).hasAlpha, true, 'greyscale + alpha');
    assert.equal(sniff(pngFixture(10, 10, 2)).hasAlpha, false, 'truecolour, no alpha');
  });

  it('reads JPEG dimensions from the SOF0 marker', () => {
    const meta = sniff(jpegFixture(4032, 3024));
    assert.equal(meta.format, 'jpeg');
    assert.equal(meta.width, 4032);
    assert.equal(meta.height, 3024);
  });

  it('reads EXIF orientation from the APP1 segment', () => {
    // Orientation 6 is "rotate 90 CW" - the one every phone portrait photo has,
    // and the reason auto-orient exists.
    const meta = sniff(jpegFixture(4032, 3024, 6));
    assert.equal(meta.orientation, 6);
    assert.equal(meta.width, 4032, 'dimensions still parse with EXIF present');
  });

  it('leaves orientation undefined when there is no EXIF segment', () => {
    assert.equal(sniff(jpegFixture(100, 100)).orientation, undefined);
  });

  it('reads GIF dimensions and detects animation', () => {
    const still = sniff(gifFixture(320, 240, 1));
    assert.equal(still.format, 'gif');
    assert.equal(still.width, 320);
    assert.equal(still.isAnimated, false);

    assert.equal(sniff(gifFixture(320, 240, 3)).isAnimated, true);
  });

  it('reads lossy WebP dimensions from the VP8 chunk', () => {
    const meta = sniff(webpFixture(640, 480));
    assert.equal(meta.format, 'webp');
    assert.equal(meta.width, 640);
    assert.equal(meta.height, 480);
  });

  it('reads extended WebP dimensions, which are stored minus one', () => {
    const meta = sniff(webpExtendedFixture(1200, 900, true));
    assert.equal(meta.width, 1200, 'the +1 is applied');
    assert.equal(meta.height, 900);
    assert.equal(meta.isAnimated, true);
    assert.equal(meta.hasAlpha, true);
  });

  it('walks the AVIF box tree to find ispe', () => {
    const meta = sniff(avifFixture(1920, 1080));
    assert.equal(meta.format, 'avif');
    assert.equal(meta.width, 1920);
    assert.equal(meta.height, 1080);
  });

  it('reads TIFF dimensions from IFD tags', () => {
    const meta = sniff(tiffFixture(400, 300));
    assert.equal(meta.format, 'tiff');
    assert.equal(meta.width, 400);
    assert.equal(meta.height, 300);
  });

  it('reads SVG dimensions from attributes', () => {
    const meta = sniff(svgFixture(100, 50));
    assert.equal(meta.format, 'svg');
    assert.equal(meta.width, 100);
    assert.equal(meta.height, 50);
  });

  it('falls back to the SVG viewBox when there are no width/height attributes', () => {
    const svg = new TextEncoder().encode('<svg viewBox="0 0 240 120" xmlns="http://www.w3.org/2000/svg"/>');
    const meta = sniff(svg);
    assert.equal(meta.width, 240);
    assert.equal(meta.height, 120);
  });

  it('reports unknown rather than throwing on garbage', () => {
    const meta = sniff(garbageFixture());
    assert.equal(meta.format, 'unknown');
    assert.equal(meta.width, 0);
  });

  it('does not throw on a truncated header', () => {
    for (const fixture of [pngFixture(), jpegFixture(), webpFixture(), avifFixture()]) {
      for (const length of [0, 1, 4, 8, 12, 16]) {
        assert.doesNotThrow(() => sniff(fixture.slice(0, length)), `truncated to ${length} bytes`);
      }
    }
  });

  it('reports the real byte length, not the header length', () => {
    const bytes = pngFixture();
    assert.equal(sniff(bytes, 5_000_000).size, 5_000_000);
  });

  it('maps formats to MIME types and extensions', () => {
    assert.equal(mimeTypeFor('jpeg'), 'image/jpeg');
    assert.equal(mimeTypeFor('avif'), 'image/avif');
    assert.equal(mimeTypeFor('unknown'), 'application/octet-stream');

    // The canonical name is `jpeg`, but nobody wants a `.jpeg` file on disk.
    assert.equal(extensionFor('jpeg'), 'jpg');
    assert.equal(extensionFor('webp'), 'webp');
    assert.equal(extensionFor('tiff'), 'tif');
  });

  it('sniffFormat is a shorthand for the format field', () => {
    assert.equal(sniffFormat(webpFixture()), 'webp');
  });
});
