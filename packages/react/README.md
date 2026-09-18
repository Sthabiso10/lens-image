<p align="center">
  <a href="https://lens-image.vercel.app">
    <img src="https://raw.githubusercontent.com/Sthabiso10/lens-image/main/docs/media/logo.png" alt="Lens" width="300" />
  </a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@lens-image/react"><img alt="npm" src="https://img.shields.io/npm/v/@lens-image%2Freact.svg?color=cb3837" /></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6.svg" />
  <img alt="MIT license" src="https://img.shields.io/badge/license-MIT-blue.svg" />
</p>

# @lens-image/react

**Headless React hooks for [Lens](https://github.com/Sthabiso10/lens-image) uploads.** State management only, no components, no CSS, no portals.

```bash
npm install @lens-image/react
```

Zero dependencies. React is a peer (`>=18`).

---

## `useImageUpload`

```tsx
import { useImageUpload } from '@lens-image/react';

function Uploader() {
  const { upload, items, progress, isUploading, error, reset } = useImageUpload({
    endpoint: '/api/upload',
    maxBytes: 10 * 1024 * 1024,
    accept: ['image/*'],
  });

  return (
    <>
      <input
        type="file"
        multiple
        accept="image/*"
        disabled={isUploading}
        onChange={(e) => upload(e.target.files)}
      />

      {isUploading && <progress value={progress} max={100} />}
      {error && <p role="alert">{error.message}</p>}

      {items.map((item) => (
        <figure key={item.id}>
          <img src={item.result?.thumbnail?.url ?? item.previewUrl} alt="" />
          <figcaption>{item.file.name}, {item.status} {item.progress}%</figcaption>
        </figure>
      ))}
    </>
  );
}
```

Pair it with `createUploadHandler` from [`@lens-image/core`](../core#upload-handler) on the server.

### Options

| Option | Type | Default | |
|---|---|---|---|
| `endpoint` | `string` | **required** | Where to POST. |
| `fieldName` | `string` | `'file'` | Must match the server's. |
| `headers` | `object` |, | Auth tokens, CSRF. Don't set `Content-Type`. |
| `fields` | `object` |, | Extra multipart fields. |
| `credentials` | `RequestCredentials` | `'same-origin'` | |
| `batch` | `boolean` | `false` | One request for all files instead of one each. |
| `maxBytes` / `accept` / `maxFiles` | | | Client-side checks. |
| `preview` | `boolean` | `true` | Generate local object URLs. |
| `parseResponse` | `(payload) => UploadedImage[]` |, | For a custom response shape. |
| `onSuccess` / `onError` / `onComplete` | | | Callbacks. |

### Returns

| | |
|---|---|
| `items` | Every tracked file, with `status`, `progress`, `result`, `error`, `previewUrl`. |
| `images` | Successful results only. |
| `isUploading` | Any file in flight. |
| `progress` | 0-100, **weighted by byte count**. |
| `error` | First error in the queue. |
| `status` | `'idle' \| 'uploading' \| 'success' \| 'error' \| 'cancelled'`. |
| `upload(files)` | Accepts a `FileList`, an array, or a single `File`. |
| `cancel()` / `reset()` / `remove(id)` | |

---

## Two things this gets right

**Progress is real.** It comes from `XMLHttpRequest.upload.onprogress`. `fetch` cannot report request-body progress in any shipping browser. A fetch-based hook has to fake the bar or only move it at 0% and 100%.

**Progress is weighted by size.** A 40 KB icon finishing shouldn't push a bar that's tracking a 12 MB photo to 50%.

Object URLs are also revoked on `reset`, `remove` and unmount, which is otherwise a documented memory leak.

---

## `useDropzone`

Prop getters, not components. Spread them onto markup you're already styling.

```tsx
import { useImageUpload, useDropzone } from '@lens-image/react';

function DropTarget() {
  const { upload } = useImageUpload({ endpoint: '/api/upload' });
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: upload,
    accept: 'image/*',
  });

  return (
    <div {...getRootProps()} data-active={isDragActive} className="dropzone">
      <input {...getInputProps()} />
      <p>Drop images here, or <button type="button" onClick={open}>browse</button>.</p>
    </div>
  );
}
```

`isDragActive` is tracked with an enter/leave depth counter, so it doesn't flicker as the cursor crosses child elements. The bug every hand-rolled dropzone ships with first.

---

## Rendering results

```tsx
import { toPictureProps } from '@lens-image/react';

function Optimized({ image, alt }) {
  const { sources, img } = toPictureProps(image, {
    alt,
    sizes: '(max-width: 768px) 100vw, 50vw',
  });

  return (
    <picture>
      {sources.map((source) => <source key={source.type} {...source} />)}
      <img {...img} />
    </picture>
  );
}
```

Source order follows the server's `formats` array, so `['avif', 'webp', 'jpg']` yields the right progressive-enhancement ladder. `width` and `height` are always set. A missing intrinsic size is the most common cause of layout shift on image-heavy pages.

```ts
import { pickVariant } from '@lens-image/react';

pickVariant(image, 800, 'webp');   // smallest variant ≥ 800px, never an upscale
```

---

## Validation helpers

```ts
import { validateFile, matchesAccept, formatBytes } from '@lens-image/react';

validateFile(file, { maxBytes: 5_000_000, accept: ['image/*', '.heic'] });
// null, or { code: 'FILE_TOO_LARGE', message: '"big.jpg" is 5.7 MB, over the 4.8 MB limit.' }
```

`accept` handles all three HTML forms: exact MIME (`image/png`), wildcard (`image/*`) and extension (`.heic`). Extensions matter, browsers report an empty `type` for formats they don't recognise, which is exactly the case for newer image formats.

> Client-side validation is a courtesy to the user, not a security control. The server validates independently.

---

## Error codes

| Code | |
|---|---|
| `FILE_TOO_LARGE` | Client-side size check |
| `FILE_TYPE_REJECTED` | Client-side type check |
| `NETWORK_ERROR` | Request never reached the server |
| `TIMEOUT` | |
| `CANCELLED` | `cancel()` or unmount |
| `INVALID_RESPONSE` | Server returned non-JSON |
| `EMPTY_RESPONSE` | 2xx with no image data |
| *(server codes)* | `VALIDATION_FAILED`, `UPLOAD_FAILED`, … passed straight through |

---

## Server-side rendering

Both hooks are client-only. They touch `XMLHttpRequest` and `URL.createObjectURL`. In Next.js App Router, mark the component `'use client'`. The pure helpers (`toPictureProps`, `pickVariant`, `validateFile`, `formatBytes`) are safe to run anywhere.

---

## License

MIT
