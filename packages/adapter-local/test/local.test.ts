import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { LensError } from '@lens-image/core';
import type { StorageContext, StorageFile } from '@lens-image/core';
import { LocalAdapter } from '../src/index.js';

const ctx: StorageContext = { attempt: 1, runId: 'test-run' };

const file = (key: string, body = 'hello'): StorageFile => ({
  key,
  data: new TextEncoder().encode(body),
  contentType: 'image/webp',
  checksum: 'abc123',
});

describe('LocalAdapter', () => {
  let root: string;

  before(async () => {
    root = await mkdtemp(join(tmpdir(), 'lens-local-'));
  });

  after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('requires a root directory', () => {
    assert.throws(
      () => new LocalAdapter({} as { root: string }),
      (error: unknown) => {
        assert.ok(LensError.is(error, 'ADAPTER_MISCONFIGURED'));
        assert.match(error.message, /needs a `root`/);
        return true;
      },
    );
  });

  it('writes a file, creating parent directories', async () => {
    const adapter = new LocalAdapter({ root });
    const result = await adapter.upload(file('a/b/c/image.webp'), ctx);

    assert.equal(result.key, 'a/b/c/image.webp');
    assert.equal(result.size, 5);
    assert.equal(await readFile(join(root, 'a/b/c/image.webp'), 'utf8'), 'hello');
  });

  it('leaves no temp files behind after an atomic write', async () => {
    const adapter = new LocalAdapter({ root });
    await adapter.upload(file('atomic/one.webp'), ctx);

    const entries = await readdir(join(root, 'atomic'));
    assert.deepEqual(entries, ['one.webp'], 'the .tmp file was renamed, not left');
  });

  it('builds URLs from baseUrl', async () => {
    const adapter = new LocalAdapter({ root, baseUrl: '/uploads/' });
    const result = await adapter.upload(file('hash/photo.webp'), ctx);

    assert.equal(result.url, '/uploads/hash/photo.webp', 'the trailing slash is normalised');
  });

  it('falls back to a parseable file:// URL without baseUrl', async () => {
    const adapter = new LocalAdapter({ root });
    const result = await adapter.upload(file('plain.webp'), ctx);

    assert.match(result.url, /^file:\/\//);

    // On Windows, string-concatenating "file://" + "C:\..." produces a URL whose
    // *host* is "C:", which fileURLToPath rejects. Round-tripping proves it is real.
    const parsed = new URL(result.url);
    assert.equal(parsed.protocol, 'file:');
    assert.equal(parsed.host, '', 'no accidental hostname');
    assert.equal(fileURLToPath(parsed), adapter.resolvePath('plain.webp'));
  });

  it('percent-encodes URL path segments', () => {
    const adapter = new LocalAdapter({ root, baseUrl: 'https://cdn.example.com' });
    assert.equal(
      adapter.getUrl('a b/c+d.webp'),
      'https://cdn.example.com/a%20b/c%2Bd.webp',
    );
  });

  it('reports existence and deletes', async () => {
    const adapter = new LocalAdapter({ root });
    await adapter.upload(file('lifecycle.webp'), ctx);

    assert.equal(await adapter.exists('lifecycle.webp'), true);
    await adapter.remove('lifecycle.webp');
    assert.equal(await adapter.exists('lifecycle.webp'), false);
  });

  it('does not throw when deleting something that is already gone', async () => {
    const adapter = new LocalAdapter({ root });
    await assert.doesNotReject(adapter.remove('never-existed.webp'));
  });

  it('refuses a key that escapes the root', async () => {
    const adapter = new LocalAdapter({ root });

    await assert.rejects(
      adapter.upload(file('../../../etc/passwd'), ctx),
      (error: unknown) => {
        assert.ok(LensError.is(error, 'UPLOAD_FAILED'));
        assert.match(error.message, /resolves outside the adapter root/);
        return true;
      },
    );
  });

  it('refuses an absolute key', async () => {
    const adapter = new LocalAdapter({ root });
    await assert.rejects(
      adapter.upload(file('C:/Windows/System32/x.webp'), ctx),
      (error: unknown) => LensError.is(error, 'UPLOAD_FAILED'),
    );
  });

  it('overwrites by default', async () => {
    const adapter = new LocalAdapter({ root });
    await adapter.upload(file('overwrite.webp', 'first'), ctx);
    await adapter.upload(file('overwrite.webp', 'second'), ctx);

    assert.equal(await readFile(join(root, 'overwrite.webp'), 'utf8'), 'second');
  });

  it('refuses to overwrite when told not to', async () => {
    const adapter = new LocalAdapter({ root, overwrite: false });
    await adapter.upload(file('protected.webp', 'first'), ctx);

    await assert.rejects(
      adapter.upload(file('protected.webp', 'second'), ctx),
      (error: unknown) => {
        assert.ok(LensError.is(error, 'UPLOAD_FAILED'));
        assert.match(error.message, /already exists/);
        return true;
      },
    );
    assert.equal(await readFile(join(root, 'protected.webp'), 'utf8'), 'first', 'untouched');
  });

  it('works with atomic writes disabled', async () => {
    const adapter = new LocalAdapter({ root, atomic: false });
    await adapter.upload(file('direct.webp', 'direct'), ctx);

    assert.equal(await readFile(join(root, 'direct.webp'), 'utf8'), 'direct');
  });

  it('exposes the resolved path for serving', () => {
    const adapter = new LocalAdapter({ root });
    assert.equal(adapter.resolvePath('x/y.webp'), join(root, 'x', 'y.webp'));
  });
});
