import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MemoryAdapter } from '../src/adapters/memory.js';
import { LensError } from '../src/errors.js';
import { ImageOptimizer } from '../src/optimizer.js';
import type { LensWarning, StorageAdapter } from '../src/types.js';
import { createFakeEngine, garbageFixture, gifFixture, jpegFixture, pngFixture } from './fixtures.js';

const source = jpegFixture(2000, 1500);

/** An optimizer wired to a fake engine and a fresh memory adapter. */
function setup(options: Parameters<typeof createFakeEngine>[0] = {}) {
  const engine = createFakeEngine({ sourceSize: { width: 2000, height: 1500 }, ...options });
  const adapter = new MemoryAdapter();
  return { engine, adapter, optimizer: new ImageOptimizer({ engine, adapter }) };
}

describe('ImageOptimizer', () => {
  describe('the happy path', () => {
    it('produces every format at every size', async () => {
      const { optimizer, adapter } = setup();

      const result = await optimizer.optimize({
        source,
        formats: ['webp', 'jpg'],
        sizes: [{ width: 1200 }, { width: 600 }, { width: 300 }],
      });

      assert.equal(result.variants.length, 6, '2 formats x 3 sizes');
      assert.equal(adapter.size, 6, 'each one was uploaded');
      assert.deepEqual(Object.keys(result.formats).sort(), ['jpeg', 'webp']);
    });

    it('normalises the jpg alias to jpeg', async () => {
      const { optimizer } = setup();
      const result = await optimizer.optimize({ source, formats: ['jpg'] });

      assert.ok(result.formats.jpeg, 'results are keyed by the canonical name');
      assert.equal((result.formats as Record<string, unknown>).jpg, undefined);
      assert.ok(result.variants[0]!.key.endsWith('.jpg'), 'but the file extension is .jpg');
    });

    it('groups URLs by size label', async () => {
      const { optimizer } = setup();
      const result = await optimizer.optimize({
        source,
        formats: ['webp'],
        sizes: [{ width: 1200 }, { width: 600 }],
      });

      const webp = result.formats.webp!;
      assert.deepEqual(Object.keys(webp.urls).sort(), ['1200w', '600w']);
      assert.ok(webp.urls['600w']!.startsWith('memory://'));
    });

    it('builds a srcset sorted by width', async () => {
      const { optimizer } = setup();
      const result = await optimizer.optimize({
        source,
        formats: ['webp'],
        sizes: [{ width: 1200 }, { width: 300 }, { width: 600 }],
      });

      const widths = result.formats.webp!.srcset.split(', ').map((entry) => entry.split(' ')[1]);
      assert.deepEqual(widths, ['300w', '600w', '1200w'], 'ascending regardless of input order');
    });

    it('reports largest and smallest per format', async () => {
      const { optimizer } = setup();
      const result = await optimizer.optimize({
        source,
        formats: ['webp'],
        sizes: [{ width: 1200 }, { width: 300 }],
      });

      assert.equal(result.formats.webp!.largest.width, 1200);
      assert.equal(result.formats.webp!.smallest.width, 300);
    });

    it('carries metadata on every variant', async () => {
      const { optimizer } = setup();
      const [variant] = (await optimizer.optimize({ source, formats: ['webp'], sizes: [{ width: 600 }] }))
        .variants;

      assert.equal(variant!.format, 'webp');
      assert.equal(variant!.width, 600);
      assert.equal(variant!.height, 450, 'aspect ratio preserved');
      assert.ok(variant!.size > 0);
      assert.match(variant!.checksum, /^[0-9a-f]{64}$/);
      assert.equal(variant!.contentType, 'image/webp');
    });

    it('never upscales past the source width', async () => {
      const { optimizer } = setup();
      const result = await optimizer.optimize({
        source,
        formats: ['webp'],
        sizes: [{ width: 4000 }],
      });

      assert.equal(result.variants[0]!.width, 2000, 'clamped to the intrinsic width');
    });
  });

  describe('thumbnails', () => {
    it('adds a thumbnail separate from the main variants', async () => {
      const { optimizer } = setup();
      const result = await optimizer.optimize({
        source,
        formats: ['webp'],
        sizes: [{ width: 1200 }],
        thumbnail: true,
      });

      assert.ok(result.thumbnail, 'exposed on its own property');
      assert.equal(result.thumbnail!.width, 256, 'defaults to 256px');
      assert.equal(result.formats.webp!.variants.length, 1, 'kept out of the srcset group');
      assert.ok(!result.formats.webp!.srcset.includes('256w'));
    });

    it('accepts an explicit thumbnail spec', async () => {
      const { optimizer } = setup();
      const result = await optimizer.optimize({
        source,
        formats: ['webp'],
        thumbnail: { width: 64, height: 64, format: 'png', label: 'avatar' },
      });

      assert.equal(result.thumbnail!.width, 64);
      assert.equal(result.thumbnail!.format, 'png');
      assert.equal(result.thumbnail!.label, 'avatar');
    });
  });

  describe('graceful degradation', () => {
    it('skips unsupported formats and warns, keeping the rest', async () => {
      const { optimizer } = setup({ supported: ['webp', 'jpeg'] });

      const result = await optimizer.optimize({ source, formats: ['avif', 'webp'] });

      assert.equal(result.variants.length, 1, 'only webp survived');
      assert.equal(result.formats.avif, undefined);
      assert.ok(result.formats.webp);

      const warning = result.warnings.find((w) => w.code === 'format_unsupported');
      assert.ok(warning, 'the skip is reported, not silent');
      assert.equal(warning!.format, 'avif');
    });

    it('keeps working formats when another format throws mid-encode', async () => {
      const { optimizer } = setup({ supported: ['webp', 'jpeg'], failing: ['jpeg'] });

      const result = await optimizer.optimize({ source, formats: ['webp', 'jpg'] });

      assert.ok(result.formats.webp, 'webp still made it');
      assert.equal(result.formats.jpeg, undefined);
      assert.ok(result.warnings.some((w) => w.format === 'jpeg'));
    });

    it('falls back to jpeg when every requested format fails', async () => {
      const { optimizer } = setup({ supported: ['webp', 'jpeg'], failing: ['webp'] });

      const result = await optimizer.optimize({
        source,
        formats: ['webp'],
        sizes: [{ width: 600 }],
      });

      assert.ok(result.formats.jpeg, 'the fallback produced output');
      assert.equal(result.variants[0]!.isFallback, true);
      assert.ok(result.warnings.some((w) => w.code === 'fallback_used'));
    });

    it('does not fall back when fallbackFormat is null', async () => {
      const { optimizer } = setup({ supported: ['webp'], failing: ['webp'] });

      await assert.rejects(
        optimizer.optimize({ source, formats: ['webp'], fallbackFormat: null }),
        (error: unknown) => LensError.is(error, 'ALL_FORMATS_FAILED'),
      );
    });

    it('throws ALL_FORMATS_FAILED when the fallback fails too', async () => {
      const { optimizer } = setup({ supported: ['webp', 'jpeg'], failing: ['webp', 'jpeg'] });

      await assert.rejects(
        optimizer.optimize({ source, formats: ['webp'] }),
        (error: unknown) => LensError.is(error, 'ALL_FORMATS_FAILED'),
      );
    });

    it('surfaces warnings through the onWarning callback as they happen', async () => {
      const seen: LensWarning[] = [];
      const { optimizer } = setup({ supported: ['webp'] });

      await optimizer.optimize({
        source,
        formats: ['avif', 'webp'],
        onWarning: (warning) => seen.push(warning),
      });

      assert.equal(seen.length, 1);
      assert.equal(seen[0]!.code, 'format_unsupported');
    });

    it('leaves animated sources unresized unless sizes are requested', async () => {
      const engine = createFakeEngine({ sourceSize: { width: 320, height: 240 } });
      // Report the GIF as animated so the planner's guard engages.
      const original = engine.probe.bind(engine);
      engine.probe = async (input) => ({ ...(await original(input)), isAnimated: true, format: 'gif' });

      const optimizer = new ImageOptimizer({ engine, adapter: new MemoryAdapter() });
      await optimizer.optimize({ source: gifFixture(320, 240, 3), formats: ['webp'] });

      assert.equal(engine.calls.transforms[0]!.resize, undefined, 'no resize was requested');
    });
  });

  describe('validation', () => {
    it('rejects a file over maxBytes', async () => {
      const { optimizer } = setup();

      await assert.rejects(
        optimizer.optimize({ source, validate: { maxBytes: 10 } }),
        (error: unknown) => {
          assert.ok(LensError.is(error, 'VALIDATION_FAILED'));
          assert.equal(error.status, 422, 'maps to an HTTP status');
          assert.equal(error.details.limit, 10);
          return true;
        },
      );
    });

    it('rejects a format outside the allowlist', async () => {
      const { optimizer } = setup();

      await assert.rejects(
        optimizer.optimize({ source: pngFixture(), validate: { allowedFormats: ['jpeg'] } }),
        (error: unknown) => LensError.is(error, 'VALIDATION_FAILED'),
      );
    });

    it('rejects unidentifiable bytes', async () => {
      const engine = createFakeEngine();
      engine.probe = async () => {
        throw new Error('no decoder');
      };
      const optimizer = new ImageOptimizer({ engine, adapter: new MemoryAdapter() });

      await assert.rejects(
        optimizer.optimize({ source: garbageFixture() }),
        (error: unknown) => LensError.is(error, 'UNSUPPORTED_INPUT'),
      );
    });

    it('rejects a decompression bomb on pixel count', async () => {
      const { optimizer } = setup({ sourceSize: { width: 40_000, height: 40_000 } });

      await assert.rejects(
        optimizer.optimize({ source, validate: { maxPixels: 100_000_000 } }),
        (error: unknown) => {
          assert.ok(LensError.is(error, 'VALIDATION_FAILED'));
          assert.match(error.message, /decompression bombs/);
          return true;
        },
      );
    });

    it('can be disabled entirely', async () => {
      const { optimizer } = setup();
      const result = await optimizer.optimize({ source, validate: false, formats: ['webp'] });
      assert.equal(result.variants.length, 1);
    });
  });

  describe('option validation', () => {
    it('rejects an out-of-range quality at construction time', () => {
      assert.throws(
        () => new ImageOptimizer({ quality: 150 }),
        (error: unknown) => LensError.is(error, 'INVALID_OPTIONS'),
      );
    });

    it('rejects an unknown format name with a helpful message', () => {
      assert.throws(
        () => new ImageOptimizer({ formats: ['jpeg2000' as 'jpeg'] }),
        (error: unknown) => {
          assert.ok(LensError.is(error, 'INVALID_OPTIONS'));
          assert.match(error.message, /Supported: jpeg, png, webp/);
          return true;
        },
      );
    });

    it('rejects a negative size', () => {
      assert.throws(
        () => new ImageOptimizer({ sizes: [{ width: -100 }] }),
        (error: unknown) => LensError.is(error, 'INVALID_OPTIONS'),
      );
    });

    it('applies the same checks to per-call options', async () => {
      const { optimizer } = setup();

      await assert.rejects(
        optimizer.optimize({ source, sizes: [{ width: -100 }] }),
        (error: unknown) => LensError.is(error, 'INVALID_OPTIONS'),
        'a bad option is a bad option wherever it is passed',
      );
    });

    it('refuses two sizes that would collide on the same key', async () => {
      const { optimizer } = setup();

      await assert.rejects(
        optimizer.optimize({
          source,
          formats: ['webp'],
          // Both label as "600w", so the second would overwrite the first.
          sizes: [{ width: 600 }, { width: 600, quality: 60 }],
        }),
        (error: unknown) => {
          assert.ok(LensError.is(error, 'INVALID_OPTIONS'));
          assert.match(error.message, /both produce the label "600w"/);
          return true;
        },
      );
    });

    it('allows a collision that an explicit label resolves', async () => {
      const { optimizer } = setup();
      const result = await optimizer.optimize({
        source,
        formats: ['webp'],
        sizes: [{ width: 600 }, { width: 600, quality: 60, label: '600w-low' }],
      });

      assert.deepEqual(Object.keys(result.formats.webp!.urls).sort(), ['600w', '600w-low']);
    });
  });

  describe('keys and naming', () => {
    it('uses a content-addressed default template', async () => {
      const { optimizer } = setup();
      const result = await optimizer.optimize({
        source: { data: source, filename: 'My Photo (2).JPG' },
        formats: ['webp'],
        sizes: [{ width: 600 }],
      });

      // The extension is dropped before slugifying, so "(2).JPG" becomes "-2".
      assert.match(result.variants[0]!.key, /^[0-9a-f]{10}\/my-photo-2-600w\.webp$/);
    });

    it('applies a custom template', async () => {
      const { optimizer } = setup();
      const result = await optimizer.optimize({
        source,
        formats: ['webp'],
        sizes: [{ width: 600 }],
        key: '{format}/{width}x{height}.{ext}',
      });

      assert.equal(result.variants[0]!.key, 'webp/600x450.webp');
    });

    it('applies a key function', async () => {
      const { optimizer } = setup();
      const result = await optimizer.optimize({
        source,
        formats: ['webp'],
        sizes: [{ width: 600 }],
        key: (ctx) => `custom/${ctx.label}.${ctx.ext}`,
      });

      assert.equal(result.variants[0]!.key, 'custom/600w.webp');
    });

    it('prepends the prefix', async () => {
      const { optimizer } = setup();
      const result = await optimizer.optimize({
        source,
        formats: ['webp'],
        prefix: '/tenants/acme/',
        key: 'image.{ext}',
      });

      assert.equal(result.variants[0]!.key, 'tenants/acme/image.webp', 'slashes normalised');
    });

    it('rejects an unknown template token instead of writing "undefined"', async () => {
      const { optimizer } = setup();

      await assert.rejects(
        optimizer.optimize({ source, formats: ['webp'], key: '{nope}.{ext}' }),
        (error: unknown) => LensError.is(error, 'ALL_FORMATS_FAILED'),
        'the encode fails and surfaces as a total failure',
      );
    });
  });

  describe('storage', () => {
    it('retries a transient upload failure', async () => {
      const engine = createFakeEngine();
      const adapter = new MemoryAdapter({ failAttempts: 2 });
      const optimizer = new ImageOptimizer({
        engine,
        adapter,
        retry: { attempts: 3, baseDelayMs: 1 },
      });

      const result = await optimizer.optimize({ source, formats: ['webp'] });

      assert.equal(result.variants.length, 1, 'succeeded on the third attempt');
      assert.equal(adapter.size, 1);
    });

    it('gives up after the attempt budget and reports the adapter', async () => {
      const engine = createFakeEngine();
      const adapter = new MemoryAdapter({ failAttempts: 10 });
      const optimizer = new ImageOptimizer({
        engine,
        adapter,
        retry: { attempts: 2, baseDelayMs: 1 },
      });

      await assert.rejects(
        optimizer.optimize({ source, formats: ['webp'], fallbackFormat: null }),
        (error: unknown) => {
          assert.ok(LensError.is(error, 'ALL_FORMATS_FAILED'));
          return true;
        },
      );
    });

    it('runs without an adapter and returns bytes instead of URLs', async () => {
      const engine = createFakeEngine();
      const optimizer = new ImageOptimizer({ engine });

      const result = await optimizer.optimize({ source, formats: ['webp'], sizes: [{ width: 600 }] });

      assert.equal(result.adapter, null);
      assert.equal(result.variants[0]!.url, '', 'no URL is invented');
      assert.ok(result.variants[0]!.data instanceof Uint8Array, 'bytes come back instead');
      assert.equal(result.formats.webp!.srcset, '', 'and the srcset stays empty');
    });

    it('passes metadata through to the adapter', async () => {
      const { optimizer, adapter } = setup();
      await optimizer.optimize({
        source,
        formats: ['webp'],
        metadata: { uploadedBy: 'user-42' },
      });

      const stored = adapter.get(adapter.keys()[0]!);
      assert.deepEqual(stored!.metadata, { uploadedBy: 'user-42' });
      assert.equal(stored!.cacheControl, 'public, max-age=31536000, immutable');
    });

    it('deletes every variant of a result', async () => {
      const { optimizer, adapter } = setup();
      const result = await optimizer.optimize({
        source,
        formats: ['webp'],
        sizes: [{ width: 600 }, { width: 300 }],
      });

      assert.equal(adapter.size, 2);
      await optimizer.delete(result);
      assert.equal(adapter.size, 0);
    });

    it('explains itself when delete is unsupported', async () => {
      const bare: StorageAdapter = {
        name: 'bare',
        upload: async (file) => ({ key: file.key, url: `x://${file.key}`, size: file.data.byteLength }),
      };
      const optimizer = new ImageOptimizer({ engine: createFakeEngine(), adapter: bare });
      const result = await optimizer.optimize({ source, formats: ['webp'] });

      await assert.rejects(optimizer.delete(result), (error: unknown) => {
        assert.ok(LensError.is(error, 'ADAPTER_UNSUPPORTED'));
        assert.match(error.message, /does not implement remove\(\)/);
        return true;
      });
    });
  });

  describe('caching', () => {
    it('reuses a result for identical input and options', async () => {
      const engine = createFakeEngine();
      const optimizer = new ImageOptimizer({ engine, adapter: new MemoryAdapter(), cache: 'memory' });

      const first = await optimizer.optimize({ source, formats: ['webp'], sizes: [{ width: 600 }] });
      const encodes = engine.calls.transforms.length;

      const second = await optimizer.optimize({ source, formats: ['webp'], sizes: [{ width: 600 }] });

      assert.equal(second.cached, true);
      assert.equal(first.id, second.id);
      assert.equal(engine.calls.transforms.length, encodes, 'no re-encoding happened');
    });

    it('treats different options as a different entry', async () => {
      const engine = createFakeEngine();
      const optimizer = new ImageOptimizer({ engine, adapter: new MemoryAdapter(), cache: 'memory' });

      await optimizer.optimize({ source, formats: ['webp'], sizes: [{ width: 600 }] });
      const second = await optimizer.optimize({ source, formats: ['webp'], sizes: [{ width: 300 }] });

      assert.equal(second.cached, false, 'a different size is a different result');
    });

    it('gives each run its own runId even on a cache hit', async () => {
      const { engine } = setup();
      const optimizer = new ImageOptimizer({ engine, adapter: new MemoryAdapter(), cache: 'memory' });

      const first = await optimizer.optimize({ source, formats: ['webp'] });
      const second = await optimizer.optimize({ source, formats: ['webp'] });

      assert.notEqual(first.runId, second.runId, 'so logs can tell the two calls apart');
    });

    it('force bypasses the cache', async () => {
      const engine = createFakeEngine();
      const optimizer = new ImageOptimizer({ engine, adapter: new MemoryAdapter(), cache: 'memory' });

      await optimizer.optimize({ source, formats: ['webp'] });
      const second = await optimizer.optimize({ source, formats: ['webp'], force: true });

      assert.equal(second.cached, false);
    });

    it('does not cache results that carry encoded bytes', async () => {
      // A 500-entry LRU holding multi-megabyte buffers is a memory leak, so
      // process-only results are deliberately not stored.
      const engine = createFakeEngine();
      const optimizer = new ImageOptimizer({ engine, cache: 'memory' }); // No adapter.

      await optimizer.optimize({ source, formats: ['webp'] });
      const second = await optimizer.optimize({ source, formats: ['webp'] });

      assert.equal(second.cached, false);
      assert.ok(second.variants[0]!.data, 'and the bytes are still returned');
    });

    it('re-processes when storage says the objects are gone', async () => {
      const engine = createFakeEngine();
      const adapter = new MemoryAdapter();
      const optimizer = new ImageOptimizer({ engine, adapter, cache: 'storage' });

      await optimizer.optimize({ source, formats: ['webp'] });
      adapter.clear(); // Simulate a lifecycle rule or a manual delete.

      const second = await optimizer.optimize({ source, formats: ['webp'] });

      assert.equal(second.cached, false, 'a stale memory hit does not survive the exists() check');
      assert.equal(adapter.size, 1, 'and the object was written again');
    });
  });

  describe('cancellation', () => {
    it('rejects immediately when the signal has already fired', async () => {
      const { optimizer } = setup();
      const controller = new AbortController();
      controller.abort();

      await assert.rejects(
        optimizer.optimize({ source, formats: ['webp'], signal: controller.signal }),
        (error: unknown) => LensError.is(error, 'ABORTED'),
      );
    });
  });

  describe('result summary', () => {
    it('reports total size, savings and timing', async () => {
      const { optimizer } = setup();
      const result = await optimizer.optimize({
        source,
        formats: ['webp'],
        sizes: [{ width: 600 }, { width: 300 }],
      });

      const sum = result.variants.reduce((total, v) => total + v.size, 0);
      assert.equal(result.totalSize, sum);
      assert.ok(result.savings >= 0 && result.savings <= 1);
      assert.ok(result.durationMs >= 0);
      assert.equal(result.engine, 'fake');
      assert.equal(result.adapter, 'memory');
    });

    it('never reports negative savings', async () => {
      // An encoder that inflates the file - re-encoding a small PNG, say.
      const { optimizer } = setup({ bytesPerPixel: 100 });
      const result = await optimizer.optimize({ source, formats: ['webp'] });

      assert.equal(result.savings, 0, 'clamped rather than going negative');
    });

    it('describes the source image', async () => {
      const { optimizer } = setup();
      const result = await optimizer.optimize({
        source: { data: source, filename: 'photo.jpg' },
        formats: ['webp'],
      });

      assert.equal(result.source.filename, 'photo.jpg');
      assert.equal(result.source.width, 2000);
      assert.equal(result.source.size, source.byteLength);
      assert.match(result.source.checksum, /^[0-9a-f]{64}$/);
    });
  });

  describe('inspect', () => {
    it('reads metadata without producing anything', async () => {
      const { optimizer, adapter, engine } = setup();

      const meta = await optimizer.inspect(source);

      assert.equal(meta.width, 2000);
      assert.equal(adapter.size, 0, 'nothing was uploaded');
      assert.equal(engine.calls.transforms.length, 0, 'nothing was encoded');
    });
  });

  describe('optimizeMany', () => {
    it('processes a list with shared options', async () => {
      const { optimizer } = setup();

      const results = await optimizer.optimizeMany([source, pngFixture(800, 600)], {
        formats: ['webp'],
      });

      assert.equal(results.length, 2);
      assert.ok(results.every((r) => r.variants.length === 1));
    });
  });
});
