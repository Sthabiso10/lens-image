import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { LensError } from '@lens-image/core';
import type { StorageContext, StorageFile } from '@lens-image/core';
import { CloudinaryAdapter, buildMultipart, sign } from '../src/index.js';

const ctx: StorageContext = { attempt: 1, runId: 'test-run' };

const credentials = { cloudName: 'demo', apiKey: 'key-1', apiSecret: 'secret-1' };

const file = (key = 'hash/photo.webp'): StorageFile => ({
  key,
  data: new TextEncoder().encode('image-bytes'),
  contentType: 'image/webp',
  checksum: 'deadbeef',
});

/** Records requests and replays a canned response. */
function stubFetch(
  response: { status?: number; body?: unknown } = {},
): typeof fetch & { calls: { url: string; init: RequestInit | undefined }[] } {
  const calls: { url: string; init: RequestInit | undefined }[] = [];

  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const status = response.status ?? 200;
    return new Response(JSON.stringify(response.body ?? {}), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch & { calls: typeof calls };

  impl.calls = calls;
  return impl;
}

const okResponse = {
  status: 200,
  body: {
    public_id: 'hash/photo',
    secure_url: 'https://res.cloudinary.com/demo/image/upload/v123/hash/photo.webp',
    bytes: 11,
    etag: 'etag-1',
    version: 123,
    format: 'webp',
    width: 600,
    height: 450,
  },
};

/** Parses a multipart body back into field name -> value. */
function parseFields(body: unknown): Record<string, string> {
  const text = new TextDecoder().decode(body as Uint8Array);
  const fields: Record<string, string> = {};
  const pattern = /name="([^"]+)"(?:; filename="[^"]*"\r\nContent-Type: [^\r\n]+)?\r\n\r\n([\s\S]*?)\r\n--/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    fields[match[1]!] = match[2]!;
  }
  return fields;
}

describe('CloudinaryAdapter', () => {
  describe('configuration', () => {
    it('names every missing credential at once', () => {
      assert.throws(
        () => new CloudinaryAdapter({ cloudName: 'demo' } as never),
        (error: unknown) => {
          assert.ok(LensError.is(error, 'ADAPTER_MISCONFIGURED'));
          assert.match(error.message, /apiKey, apiSecret/);
          return true;
        },
      );
    });
  });

  describe('signing', () => {
    it('matches Cloudinary\'s documented algorithm', () => {
      // SHA-1 of the params sorted by key, joined with &, secret appended.
      const params = { timestamp: '1700000000', public_id: 'sample' };
      const expected = createHash('sha1')
        .update('public_id=sample&timestamp=1700000000' + 'my-secret')
        .digest('hex');

      assert.equal(sign(params, 'my-secret'), expected);
    });

    it('is order-independent', () => {
      assert.equal(
        sign({ a: '1', b: '2' }, 's'),
        sign({ b: '2', a: '1' }, 's'),
      );
    });

    it('skips empty values, which Cloudinary excludes from the signature', () => {
      assert.equal(sign({ a: '1', b: '' }, 's'), sign({ a: '1' }, 's'));
    });
  });

  describe('multipart encoding', () => {
    it('round-trips fields and file bytes', () => {
      const body = buildMultipart(
        { api_key: 'k', timestamp: '123' },
        { key: 'a/b.webp', data: new TextEncoder().encode('BYTES'), contentType: 'image/webp' },
      );

      const text = new TextDecoder().decode(body.data);
      assert.match(body.contentType, /^multipart\/form-data; boundary=----LensBoundary/);
      assert.match(text, /name="api_key"\r\n\r\nk\r\n/);
      assert.match(text, /name="file"; filename="b\.webp"/);
      assert.match(text, /Content-Type: image\/webp/);
      assert.ok(text.includes('BYTES'));
      assert.ok(text.endsWith('--\r\n'), 'terminated with the closing boundary');
    });

    it('works with no file part', () => {
      const body = buildMultipart({ public_id: 'x' });
      assert.match(new TextDecoder().decode(body.data), /name="public_id"/);
    });

    it('preserves binary bytes exactly', () => {
      const bytes = new Uint8Array([0, 1, 2, 250, 251, 255]);
      const body = buildMultipart({}, { key: 'a.bin', data: bytes, contentType: 'x' });

      // Find the raw bytes inside the encoded body.
      const haystack = body.data;
      let found = false;
      for (let i = 0; i + bytes.length <= haystack.length && !found; i++) {
        found = bytes.every((byte, offset) => haystack[i + offset] === byte);
      }
      assert.ok(found, 'the payload survived encoding untouched');
    });
  });

  describe('upload', () => {
    it('posts a signed multipart request', async () => {
      const fetchStub = stubFetch(okResponse);
      const adapter = new CloudinaryAdapter({ ...credentials, fetch: fetchStub });

      const result = await adapter.upload(file(), ctx);

      assert.equal(fetchStub.calls.length, 1);
      assert.equal(fetchStub.calls[0]!.url, 'https://api.cloudinary.com/v1_1/demo/image/upload');

      const fields = parseFields(fetchStub.calls[0]!.init!.body);
      assert.equal(fields.api_key, 'key-1');
      assert.equal(fields.public_id, 'hash/photo', 'extension stripped');
      assert.ok(fields.signature, 'signed');
      assert.ok(!('api_secret' in fields), 'the secret is never transmitted');

      assert.equal(result.url, okResponse.body.secure_url);
      assert.equal(result.etag, 'etag-1');
      assert.equal(result.meta!.publicId, 'hash/photo');
    });

    it('signs exactly the fields it sends', async () => {
      const fetchStub = stubFetch(okResponse);
      const adapter = new CloudinaryAdapter({ ...credentials, folder: 'products', fetch: fetchStub });

      await adapter.upload(file(), ctx);
      const fields = parseFields(fetchStub.calls[0]!.init!.body);

      // Cloudinary excludes `file`, `api_key` and `resource_type` from the
      // signature; everything else in the body must be covered by it.
      const { api_key: _key, file: _payload, signature, ...signed } = fields;
      assert.equal(signature, sign(signed, 'secret-1'), 'the signature verifies against the payload');
      assert.deepEqual(
        Object.keys(signed).sort(),
        ['folder', 'overwrite', 'public_id', 'timestamp'],
        'and covers every other field sent',
      );
    });

    it('encodes metadata as a Cloudinary context string', async () => {
      const fetchStub = stubFetch(okResponse);
      const adapter = new CloudinaryAdapter({ ...credentials, fetch: fetchStub });

      await adapter.upload({ ...file(), metadata: { alt: 'A cat', by: 'sam' } }, ctx);

      assert.equal(parseFields(fetchStub.calls[0]!.init!.body).context, 'alt=A cat|by=sam');
    });

    it('surfaces a 401 with a pointer at the credentials', async () => {
      const fetchStub = stubFetch({ status: 401, body: { error: { message: 'Invalid signature' } } });
      const adapter = new CloudinaryAdapter({ ...credentials, fetch: fetchStub });

      await assert.rejects(adapter.upload(file(), ctx), (error: unknown) => {
        assert.ok(LensError.is(error, 'UPLOAD_FAILED'));
        assert.match(error.message, /Invalid signature/);
        assert.match(error.message, /Check apiKey and apiSecret/);
        return true;
      });
    });

    it('fails when the response has no secure_url', async () => {
      const fetchStub = stubFetch({ status: 200, body: { public_id: 'x' } });
      const adapter = new CloudinaryAdapter({ ...credentials, fetch: fetchStub });

      await assert.rejects(adapter.upload(file(), ctx), (error: unknown) =>
        LensError.is(error, 'UPLOAD_FAILED'),
      );
    });

    it('rewrites the host when a custom CDN is configured', async () => {
      const fetchStub = stubFetch(okResponse);
      const adapter = new CloudinaryAdapter({
        ...credentials,
        publicUrl: 'https://images.example.com',
        fetch: fetchStub,
      });

      const result = await adapter.upload(file(), ctx);

      assert.equal(
        result.url,
        'https://images.example.com/demo/image/upload/v123/hash/photo.webp',
        'the version segment is preserved',
      );
    });
  });

  describe('exists', () => {
    it('uses basic auth against the admin API', async () => {
      const fetchStub = stubFetch({ status: 200, body: {} });
      const adapter = new CloudinaryAdapter({ ...credentials, fetch: fetchStub });

      assert.equal(await adapter.exists('hash/photo.webp'), true);

      const headers = fetchStub.calls[0]!.init!.headers as Record<string, string>;
      assert.equal(
        headers.authorization,
        `Basic ${Buffer.from('key-1:secret-1').toString('base64')}`,
      );
    });

    it('is false on 404', async () => {
      const adapter = new CloudinaryAdapter({ ...credentials, fetch: stubFetch({ status: 404 }) });
      assert.equal(await adapter.exists('missing.webp'), false);
    });

    it('throws on an unexpected status rather than reporting "missing"', async () => {
      const adapter = new CloudinaryAdapter({ ...credentials, fetch: stubFetch({ status: 500 }) });
      await assert.rejects(adapter.exists('a.webp'), (error: unknown) => LensError.is(error));
    });
  });

  describe('remove', () => {
    it('posts a signed destroy request', async () => {
      const fetchStub = stubFetch({ status: 200, body: { result: 'ok' } });
      const adapter = new CloudinaryAdapter({ ...credentials, folder: 'products', fetch: fetchStub });

      await adapter.remove('hash/photo.webp');

      assert.equal(fetchStub.calls[0]!.url, 'https://api.cloudinary.com/v1_1/demo/image/destroy');
      const fields = parseFields(fetchStub.calls[0]!.init!.body);
      assert.equal(fields.public_id, 'products/hash/photo');
      assert.ok(fields.signature);
    });
  });

  describe('getUrl', () => {
    it('predicts an unversioned delivery URL', () => {
      const adapter = new CloudinaryAdapter(credentials);
      assert.equal(
        adapter.getUrl('hash/photo.webp'),
        'https://res.cloudinary.com/demo/image/upload/hash/photo',
      );
    });

    it('includes the folder', () => {
      const adapter = new CloudinaryAdapter({ ...credentials, folder: 'products' });
      assert.equal(
        adapter.getUrl('a.webp'),
        'https://res.cloudinary.com/demo/image/upload/products/a',
      );
    });
  });
});
