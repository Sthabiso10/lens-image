<p align="center">
  <a href="https://lens-image.vercel.app">
    <img src="https://raw.githubusercontent.com/Sthabiso10/lens-image/main/docs/media/logo.png?v=81977681" alt="Lens" width="300" />
  </a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@lens-image/adapter-local"><img alt="npm" src="https://img.shields.io/npm/v/@lens-image%2Fadapter-local.svg?color=cb3837" /></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6.svg" />
  <img alt="MIT license" src="https://img.shields.io/badge/license-MIT-blue.svg" />
</p>

# @lens-image/adapter-local

**Filesystem storage for [Lens](https://github.com/Sthabiso10/lens-image).** Zero dependencies, `node:fs/promises` and `node:path` do all of it.

```bash
npm install @lens-image/adapter-local
```

---

## Usage

```ts
import { ImageOptimizer } from '@lens-image/core';
import { LocalAdapter } from '@lens-image/adapter-local';

const optimizer = new ImageOptimizer({
  adapter: new LocalAdapter({
    root: './public/uploads',   // where files land
    baseUrl: '/uploads',        // how the browser reaches them
  }),
});

const result = await optimizer.optimize({ source: './photo.jpg', formats: ['webp'] });

result.variants[0].url;   // '/uploads/a1b2c3d4e5/photo-original.webp'
result.variants[0].key;   // 'a1b2c3d4e5/photo-original.webp'
```

---

## Options

| Option | Type | Default | |
|---|---|---|---|
| `root` | `string` | **required** | Directory keys are written under. Created on demand. |
| `baseUrl` | `string` |, | URL prefix mapping to `root`. Without it you get `file://` URLs. |
| `dirMode` | `number` | `0o755` | Mode for created directories. |
| `fileMode` | `number` | `0o644` | Mode for written files. |
| `atomic` | `boolean` | `true` | Write to a temp file, then `rename`. |
| `overwrite` | `boolean` | `true` | Allow replacing an existing key. |

---

## Atomic writes

On by default. Each file is written to `<target>.<random>.tmp` and then renamed into place.

`rename` is atomic within a filesystem, so a crash mid-write leaves the previous file intact rather than a truncated one, and a concurrent reader never sees a half-written image. The random suffix matters too: two processes optimizing the same image would otherwise pick the same temp name and clobber each other.

Turn it off only if `root` is on a filesystem where rename isn't atomic (some network mounts).

---

## Path traversal

Every key is resolved against `root` and rejected if it escapes:

```ts
await adapter.upload({ key: '../../../etc/passwd', /* … */ }, ctx);
// LensError: Refusing to write "../../../etc/passwd": it resolves outside
// the adapter root (/app/public/uploads).
```

Lens generates keys itself, but a custom `key` function could interpolate a user-supplied filename, so this has to be impossible here rather than assumed away upstream.

---

## Serving the files

### Next.js

Write into `public/` and the framework serves them:

```ts
new LocalAdapter({ root: './public/uploads', baseUrl: '/uploads' });
```

### Express

```ts
import express from 'express';

const adapter = new LocalAdapter({ root: './uploads', baseUrl: '/images' });

app.use('/images', express.static(adapter.root, {
  immutable: true,
  maxAge: '1y',   // safe: keys are content-addressed
}));
```

### Behind a CDN

Point `baseUrl` at the CDN and let it pull from your origin:

```ts
new LocalAdapter({ root: '/var/www/images', baseUrl: 'https://cdn.example.com' });
```

---

## Helpers

```ts
adapter.root;                      // absolute root directory
adapter.resolvePath('a/b.webp');   // absolute path for a key
adapter.getUrl('a/b.webp');        // public URL without writing
await adapter.exists('a/b.webp');
await adapter.remove('a/b.webp');  // no-op if already gone
```

---

## Error messages

Filesystem errors come back with the likely cause attached:

```
Could not write "a/b.webp" to /app/uploads/a/b.webp. Check that the process
can write to this directory.        ← EACCES / EPERM

Could not write "a/b.webp" to /app/uploads/a/b.webp. The disk is full.
                                    ← ENOSPC
```

All are `LensError` with `code: 'UPLOAD_FAILED'` and the original `errno` on `details.code`.

---

## License

MIT
