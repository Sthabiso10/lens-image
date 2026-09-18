<p align="center">
  <a href="https://lens-image.vercel.app">
    <img src="https://raw.githubusercontent.com/Sthabiso10/lens-image/main/docs/media/logo.png?v=81977681" alt="Lens" width="300" />
  </a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@lens-image/core"><img alt="npm" src="https://img.shields.io/npm/v/@lens-image%2Fcore.svg?color=cb3837" /></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6.svg" />
  <img alt="MIT license" src="https://img.shields.io/badge/license-MIT-blue.svg" />
</p>

# @lens-image/core

**Zero-dependency image optimization engine for Node.js.** Resize, compress, convert formats, and hand the results to any storage backend.

```bash
npm install @lens-image/core sharp
```

`sharp` is an [optional peer dependency](#the-engine). `@lens-image/core` itself installs **zero packages**.

---

## Quick start

```ts
import { ImageOptimizer, MemoryAdapter } from '@lens-image/core';

const optimizer = new ImageOptimizer({ adapter: new MemoryAdapter() });

const result = await optimizer.optimize({
  source: './photo.jpg',
  formats: ['webp', 'jpg'],
  sizes: [{ width: 1200 }, { width: 600 }, { width: 300 }],
});

result.formats.webp.srcset;
```

Swap `MemoryAdapter` for [`@lens-image/adapter-s3`](../adapter-s3), [`@lens-image/adapter-local`](../adapter-local) or [`@lens-image/adapter-cloudinary`](../adapter-cloudinary) when you want the bytes to go somewhere real.

---

## `new ImageOptimizer(options)`

| Option | Type | Default | |
|---|---|---|---|
| `adapter` | `StorageAdapter` |, | Where output goes. Omit for process-only mode. |
| `engine` | `ImageEngine` | auto | Codec backend. Defaults to sharp if installed. |
| `quality` | `number` | per-format | 1-100. |
| `formats` | `ImageFormat[]` | `['webp']` | Default output formats. |
| `sizes` | `SizeSpec[]` | original | Default responsive sizes. |
| `fallbackFormat` | `ImageFormat \| null` | `'jpeg'` | Used when everything else fails. `null` disables. |
| `key` | `string \| fn` | `'{hash}/{name}-{label}.{ext}'` | Output key template. |
| `prefix` | `string` | `''` | Prepended to every key. |
| `preserveMetadata` | `boolean` | `false` | Keep EXIF/ICC/XMP. |
| `autoOrient` | `boolean` | `true` | Apply EXIF orientation before resizing. |
| `concurrency` | `number` | `4` | Parallel encode+upload pipelines. |
| `validate` | `ValidationOptions \| false` | see below | Input limits. |
| `retry` | `RetryOptions` | 3 attempts | Adapter write retries. |
| `cache` | `false \| 'memory' \| 'storage' \| CacheStore` | `false` | Result caching. |
| `cacheControl` | `string` | `public, max-age=31536000, immutable` | Applied to uploads. |
| `allowRemote` | `boolean` | `false` | Permit `http(s):` sources. |
| `onWarning` | `(w) => void` |, | Called per degradation. |

Everything except `adapter`, `engine`, `cache` and `allowRemote` can be overridden per call.

---

## `optimizer.optimize(options)`

```ts
await optimizer.optimize({
  source: './photo.jpg',
  formats: ['avif', 'webp', 'jpg'],
  sizes: [{ width: 1200 }, { width: 600, fit: 'contain' }],
  thumbnail: { width: 128, format: 'webp' },
  metadata: { uploadedBy: 'user-42' },
  signal: controller.signal,
});
```

### `source` accepts

| | |
|---|---|
| `string` | Filesystem path |
| `Uint8Array` / `Buffer` | Raw bytes |
| `URL` | `file:`, or `http(s):` with `allowRemote` |
| `AsyncIterable<Uint8Array>` | Node or web stream, multipart part |
| `{ data, filename }` | Bytes plus a name for key generation |

### Sizes

```ts
sizes: [
  { width: 1200 },                                    // → label '1200w'
  { width: 400, height: 400, fit: 'cover' },          // → label '400x400'
  { width: 800, label: 'hero', quality: 90 },         // explicit label
]
```

`fit` is `'cover' | 'contain' | 'fill' | 'inside' | 'outside'`. The familiar CSS names. Images are never upscaled unless you set `withoutEnlargement: false`.

> Two sizes that produce the same label within one format throw `INVALID_OPTIONS`, because they'd map to the same key and one would silently overwrite the other.

---

## The result

```ts
interface OptimizeResult {
  id: string;             // stable per (source, options), also the cache key
  runId: string;          // unique per call, for log correlation
  source: ImageMetadata & { filename: string; checksum: string };
  formats: { webp?: FormatResult; jpeg?: FormatResult; /* … */ };
  variants: Variant[];    // flat, in plan order
  thumbnail?: Variant;
  warnings: LensWarning[];
  totalSize: number;
  savings: number;        // 0-1, vs the largest single output
  durationMs: number;
  cached: boolean;
  engine: string;
  adapter: string | null;
}
```

Each `FormatResult` carries `urls` (keyed by label), `variants`, `srcset`, `size`, `largest` and `smallest`.

> **Note on `jpg`.** It's accepted everywhere as an input alias and normalised to `jpeg`, so results are always keyed `result.formats.jpeg`. File extensions still come out as `.jpg`.

---

## Other methods

```ts
await optimizer.inspect(source);              // metadata only, no processing
await optimizer.optimizeMany([a, b], opts);   // sequential, bounded memory
await optimizer.delete(result);               // remove every variant
await optimizer.dispose();                    // release adapter resources
```

---

## Validation

Runs against the **file header**, before any decoder sees the bytes.

```ts
validate: {
  maxBytes: 25 * 1024 * 1024,     // default
  maxPixels: 100_000_000,         // default, decompression-bomb guard
  allowedFormats: ['jpeg', 'png', 'webp', 'avif', 'gif', 'tiff'],
  minWidth: 200,
  minHeight: 200,
}
```

Set `validate: false` to disable. The `maxPixels` guard matters: a 40,000 × 40,000 PNG compresses to a few hundred KB and expands to roughly 6 GB in memory.

---

## The engine

The codec is an interface, not a hard dependency:

```ts
interface ImageEngine {
  readonly name: string;
  supports(format: ImageFormat): boolean | Promise<boolean>;
  probe(input: Uint8Array): Promise<ImageMetadata>;
  transform(input: Uint8Array, op: TransformOp): Promise<EncodedImage>;
}
```

| Engine | |
|---|---|
| `createSharpEngine(opts)` | sharp-backed. Lazy dynamic import, nothing loads until you encode. |
| `createPassthroughEngine()` | No codec. Validates, hashes, keys and stores originals. Ideal for tests. |
| `detectEngine()` | sharp if available, otherwise passthrough. The default. |

```ts
import { createSharpEngine } from '@lens-image/core';

new ImageOptimizer({
  engine: createSharpEngine({
    threads: 1,      // we already parallelise; 4 Lens jobs × 4 libvips threads = 16
    cache: false,    // libvips' global cache is a leak in a long-lived server
  }),
});
```

---

## Upload handler

A `Request → Response` function built only on web standards, so it drops into Next.js, Remix, Hono, Bun or Deno unmodified.

```ts
export const POST = createUploadHandler({
  optimizer,
  fieldName: 'file',
  maxFiles: 5,
  authorize: async (req) => (await auth(req)) ? undefined : new Response('no', { status: 401 }),
  options: async (req) => ({ prefix: `users/${(await auth(req)).id}` }),
  onError: (error) => logger.error(error),
});
```

Errors map to their `LensError.status` automatically. A too-large file is a 422, not a 500. Unexpected errors return a generic message; the real one goes to `onError`.

---

## HTML helpers

```ts
import { toPicture, pickVariant, buildSrcset } from '@lens-image/core';

const pic = toPicture(result, { alt: 'Cabin', sizes: '(max-width: 768px) 100vw, 50vw' });
const best = pickVariant(result, 800, 'webp');   // smallest variant ≥ 800px
```

---

## Exports for adapter authors

```ts
import {
  sniff, mimeTypeFor, extensionFor,        // format detection
  buildKey, joinKey, slugify,              // key templating
  withRetry, isRetryableError,             // retry
  mapLimit,                                // bounded concurrency
  sha256, shortHash,                       // hashing
  LensError,                               // error taxonomy
} from '@lens-image/core';
```

---

## License

MIT
