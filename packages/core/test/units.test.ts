import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';
import { MemoryCacheStore } from '../src/cache.js';
import { delay, mapLimit } from '../src/concurrency.js';
import { LensError } from '../src/errors.js';
import { normalizeFormat, normalizeFormats } from '../src/format.js';
import { hashOptions, sha256, shortHash } from '../src/hash.js';
import { buildKey, defaultLabel, joinKey, slugify } from '../src/naming.js';
import { backoffDelay, isRetryableError, resolveRetry, withRetry } from '../src/retry.js';
import { resolveSource, stem } from '../src/source.js';
import { buildSrcset } from '../src/srcset.js';
import { resolveValidation, validateImage } from '../src/validation.js';
import type { KeyContext, OptimizeResult, Variant } from '../src/types.js';
import { jpegFixture, pngFixture } from './fixtures.js';

describe('format normalisation', () => {
  it('maps aliases and casing onto the canonical name', () => {
    assert.equal(normalizeFormat('jpg'), 'jpeg');
    assert.equal(normalizeFormat('JPEG'), 'jpeg');
    assert.equal(normalizeFormat('.png'), 'png');
    assert.equal(normalizeFormat('tif'), 'tiff');
  });

  it('deduplicates while preserving order', () => {
    // Order matters downstream: it decides <source> order in a <picture>.
    assert.deepEqual(normalizeFormats(['avif', 'webp', 'jpg', 'jpeg']), ['avif', 'webp', 'jpeg']);
  });

  it('names the supported formats when given an unknown one', () => {
    assert.throws(() => normalizeFormat('bmp'), (error: unknown) => {
      assert.ok(LensError.is(error, 'INVALID_OPTIONS'));
      assert.match(error.message, /Supported: jpeg, png, webp, avif, gif, tiff/);
      return true;
    });
  });
});

describe('naming', () => {
  const ctx: KeyContext = {
    name: 'sunset',
    hash: 'a1b2c3d4e5',
    fullHash: 'a1b2c3d4e5'.repeat(6) + 'abcd',
    format: 'webp',
    ext: 'webp',
    width: 1200,
    height: 800,
    quality: 80,
    label: '1200w',
  };

  it('slugifies to URL-safe text', () => {
    assert.equal(slugify('Café Photo (2)'), 'cafe-photo-2');
    assert.equal(slugify('  hello   world  '), 'hello-world');
    assert.equal(slugify('!!!'), 'image', 'never produces an empty segment');
    assert.equal(slugify('a'.repeat(200)).length, 100, 'bounded length');
  });

  it('renders every documented token', () => {
    const key = buildKey('{name}-{hash}-{width}x{height}-q{quality}-{label}.{ext}', ctx);
    assert.equal(key, 'sunset-a1b2c3d4e5-1200x800-q80-1200w.webp');
  });

  it('rejects an unknown token by name', () => {
    assert.throws(() => buildKey('{bogus}.{ext}', ctx), (error: unknown) => {
      assert.ok(LensError.is(error, 'INVALID_OPTIONS'));
      assert.match(error.message, /Unknown token "\{bogus\}"/);
      return true;
    });
  });

  it('rejects a key function that returns nothing usable', () => {
    assert.throws(
      () => buildKey(() => '' as string, ctx),
      (error: unknown) => LensError.is(error, 'INVALID_OPTIONS'),
    );
  });

  it('strips traversal segments when joining', () => {
    assert.equal(joinKey('uploads', '../../etc/passwd'), 'uploads/etc/passwd');
    assert.equal(joinKey('/a/', '/b/c/'), 'a/b/c');
    assert.equal(joinKey('', 'x.webp'), 'x.webp');
  });

  it('labels sizes by which dimensions were pinned', () => {
    assert.equal(defaultLabel(1200, undefined), '1200w');
    assert.equal(defaultLabel(undefined, 800), '800h');
    assert.equal(defaultLabel(1200, 800), '1200x800');
    assert.equal(defaultLabel(), 'original');
  });

  it('separates a filename from its extension', () => {
    assert.equal(stem('photo.jpg'), 'photo');
    assert.equal(stem('archive.tar.gz'), 'archive.tar');
    assert.equal(stem('noext'), 'noext');
  });
});

describe('hashing', () => {
  it('is stable for identical bytes', () => {
    assert.equal(sha256(pngFixture()), sha256(pngFixture()));
    assert.notEqual(sha256(pngFixture(10, 10)), sha256(pngFixture(20, 20)));
  });

  it('shortens to the requested length', () => {
    assert.equal(shortHash(pngFixture()).length, 10);
    assert.equal(shortHash(pngFixture(), 16).length, 16);
  });

  it('ignores property order when hashing options', () => {
    // Otherwise object literal ordering would silently fragment the cache.
    assert.equal(hashOptions({ a: 1, b: [2, 3] }), hashOptions({ b: [2, 3], a: 1 }));
    assert.notEqual(hashOptions({ a: 1 }), hashOptions({ a: 2 }));
  });

  it('treats undefined properties as absent', () => {
    assert.equal(hashOptions({ a: 1, b: undefined }), hashOptions({ a: 1 }));
  });
});

describe('mapLimit', () => {
  it('preserves input order in the output', async () => {
    const results = await mapLimit([5, 1, 3], 2, async (n) => {
      await delay(n);
      return n * 2;
    });
    assert.deepEqual(results.map((r) => (r.status === 'fulfilled' ? r.value : null)), [10, 2, 6]);
  });

  it('never exceeds the concurrency limit', async () => {
    let inFlight = 0;
    let peak = 0;

    await mapLimit(Array.from({ length: 20 }, (_, i) => i), 3, async () => {
      peak = Math.max(peak, ++inFlight);
      await delay(1);
      inFlight--;
    });

    assert.ok(peak <= 3, `peak concurrency was ${peak}`);
  });

  it('reports failures per item instead of discarding the successes', async () => {
    const results = await mapLimit([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error('boom');
      return n;
    });

    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 2);
    assert.equal(results[1]!.status, 'rejected');
  });

  it('handles an empty list', async () => {
    assert.deepEqual(await mapLimit([], 4, async () => 1), []);
  });
});

describe('retry', () => {
  it('retries transient network and 5xx errors', () => {
    assert.equal(isRetryableError(Object.assign(new Error(), { code: 'ECONNRESET' })), true);
    assert.equal(isRetryableError({ $metadata: { httpStatusCode: 503 } }), true);
    assert.equal(isRetryableError({ status: 429 }), true);
    assert.equal(isRetryableError({ status: 408 }), true);
  });

  it('never retries a 4xx, because it will still be a 4xx next time', () => {
    assert.equal(isRetryableError({ status: 403 }), false);
    assert.equal(isRetryableError({ status: 404 }), false);
    assert.equal(isRetryableError({ $metadata: { httpStatusCode: 400 } }), false);
  });

  it('never retries our own validation errors', () => {
    assert.equal(isRetryableError(new LensError('VALIDATION_FAILED', 'too big')), false);
  });

  it('unwraps a nested cause', () => {
    const wrapped = new Error('fetch failed', { cause: Object.assign(new Error(), { code: 'ECONNRESET' }) });
    assert.equal(isRetryableError(wrapped), true);
  });

  it('grows the backoff ceiling exponentially and caps it', () => {
    const policy = { baseDelayMs: 100, maxDelayMs: 1000 };
    const max = () => 1; // Full jitter at its ceiling.

    assert.equal(backoffDelay(1, policy, max), 100);
    assert.equal(backoffDelay(2, policy, max), 200);
    assert.equal(backoffDelay(3, policy, max), 400);
    assert.equal(backoffDelay(10, policy, max), 1000, 'capped at maxDelayMs');
  });

  it('applies jitter, so a fleet does not retry in lockstep', () => {
    const policy = { baseDelayMs: 1000, maxDelayMs: 10_000 };
    assert.equal(backoffDelay(3, policy, () => 0), 0);
    assert.equal(backoffDelay(3, policy, () => 0.5), 2000);
  });

  it('succeeds after transient failures', async () => {
    let attempts = 0;
    const value = await withRetry(
      resolveRetry({ attempts: 3, baseDelayMs: 1 }),
      async (attempt) => {
        attempts = attempt;
        if (attempt < 3) throw Object.assign(new Error('flaky'), { code: 'ETIMEDOUT' });
        return 'ok';
      },
    );

    assert.equal(value, 'ok');
    assert.equal(attempts, 3);
  });

  it('stops immediately on a non-retryable error', async () => {
    let attempts = 0;
    await assert.rejects(
      withRetry(resolveRetry({ attempts: 5, baseDelayMs: 1 }), async () => {
        attempts++;
        throw { status: 403, message: 'forbidden' };
      }),
    );
    assert.equal(attempts, 1, 'no point hammering a 403');
  });

  it('reports each retry through onRetry', async () => {
    const seen: number[] = [];
    await assert.rejects(
      withRetry(
        resolveRetry({
          attempts: 3,
          baseDelayMs: 1,
          onRetry: ({ attempt }) => seen.push(attempt),
        }),
        async () => {
          throw Object.assign(new Error(), { code: 'ECONNRESET' });
        },
      ),
    );
    assert.deepEqual(seen, [1, 2], 'called before each sleep, not after the last failure');
  });
});

describe('MemoryCacheStore', () => {
  const entry = (id: string) => ({ id }) as OptimizeResult;

  it('stores and returns entries', () => {
    const cache = new MemoryCacheStore(3);
    cache.set('a', entry('a'));
    assert.equal(cache.get('a')!.id, 'a');
    assert.equal(cache.get('missing'), undefined);
  });

  it('evicts the least recently used entry', () => {
    const cache = new MemoryCacheStore(2);
    cache.set('a', entry('a'));
    cache.set('b', entry('b'));
    cache.get('a'); // 'a' is now the most recently used.
    cache.set('c', entry('c'));

    assert.ok(cache.get('a'), 'recently read, so kept');
    assert.equal(cache.get('b'), undefined, 'evicted');
    assert.ok(cache.get('c'));
    assert.equal(cache.size, 2);
  });
});

describe('validation', () => {
  const policy = resolveValidation({ maxBytes: 1000, maxPixels: 1_000_000 })!;

  it('accepts an image inside the limits', () => {
    assert.doesNotThrow(() =>
      validateImage({ format: 'jpeg', width: 800, height: 600, size: 500 }, policy),
    );
  });

  it('puts the limit and the actual value on the error', () => {
    assert.throws(
      () => validateImage({ format: 'jpeg', width: 10, height: 10, size: 5000 }, policy, 'big.jpg'),
      (error: unknown) => {
        assert.ok(LensError.is(error, 'VALIDATION_FAILED'));
        assert.equal(error.details.limit, 1000);
        assert.equal(error.details.actual, 5000);
        assert.match(error.message, /big\.jpg/);
        return true;
      },
    );
  });

  it('enforces minimum dimensions', () => {
    const strict = resolveValidation({ minWidth: 500 })!;
    assert.throws(
      () => validateImage({ format: 'jpeg', width: 100, height: 100, size: 10 }, strict),
      (error: unknown) => LensError.is(error, 'VALIDATION_FAILED'),
    );
  });

  it('resolves to null when disabled', () => {
    assert.equal(resolveValidation(false), null);
    assert.doesNotThrow(() => validateImage({ format: 'unknown', width: 0, height: 0, size: 0 }, null));
  });
});

describe('resolveSource', () => {
  it('accepts raw bytes', async () => {
    const resolved = await resolveSource(pngFixture());
    assert.equal(resolved.origin, 'buffer');
    assert.equal(resolved.filename, 'image');
  });

  it('reads a file from disk and keeps its basename', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lens-src-'));
    try {
      const path = join(dir, 'photo.jpg');
      await writeFile(path, jpegFixture());

      const resolved = await resolveSource(path);
      assert.equal(resolved.origin, 'path');
      assert.equal(resolved.filename, 'photo.jpg');

      const viaUrl = await resolveSource(pathToFileURL(path));
      assert.equal(viaUrl.filename, 'photo.jpg');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('drains an async iterable', async () => {
    async function* chunks() {
      yield new Uint8Array([1, 2, 3]);
      yield new Uint8Array([4, 5]);
    }
    const resolved = await resolveSource(chunks());
    assert.deepEqual([...resolved.data], [1, 2, 3, 4, 5]);
  });

  it('enforces maxBytes while draining a stream', async () => {
    async function* chunks() {
      for (let i = 0; i < 100; i++) yield new Uint8Array(100);
    }
    await assert.rejects(
      resolveSource(chunks(), { maxBytes: 500 }),
      (error: unknown) => LensError.is(error, 'VALIDATION_FAILED'),
      'it stops mid-stream rather than buffering everything first',
    );
  });

  it('refuses remote URLs unless allowRemote is set', async () => {
    await assert.rejects(
      resolveSource(new URL('https://example.com/a.jpg')),
      (error: unknown) => {
        assert.ok(LensError.is(error, 'INVALID_SOURCE'));
        assert.match(error.message, /SSRF/);
        return true;
      },
    );
  });

  it('strips directory separators from a supplied filename', async () => {
    const resolved = await resolveSource(pngFixture(), { filename: '../../evil.png' });
    assert.equal(resolved.filename, 'evil.png');
  });

  it('describes what it got when the source shape is wrong', async () => {
    await assert.rejects(
      resolveSource(42 as unknown as string),
      (error: unknown) => {
        assert.ok(LensError.is(error, 'INVALID_SOURCE'));
        assert.match(error.message, /Received number/);
        return true;
      },
    );
  });

  it('reports a missing file clearly', async () => {
    await assert.rejects(
      resolveSource('/definitely/not/here.jpg'),
      (error: unknown) => LensError.is(error, 'SOURCE_UNREADABLE'),
    );
  });
});

describe('buildSrcset', () => {
  const variant = (width: number, url: string): Variant =>
    ({ width, url, format: 'webp' }) as Variant;

  it('sorts ascending and formats width descriptors', () => {
    const srcset = buildSrcset([variant(1200, 'b.webp'), variant(300, 'a.webp')]);
    assert.equal(srcset, 'a.webp 300w, b.webp 1200w');
  });

  it('skips variants with no URL', () => {
    assert.equal(buildSrcset([variant(300, '')]), '');
  });
});

describe('LensError', () => {
  it('narrows by code', () => {
    const error = new LensError('UPLOAD_FAILED', 'nope');
    assert.ok(LensError.is(error));
    assert.ok(LensError.is(error, 'UPLOAD_FAILED'));
    assert.ok(!LensError.is(error, 'ABORTED'));
    assert.ok(!LensError.is(new Error('plain')));
  });

  it('suggests an HTTP status per code', () => {
    assert.equal(new LensError('VALIDATION_FAILED', '').status, 422);
    assert.equal(new LensError('UNSUPPORTED_INPUT', '').status, 415);
    assert.equal(new LensError('UPLOAD_FAILED', '').status, 502);
  });

  it('serialises without leaking the cause chain', () => {
    const json = new LensError('ABORTED', 'stopped', {
      cause: new Error('inner'),
      details: { key: 'a/b.webp' },
    }).toJSON();

    assert.equal(json.code, 'ABORTED');
    assert.deepEqual(json.details, { key: 'a/b.webp' });
    assert.equal(json.cause, undefined);
  });
});
