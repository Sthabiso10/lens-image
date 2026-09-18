import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MemoryAdapter } from '../src/adapters/memory.js';
import { ImageOptimizer } from '../src/optimizer.js';
import { createUploadHandler, serializeResult } from '../src/server/handler.js';
import { createFakeEngine, jpegFixture } from './fixtures.js';

const bytes = jpegFixture(2000, 1500);

function setup(options: Partial<Parameters<typeof createUploadHandler>[0]> = {}) {
  const adapter = new MemoryAdapter();
  const optimizer = new ImageOptimizer({ engine: createFakeEngine(), adapter });
  return { adapter, optimizer, handler: createUploadHandler({ optimizer, ...options }) };
}

/**
 * `BlobPart` is typed as `ArrayBufferView<ArrayBuffer>`, which a plain
 * `Uint8Array` does not satisfy because its buffer could in principle be a
 * `SharedArrayBuffer`. It never is here.
 */
const asBlobPart = (bytes: Uint8Array): BlobPart => bytes as unknown as BlobPart;

/**
 * Appends a part the way a browser would, without constructing a `File`.
 *
 * `File` only became a global in Node 20, and the floor is 18. `FormData`
 * promotes a `Blob` given a filename into a file entry itself, which is both
 * portable and a better test: the handler duck-types its file parts rather than
 * referencing any particular runtime's `File`, so building the fixture out of
 * one would quietly stop exercising that.
 */
function appendFile(form: FormData, field: string, data: Uint8Array, name: string, type?: string) {
  form.append(field, new Blob([asBlobPart(data)], type ? { type } : undefined), name);
}

function formRequest(files: { name: string; data: Uint8Array }[], field = 'file'): Request {
  const form = new FormData();
  for (const file of files) {
    appendFile(form, field, file.data, file.name, 'image/jpeg');
  }
  return new Request('http://localhost/api/upload', { method: 'POST', body: form });
}

describe('createUploadHandler', () => {
  it('optimizes an uploaded file and returns JSON', async () => {
    const { handler, adapter } = setup({ options: { formats: ['webp'], sizes: [{ width: 600 }] } });

    const response = await handler(formRequest([{ name: 'photo.jpg', data: bytes }]));
    const body = (await response.json()) as { files: { formats: Record<string, { urls: Record<string, string> }> }[] };

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(body.files.length, 1);
    assert.ok(body.files[0]!.formats.webp!.urls['600w']);
    assert.equal(adapter.size, 1);
  });

  it('rejects anything but POST', async () => {
    const { handler } = setup();
    const response = await handler(new Request('http://localhost/api/upload', { method: 'GET' }));

    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'POST');
  });

  it('400s when the field is empty', async () => {
    const { handler } = setup();
    const response = await handler(new Request('http://localhost/api/upload', { method: 'POST', body: new FormData() }));

    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /No files found in the "file" field/);
  });

  it('413s when there are too many files', async () => {
    const { handler } = setup({ maxFiles: 1 });
    const response = await handler(
      formRequest([
        { name: 'a.jpg', data: bytes },
        { name: 'b.jpg', data: bytes },
      ]),
    );

    assert.equal(response.status, 413);
  });

  it('honours a custom field name', async () => {
    const { handler } = setup({ fieldName: 'avatar' });

    assert.equal((await handler(formRequest([{ name: 'a.jpg', data: bytes }], 'avatar'))).status, 200);
    assert.equal((await handler(formRequest([{ name: 'a.jpg', data: bytes }], 'file'))).status, 400);
  });

  it('lets authorize short-circuit before any work happens', async () => {
    const { handler, adapter } = setup({
      authorize: () => new Response('nope', { status: 401 }),
    });

    const response = await handler(formRequest([{ name: 'a.jpg', data: bytes }]));

    assert.equal(response.status, 401);
    assert.equal(adapter.size, 0, 'nothing was processed or uploaded');
  });

  it('derives per-request options from the request', async () => {
    const { handler, adapter } = setup({
      options: (request) => ({
        prefix: new URL(request.url).searchParams.get('tenant') ?? 'default',
        formats: ['webp'],
      }),
    });

    const form = new FormData();
    appendFile(form, 'file', bytes, 'a.jpg');
    await handler(new Request('http://localhost/api/upload?tenant=acme', { method: 'POST', body: form }));

    assert.ok(adapter.keys()[0]!.startsWith('acme/'));
  });

  it('maps a LensError onto its HTTP status and code', async () => {
    const { handler } = setup({ options: { validate: { maxBytes: 10 } } });

    const response = await handler(formRequest([{ name: 'big.jpg', data: bytes }]));
    const body = (await response.json()) as { code: string; error: string };

    assert.equal(response.status, 422, 'not a blanket 500');
    assert.equal(body.code, 'VALIDATION_FAILED');
    assert.match(body.error, /over the/);
  });

  it('does not leak internals on an unexpected failure', async () => {
    const optimizer = new ImageOptimizer({ engine: createFakeEngine() });
    optimizer.optimize = async () => {
      throw new Error('database password is hunter2');
    };

    let observed: unknown;
    const handler = createUploadHandler({ optimizer, onError: (error) => (observed = error) });
    const response = await handler(formRequest([{ name: 'a.jpg', data: bytes }]));
    const body = (await response.json()) as { error: string };

    assert.equal(response.status, 500);
    assert.equal(body.error, 'Image processing failed.');
    assert.ok(!body.error.includes('hunter2'), 'the message stays server-side');
    assert.ok(observed instanceof Error, 'but onError still sees the real error');
  });

  it('400s on a non-multipart body', async () => {
    const { handler } = setup();
    const response = await handler(
      new Request('http://localhost/api/upload', {
        method: 'POST',
        body: 'raw bytes',
        headers: { 'content-type': 'text/plain' },
      }),
    );

    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /multipart\/form-data/);
  });
});

describe('serializeResult', () => {
  it('omits the encoded bytes', async () => {
    const optimizer = new ImageOptimizer({ engine: createFakeEngine() }); // No adapter: keeps data.
    const result = await optimizer.optimize({ source: bytes, formats: ['webp'] });

    assert.ok(result.variants[0]!.data, 'the raw result carries bytes');

    const json = JSON.parse(JSON.stringify(serializeResult(result))) as {
      formats: Record<string, { variants: Record<string, unknown>[] }>;
    };

    assert.equal(json.formats.webp!.variants[0]!.data, undefined, 'the payload does not');
  });

  it('keeps the fields a client actually renders with', async () => {
    const optimizer = new ImageOptimizer({ engine: createFakeEngine(), adapter: new MemoryAdapter() });
    const result = await optimizer.optimize({
      source: bytes,
      formats: ['webp'],
      sizes: [{ width: 600 }],
      thumbnail: true,
    });

    const json = serializeResult(result) as Record<string, unknown>;

    assert.ok(json.id);
    assert.ok(json.thumbnail);
    assert.ok((json.formats as Record<string, { srcset: string }>).webp!.srcset);
    assert.ok(typeof json.savings === 'number');
  });
});
