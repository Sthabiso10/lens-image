<p align="center">
  <a href="https://lens-image.vercel.app">
    <img src="https://raw.githubusercontent.com/Sthabiso10/lens-image/main/docs/media/logo.png?v=81977681" alt="Lens" width="300" />
  </a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@lens-image/adapter-cloudinary"><img alt="npm" src="https://img.shields.io/npm/v/@lens-image%2Fadapter-cloudinary.svg?color=cb3837" /></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6.svg" />
  <img alt="MIT license" src="https://img.shields.io/badge/license-MIT-blue.svg" />
</p>

# @lens-image/adapter-cloudinary

**Cloudinary storage for [Lens](https://github.com/Sthabiso10/lens-image).** Zero dependencies. The official `cloudinary` package is not required.

```bash
npm install @lens-image/adapter-cloudinary
```

Signed uploads are an HTTP POST with a SHA-1 signature, which `node:crypto` and the built-in `fetch` cover in a couple of hundred lines. Install cost: **zero packages**.

---

## Usage

```ts
import { ImageOptimizer } from '@lens-image/core';
import { CloudinaryAdapter } from '@lens-image/adapter-cloudinary';

const optimizer = new ImageOptimizer({
  adapter: new CloudinaryAdapter({
    cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
    apiKey: process.env.CLOUDINARY_API_KEY!,
    apiSecret: process.env.CLOUDINARY_API_SECRET!,
    folder: 'products',
  }),
});

const result = await optimizer.optimize({ source: './photo.jpg', formats: ['webp'] });
result.variants[0].url;
// 'https://res.cloudinary.com/demo/image/upload/v1699.../products/a1b2.../photo.webp'
```

> `apiSecret` is server-side only. Never ship it to a browser.

---

## Should you use this?

Worth being straight about it: **Cloudinary already does transformation.** If it's your only image pipeline, its own URL-based transforms are usually the simpler answer.

This adapter earns its place when:

- **You want Lens to own the pipeline.** Identical output across S3, disk and Cloudinary, with Cloudinary as the CDN.
- **You're migrating**, in either direction, and want one code path during the transition.
- **You need deterministic output.** Lens produces exactly the variants you asked for, at keys you control, rather than transforms generated on request.

If none of those apply, use Cloudinary directly.

---

## Options

| Option | Type | |
|---|---|---|
| `cloudName` | `string` | **Required.** |
| `apiKey` | `string` | **Required.** |
| `apiSecret` | `string` | **Required.** Server-side only. |
| `folder` | `string` | Asset folder, combined with the key path. |
| `overwrite` | `boolean` | Default `true`. |
| `tags` | `string[]` | Applied to every upload. Handy for bulk cleanup. |
| `resourceType` | `'image' \| 'raw' \| 'auto'` | Default `'image'`. |
| `uploadPreset` | `string` | For preset-driven accounts. |
| `publicUrl` | `string` | Custom CDN hostname. |
| `timeoutMs` | `number` | Default `60000`. |
| `fetch` | `typeof fetch` | Injectable, for proxy agents and tests. |

---

## Keys and public IDs

Cloudinary infers format from the uploaded bytes, so the extension is stripped from the key to form the `public_id`:

```
key        a1b2c3d4e5/photo-600w.webp
public_id  products/a1b2c3d4e5/photo-600w      ← folder prepended
```

Because Lens keys are content-addressed, re-uploading identical bytes writes the same content to the same public ID, `overwrite: true` is a no-op in practice.

---

## URLs

Prefer `variant.url` from the upload result. It includes Cloudinary's `v<version>` segment, which is what makes its immutable caching work.

`adapter.getUrl(key)` predicts an **unversioned** URL (valid, but it skips that caching) because the version isn't knowable before the upload happens.

With a custom CDN hostname, `publicUrl` rewrites the host while preserving the version segment:

```ts
new CloudinaryAdapter({ ...credentials, publicUrl: 'https://images.example.com' });
// → https://images.example.com/demo/image/upload/v123/products/photo.webp
```

---

## Metadata

`optimize({ metadata })` is encoded into Cloudinary's `context` field:

```ts
await optimizer.optimize({ source, metadata: { alt: 'A cat', by: 'sam' } });
// → context: 'alt=A cat|by=sam'
```

`|` and `=` are stripped from keys and values, since they're the delimiters.

---

## How signing works

Cloudinary's signature is SHA-1 of the signed parameters sorted by key, joined `k=v&k=v`, with the API secret **appended** (not used as a separator). `file`, `api_key` and `resource_type` are excluded.

The `sign()` function is exported so you can assert on it, getting this wrong produces an opaque 401 that says nothing useful:

```ts
import { sign } from '@lens-image/adapter-cloudinary';

sign({ public_id: 'sample', timestamp: '1700000000' }, apiSecret);
```

---

## Permissions

The upload path needs only your API key and secret. `exists()` additionally uses the **Admin API** (`/resources/...`) with HTTP basic auth, which is rate-limited more aggressively, relevant if you enable `cache: 'storage'`.

---

## License

MIT
