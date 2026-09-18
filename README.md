<p align="center">
  <a href="https://lens-image.vercel.app">
    <img src="https://raw.githubusercontent.com/Sthabiso10/lens-image/main/docs/media/logo.png?v=81977681" alt="Lens" width="368" />
  </a>
</p>

<p align="center">
  <strong>Image optimization you can actually audit.</strong>
</p>

<p align="center">
  Resize, compress and convert images, then hand them to whatever storage you already use.<br />
  A processing core with no dependencies, and everything heavy behind an interface you control.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@lens-image/core"><img alt="npm" src="https://img.shields.io/npm/v/@lens-image/core.svg?color=cb3837" /></a>
  <a href="https://github.com/Sthabiso10/lens-image/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Sthabiso10/lens-image/actions/workflows/ci.yml/badge.svg" /></a>
  <img alt="Zero dependencies" src="https://img.shields.io/badge/dependencies-0-brightgreen.svg" />
  <img alt="Tests" src="https://img.shields.io/badge/tests-213%20passing-brightgreen.svg" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6.svg" />
  <img alt="MIT license" src="https://img.shields.io/badge/license-MIT-blue.svg" />
</p>

<p align="center">
  <a href="https://lens-image.vercel.app/playground"><strong>Try the live playground</strong></a>
  &nbsp;·&nbsp;
  <a href="https://lens-image.vercel.app">Docs</a>
  &nbsp;·&nbsp;
  <a href="#quick-start">Quick start</a>
  &nbsp;·&nbsp;
  <a href="#about-that-zero-dependencies-claim">The zero-dependency claim</a>
  &nbsp;·&nbsp;
  <a href="#storage">Storage</a>
</p>

> [!WARNING]
> **Pre-1.0 and moving.** The API will change before 1.0. Pin an exact version and read the
> [changelog](CHANGELOG.md) before upgrading. AVIF output depends on how your `sharp` binary
> was built, so treat it as best-effort rather than guaranteed.

---

## Quick start

```bash
npm install @lens-image/core sharp @lens-image/adapter-s3 @aws-sdk/client-s3
```

```ts
import { ImageOptimizer } from '@lens-image/core';
import { S3Adapter } from '@lens-image/adapter-s3';

const optimizer = new ImageOptimizer({
  adapter: new S3Adapter({ bucket: 'my-images', region: 'us-east-1' }),
});

const result = await optimizer.optimize({
  source: './photo.jpg',
  quality: 80,
  formats: ['webp', 'jpg'],
  sizes: [{ width: 1200 }, { width: 600 }, { width: 300 }],
});

result.formats.webp.srcset;
// 'https://...-300w.webp 300w, https://...-600w.webp 600w, https://...-1200w.webp 1200w'
```

Eight lines, six optimized files in S3, and a ready-to-paste `srcset`.

### Run the playground

```bash
npm install
npm run dev
```

Drop an image in and watch the file size move as you drag the quality slider. The encoding is
real, done by your browser's own WebP encoder, and the storage keys come from the same
functions the server calls.

---

## Why another one

Most image libraries make you choose between "does everything, owns your stack" and "does one
thing, you wire up the rest". Lens is the second kind, with the wiring included.

| | |
|---|---|
| **Zero dependencies in the core** | `npm install @lens-image/core` adds exactly one package to your lockfile. Not one plus forty. A CI check enforces it. |
| **Storage is an interface** | S3, filesystem, Cloudinary, or forty lines of your own for R2, GCS, Backblaze. |
| **The codec is an interface too** | sharp is an *optional* peer. Swap it, stub it in tests, or skip it entirely if you only validate and store. |
| **Degrades instead of failing** | AVIF unsupported on your platform? You get WebP and a warning, not a 500. |
| **Errors you can branch on** | Every failure is a `LensError` with a stable `code` and a suggested HTTP status. |

---

## Packages

| Package | What it does | Dependencies |
|---|---|---|
| [`@lens-image/core`](packages/core) | Processing engine, adapter contract, upload handler | **0** |
| [`@lens-image/adapter-local`](packages/adapter-local) | Filesystem storage | **0** |
| [`@lens-image/adapter-s3`](packages/adapter-s3) | S3, R2, MinIO, Spaces, B2 | 0 (AWS SDK is a peer) |
| [`@lens-image/adapter-cloudinary`](packages/adapter-cloudinary) | Cloudinary | **0** |
| [`@lens-image/react`](packages/react) | Headless upload hooks | 0 (React is a peer) |

`@lens-image/core` also exposes [`@lens-image/core/browser`](packages/core#lens-imagecorebrowser),
a Node-free subset (sniffing, validation, key templating) that bundles for browsers and edge
runtimes. You can reject a bad file from its first 4 KB, before the upload starts.

---

## About that "zero dependencies" claim

Being precise, because this is the sort of claim that deserves it.

**`@lens-image/core` has zero entries in `dependencies`.** Installing it adds one package to
your lockfile and downloads no native binaries. That is enforced in CI by
[`scripts/release-check.mjs`](scripts/release-check.mjs), not just promised here.

**Actual pixel work needs `sharp`**, which is a native module. Lens treats the codec as a
pluggable `ImageEngine` and declares sharp as an **optional peer dependency**, imported
dynamically only when you first encode something.

So:

- **You install sharp yourself.** Its native binary, platform matrix and release cadence live
  in *your* lockfile, visible, instead of arriving as a transitive surprise.
- **You can skip it.** Validating, content-hashing and storing originals works with the
  built-in passthrough engine and no codec at all.
- **You can replace it.** `ImageEngine` is three methods. Point it at squoosh, a WASM codec,
  or an ImageMagick shell-out.
- **If you forget it**, you get one clear error naming the install command, not mysteriously
  unprocessed images.

The claim is "core is dependency-free and the heavy thing is your explicit choice", not
"image processing happens by magic".

---

## Storage

The full adapter contract:

```ts
interface StorageAdapter {
  readonly name: string;
  upload(file: StorageFile, ctx: StorageContext): Promise<StorageObject>;

  exists?(key: string): Promise<boolean>;   // unlocks cache: 'storage'
  remove?(key: string): Promise<void>;      // unlocks optimizer.delete()
  getUrl?(key: string): string;
  dispose?(): Promise<void> | void;
}
```

One required method. A complete Google Cloud Storage adapter:

```ts
import { Storage } from '@google-cloud/storage';
import type { StorageAdapter } from '@lens-image/core';

export class GCSAdapter implements StorageAdapter {
  readonly name = 'gcs';
  #bucket = new Storage().bucket(this.bucketName);

  constructor(private bucketName: string) {}

  async upload(file) {
    const object = this.#bucket.file(file.key);
    await object.save(file.data, {
      contentType: file.contentType,
      metadata: { cacheControl: file.cacheControl },
    });
    return {
      key: file.key,
      url: `https://storage.googleapis.com/${this.bucketName}/${file.key}`,
      size: file.data.byteLength,
    };
  }

  async exists(key) {
    const [exists] = await this.#bucket.file(key).exists();
    return exists;
  }

  async remove(key) {
    await this.#bucket.file(key).delete({ ignoreNotFound: true });
  }
}
```

Lens handles retries, concurrency limiting and error wrapping around it.

---

## Uploads, end to end

`@lens-image/core` ships a `Request` to `Response` handler. It works in Next.js, Remix, Hono,
Bun and Deno without a framework adapter, because it only uses web standards.

**Server**, `app/api/upload/route.ts`:

```ts
import { ImageOptimizer, createUploadHandler } from '@lens-image/core';
import { S3Adapter } from '@lens-image/adapter-s3';

const optimizer = new ImageOptimizer({
  adapter: new S3Adapter({ bucket: 'uploads', region: 'us-east-1' }),
});

export const POST = createUploadHandler({
  optimizer,
  maxFiles: 5,
  async authorize(request) {
    const session = await auth(request);
    return session ? undefined : Response.json({ error: 'Unauthorized' }, { status: 401 });
  },
  options: { formats: ['webp', 'jpg'], sizes: [{ width: 1200 }, { width: 600 }], thumbnail: true },
});
```

**Client**:

```tsx
import { useImageUpload } from '@lens-image/react';

function Uploader() {
  const { upload, items, progress, isUploading, error } = useImageUpload({
    endpoint: '/api/upload',
    maxBytes: 10 * 1024 * 1024,
    accept: ['image/*'],
  });

  return (
    <>
      <input type="file" multiple onChange={(e) => upload(e.target.files)} disabled={isUploading} />
      {isUploading && <progress value={progress} max={100} />}
      {error && <p role="alert">{error.message}</p>}
    </>
  );
}
```

Progress is real, from `XMLHttpRequest.upload.onprogress`, and weighted by file size. `fetch`
cannot report request-body progress in any shipping browser, so a fetch-based hook would have
to fake the bar.

---

## Error handling

Every failure is a `LensError` with a stable `code` and a suggested HTTP `status`:

```ts
import { LensError } from '@lens-image/core';

try {
  await optimizer.optimize({ source, validate: { maxBytes: 5_000_000 } });
} catch (error) {
  if (LensError.is(error, 'VALIDATION_FAILED')) {
    return Response.json({ error: error.message }, { status: error.status });  // 422
  }
  throw error;
}
```

| Code | Status | Means |
|---|---|---|
| `INVALID_SOURCE` | 400 | `source` was not a shape Lens understands |
| `SOURCE_UNREADABLE` | 400 | The file could not be read |
| `UNSUPPORTED_INPUT` | 415 | Bytes are not a recognisable image |
| `VALIDATION_FAILED` | 422 | Failed a size, dimension or format rule |
| `INVALID_OPTIONS` | 400 | Contradictory or out-of-range options |
| `ENGINE_UNAVAILABLE` | 500 | No codec, usually sharp is not installed |
| `ENCODE_FAILED` | 500 | The codec threw |
| `ALL_FORMATS_FAILED` | 500 | Nothing could be produced, fallback included |
| `UPLOAD_FAILED` | 502 | Storage failed after retries |
| `ADAPTER_REQUIRED` | 500 | The operation needs an adapter |
| `ADAPTER_UNSUPPORTED` | 501 | The adapter lacks an optional method |
| `ADAPTER_MISCONFIGURED` | 500 | Bad adapter construction options |
| `ABORTED` | 499 | Your `AbortSignal` fired |

### Graceful degradation

A per-format failure is a warning, not an exception:

```ts
const result = await optimizer.optimize({ source, formats: ['avif', 'webp', 'jpg'] });

// AVIF unavailable on this platform? You still get WebP and JPEG.
result.warnings;
// [{ code: 'format_unsupported', format: 'avif', message: '...' }]
```

Only a *total* failure throws. This is not hypothetical: prebuilt sharp binaries do not all
ship AV1.

---

## Safety defaults

Things that are on unless you turn them off, because getting them wrong is expensive:

- **Decompression-bomb guard.** A 100-megapixel limit, checked by parsing the header, before
  any decoder sees the bytes. A 40,000 by 40,000 PNG is roughly 6 GB decoded.
- **Format sniffing, not file extensions.** A `.jpg` that is actually an SVG is detected as SVG.
- **Path-traversal refusal.** `LocalAdapter` rejects any key that resolves outside its root.
- **Remote sources off by default.** Fetching user-supplied URLs is an SSRF surface.
- **Metadata stripped by default.** EXIF carries GPS coordinates.
- **No ACLs sent to S3 by default.** Modern buckets with Object Ownership enforced reject
  *any* ACL.

---

## Architecture

```
packages/
  core/               the engine, adapter contract, upload handler   0 deps
  adapter-local/      filesystem                                     0 deps
  adapter-s3/         S3 and anything that speaks it                 SDK is a peer
  adapter-cloudinary/ Cloudinary over plain fetch                    0 deps
  react/              headless upload hooks                          React is a peer
  docs/               the documentation site                         private
```

The build is `tsc` twice per package, once for ESM and once for CJS, and nothing else. No
bundler, by design: a library whose selling point is a readable dependency graph should not
need a hundred dev packages to produce a `dist`.

Strict mode with `noUncheckedIndexedAccess` on. Tests run on Node's built-in runner with no
framework.

---

## Development

```bash
npm install
npm run dev            # the docs site on :3000
npm run build          # all five packages, dual ESM and CJS
npm test               # 213 tests
npm run typecheck
npm run release:check  # enforces the promises made above
```

| Command | |
|---|---|
| `npm run dev` | Docs site on :3000 |
| `npm test core` | One package |
| `npm run test:watch` | |
| `npm run docs:build` | Static export to `packages/docs/out` |
| `npm run hero:build` | Regenerate the docs imagery through Lens itself |
| `npm run set-scope @you` | Rename the npm scope across the repo |
| `npm run example` | Run `examples/basic.mjs` |

**Requires Node 18.19 or newer.**

---

## Where this came from

Every app that accepts an image eventually grows the same three hundred lines: a resize loop,
a format matrix, a naming scheme, an S3 client, a retry, and a nagging suspicion that none of
it validates the input properly. I had written that file more than once and did not want to
write it again.

So the opinions here are the ones you arrive at after getting it wrong. Keys are
content-addressed because cache invalidation was the recurring bug. Formats fail independently
because one missing codec taking down an upload is infuriating. The pixel-count guard exists
because a byte-size limit does not stop a decompression bomb. sharp is a peer dependency
because a native binary appearing in a lockfile without being asked for is how you lose an
afternoon.

The docs hero is not stock art either. It is built by running photographs through Lens, and the
figure printed under it is what that run measured.

## Contributing

Issues and PRs welcome. [`CONTRIBUTING.md`](CONTRIBUTING.md) covers the rules that are not
negotiable, which are the ones the whole project exists for: zero dependencies in the core,
SDKs as peers, a Node-free browser entry point, and errors with stable codes.

## License

MIT
