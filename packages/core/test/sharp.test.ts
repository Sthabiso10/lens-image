/**
 * Integration tests against the real sharp engine.
 *
 * Every other test in this suite uses a fake engine, which keeps them fast and
 * deterministic but proves nothing about the encoder-options mapping. The part
 * most likely to be wrong, because it is the only place we hand strings to
 * someone else's API and hope they mean what we think.
 *
 * These skip themselves when sharp is not installed, so CI on a platform
 * without a prebuilt binary stays green rather than lying about coverage.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MemoryAdapter } from '../src/adapters/memory.js';
import { createSharpEngine } from '../src/engines/sharp.js';
import { LensError } from '../src/errors.js';
import { ImageOptimizer } from '../src/optimizer.js';
import { sniff } from '../src/sniff.js';

const engine = createSharpEngine();

/** True when sharp can be imported and encode at all. */
const available = await Promise.resolve(engine.supports('webp')).catch(() => false);
const skip = available ? false : 'sharp is not installed';

/** A real PNG, encoded by sharp itself so the fixture needs no binary in git. */
async function makeSource(width = 400, height = 300): Promise<Uint8Array> {
  const sharp = (await import('sharp')).default;
  return sharp({
    create: { width, height, channels: 3, background: { r: 210, g: 120, b: 60 } },
  })
    .png()
    .toBuffer();
}

describe('sharp engine (integration)', { skip }, () => {
  it('is the engine auto-detection picks, not passthrough', async () => {
    /*
     * Regression guard.
     *
     * `loadSharp` used to try only a dynamic `import()`. sharp's ESM entry
     * resolves `detect-libc` in a way some Node versions reject, so on a
     * perfectly good installation the import threw, `supports()` swallowed it,
     * detection quietly chose the passthrough engine, and the user was told to
     * install a package they already had. It now falls back to `require`.
     *
     * If this ever returns "passthrough" while sharp is installed, that whole
     * failure is back.
     */
    const { detectEngine, resetEngineDetection } = await import('../src/engines/index.js');
    resetEngineDetection();

    const detected = await detectEngine();
    assert.equal(detected.name, 'sharp', 'sharp is installed, so detection must find it');
  });

  it('reports what this build can actually encode', async () => {
    // Recorded rather than asserted: which codecs exist depends on how libvips
    // was built, and the point is that Lens asks instead of assuming.
    const support = Object.fromEntries(
      await Promise.all(
        (['jpeg', 'png', 'webp', 'avif', 'gif', 'tiff'] as const).map(
          async (f) => [f, await engine.supports(f)] as const,
        ),
      ),
    );
    console.log('      codecs:', support);

    assert.equal(support.jpeg, true, 'jpeg is always available');
    assert.equal(support.png, true, 'png is always available');
    assert.equal(support.webp, true, 'webp is always available');
  });

  it('detects AVIF support through the heif entry', async () => {
    // Regression test. sharp has no `format.avif` key - AVIF is HEIF with AV1 -
    // so a literal name check reports false on a build that encodes it fine,
    // and every AVIF request silently degrades to JPEG.
    const sharp = (await import('sharp')).default;

    // The cast is the point: `avif` is not even in sharp's own `FormatEnum`,
    // which is the type-level echo of the runtime gap this test guards.
    const formats = sharp.format as unknown as Record<string, { output?: unknown }>;
    assert.equal(formats.avif, undefined, 'sharp still has no avif key');

    let canReallyEncode = true;
    try {
      await sharp(await makeSource(32, 32)).toFormat('avif', { quality: 50 }).toBuffer();
    } catch {
      canReallyEncode = false;
    }

    assert.equal(
      await engine.supports('avif'),
      canReallyEncode,
      'supports() must agree with what a real encode does',
    );
  });

  it('probes real dimensions and alpha', async () => {
    const meta = await engine.probe(await makeSource(400, 300));

    assert.equal(meta.format, 'png');
    assert.equal(meta.width, 400);
    assert.equal(meta.height, 300);
    assert.equal(meta.isAnimated, false);
  });

  it('resizes and re-encodes to webp', async () => {
    const encoded = await engine.transform(await makeSource(400, 300), {
      resize: { width: 200, fit: 'cover', withoutEnlargement: true },
      format: 'webp',
      quality: 80,
      preserveMetadata: false,
      autoOrient: true,
    });

    assert.equal(encoded.format, 'webp');
    assert.equal(encoded.width, 200);
    assert.equal(encoded.height, 150, 'aspect ratio preserved');

    // The bytes must really be WebP, not a PNG that was passed through.
    assert.equal(sniff(encoded.data).format, 'webp');
    assert.equal(sniff(encoded.data).width, 200);
  });

  it('honours withoutEnlargement', async () => {
    const encoded = await engine.transform(await makeSource(100, 100), {
      resize: { width: 500, withoutEnlargement: true },
      format: 'png',
      quality: 80,
      preserveMetadata: false,
      autoOrient: true,
    });

    assert.equal(encoded.width, 100, 'clamped to the source width, not upscaled');
  });

  it('produces each format with a valid container', async () => {
    const source = await makeSource(120, 90);

    for (const format of ['jpeg', 'png', 'webp'] as const) {
      const encoded = await engine.transform(source, {
        format,
        quality: 75,
        preserveMetadata: false,
        autoOrient: true,
      });

      assert.equal(encoded.format, format);
      assert.equal(
        sniff(encoded.data).format,
        format,
        `${format} output must actually be ${format}`,
      );
      assert.ok(encoded.size > 0);
    }
  });

  it('quality changes the output size for a lossy format', async () => {
    const source = await makeSource(600, 400);
    const base = {
      format: 'jpeg' as const,
      preserveMetadata: false,
      autoOrient: true,
    };

    const low = await engine.transform(source, { ...base, quality: 30 });
    const high = await engine.transform(source, { ...base, quality: 95 });

    assert.ok(
      low.size < high.size,
      `q30 (${low.size}B) should be smaller than q95 (${high.size}B)`,
    );
  });

  it('strips metadata by default and keeps it on request', async () => {
    const sharp = (await import('sharp')).default;
    const withExif = await sharp({
      create: { width: 80, height: 60, channels: 3, background: '#888' },
    })
      .withMetadata({ exif: { IFD0: { Copyright: 'Lens test' } } })
      .jpeg()
      .toBuffer();

    const base = { format: 'jpeg' as const, quality: 80, autoOrient: true };

    const stripped = await engine.transform(withExif, { ...base, preserveMetadata: false });
    const kept = await engine.transform(withExif, { ...base, preserveMetadata: true });

    const has = (bytes: Uint8Array) => Buffer.from(bytes).includes('Lens test');

    assert.equal(has(stripped.data), false, 'EXIF is dropped by default');
    assert.equal(has(kept.data), true, 'and kept when asked for');
  });

  it('wraps an encoder failure as ENCODE_FAILED', async () => {
    await assert.rejects(
      engine.transform(new Uint8Array([1, 2, 3, 4]), {
        format: 'webp',
        quality: 80,
        preserveMetadata: false,
        autoOrient: true,
      }),
      (error: unknown) => {
        assert.ok(LensError.is(error));
        assert.ok(
          error.code === 'ENCODE_FAILED' || error.code === 'UNSUPPORTED_INPUT',
          `unexpected code ${(error as LensError).code}`,
        );
        return true;
      },
    );
  });

  it('runs a full optimize end to end', async () => {
    const adapter = new MemoryAdapter();
    const optimizer = new ImageOptimizer({ engine, adapter, quality: 80 });

    const result = await optimizer.optimize({
      source: { data: await makeSource(1200, 900), filename: 'photo.png' },
      formats: ['webp', 'jpg'],
      sizes: [{ width: 600 }, { width: 300 }],
      thumbnail: true,
    });

    assert.equal(result.engine, 'sharp');
    assert.equal(result.variants.length, 5, '2 formats x 2 sizes + 1 thumbnail');
    assert.equal(adapter.size, 5);

    // Every stored object must be a real image of the format it claims.
    for (const variant of result.variants) {
      const stored = adapter.get(variant.key);
      assert.ok(stored, `${variant.key} was stored`);
      assert.equal(sniff(stored.data).format, variant.format);
      assert.equal(sniff(stored.data).width, variant.width);
    }

    assert.ok(result.formats.webp!.srcset.includes('600w'));
    assert.deepEqual(result.warnings, [], 'no degradation on a normal run');
  });

  it('really is smaller than the source', async () => {
    const adapter = new MemoryAdapter();
    const optimizer = new ImageOptimizer({ engine, adapter });

    // A photographic gradient rather than flat colour, so PNG has something to
    // lose and the comparison means something.
    const sharp = (await import('sharp')).default;
    const noise = await sharp({
      create: {
        width: 1000,
        height: 750,
        channels: 3,
        background: '#808080',
        noise: { type: 'gaussian', mean: 128, sigma: 30 },
      },
    })
      .png()
      .toBuffer();

    const result = await optimizer.optimize({
      source: { data: noise, filename: 'noisy.png' },
      formats: ['webp'],
      sizes: [{ width: 800 }],
      quality: 70,
    });

    assert.ok(result.savings > 0, `expected savings, got ${result.savings}`);
    console.log(
      `      ${noise.byteLength}B png -> ${result.variants[0]!.size}B webp ` +
        `(${Math.round(result.savings * 100)}% smaller)`,
    );
  });
});
