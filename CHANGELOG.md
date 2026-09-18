# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

All five packages are released together at the same version.

## [0.1.2], 2026-09-18

### Fixed

- **npm's Homepage link landed on a bare file listing.** Every package set
  `homepage` to its own subdirectory, so clicking through from npm opened
  `lens-image/tree/main/packages/core`: no About panel, no tags, no README. It
  now points at the repository root. npm builds its separate "Repository" link
  from `repository`, which was already correct, so only one of the two links was
  ever wrong.
- **Docs links pointed at a dead host.** The site moved to
  `lens-image-docs.vercel.app` and `lens-image.vercel.app` now 404s.

### Changed

- `release-check` gained two rules: `homepage` may not point into a
  subdirectory, and the README's test-count badge has to match a real run rather
  than a number someone remembered to update.

## [0.1.1], 2026-09-18

### Fixed

- **sharp was not found on installations that have it.** `loadSharp` tried only
  a dynamic `import()`. sharp's own ESM entry point resolves `detect-libc` in a
  way some Node versions reject, so on a working installation the import threw
  `ERR_MODULE_NOT_FOUND` naming an inner file, `supports()` swallowed it,
  detection silently chose the passthrough engine, and the user was told to
  install a package they already had. Loading now falls back to `require`, which
  resolves sharp's CJS entry and is unaffected. Reproduced with sharp 0.35.4 and
  detect-libc 2.1.2 on Node 20.
- **The "not installed" error no longer fires when sharp is installed.** A
  failure to load is now reported as one, quoting what both loaders actually
  said, instead of sending people to reinstall a package that is already there.

### Changed

- **The declared Node floor is now 18.19.0**, up from 18.17.0. Nothing at
  runtime needed the bump. The test runner is `node --test --import tsx`, and
  `--import` landed in 18.19.0, so 18.17 could never actually be tested. The
  floor now says what CI verifies rather than what it hoped for.

## [0.1.0], 2026-09-18

First release.

### `@lens-image/core`

- `ImageOptimizer`: validate, plan, encode and store in one call, with
  `optimize`, `optimizeMany`, `inspect`, `delete` and `dispose`.
- **Zero runtime dependencies.** Enforced by `scripts/release-check.mjs`, which
  fails CI if anything lands in `dependencies`.
- **Pluggable codecs.** `ImageEngine` is three methods. `createSharpEngine`
  (sharp as an optional peer, lazily imported), `createPassthroughEngine` (no
  codec at all) and `detectEngine` ship in the box.
- **Pluggable storage.** `StorageAdapter` needs one method. `MemoryAdapter` is
  included as the reference implementation.
- **Header sniffing** for JPEG, PNG, GIF, WebP, AVIF/HEIC, TIFF, BMP, ICO and
  SVG: format, dimensions, alpha, animation and EXIF orientation, in pure
  TypeScript.
- **Validation before decode**: byte size, pixel count (decompression-bomb
  guard), dimension minimums and a format allowlist.
- **Graceful degradation.** A format that cannot be produced becomes a warning,
  not an exception; a total failure falls back to `fallbackFormat`.
- **Retries** with exponential backoff and full jitter on adapter writes. 4xx is
  never retried.
- **Bounded concurrency** via `mapLimit`, so a twelve-variant upload does not
  hold twelve decoded bitmaps at once.
- **Result caching**: `'memory'`, `'storage'` (existence-checked) or your own
  `CacheStore`.
- **Key templating** with `{name} {hash} {format} {ext} {width} {height}
  {quality} {label}`, or a function.
- `createUploadHandler`: a `Request → Response` upload endpoint built on web
  standards, so it works in Next.js, Remix, Hono, Bun and Deno unmodified.
- `@lens-image/core/browser`: a Node-free subset (sniffing, validation, key
  templating, srcset helpers) that bundles for browsers and edge runtimes. A
  test walks the import graph to keep it that way.
- `LensError` with 13 stable codes and suggested HTTP statuses.

### `@lens-image/adapter-local`

- Filesystem storage, zero dependencies.
- Atomic writes by default (temp file plus `rename`).
- Path-traversal refusal for any key that resolves outside the root.
- Filesystem errors translated to messages that name the likely cause.

### `@lens-image/adapter-s3`

- S3 and S3-compatible storage: R2, MinIO, Spaces, B2.
- `@aws-sdk/client-s3` is a peer dependency, lazily imported.
- No ACL is sent unless configured, so modern buckets with Object Ownership
  enforced work out of the box.
- SDK errors translated: `AccessDenied` names the IAM action to check,
  `PermanentRedirect` names the region mismatch.
- Metadata sanitised to header-safe ASCII.

### `@lens-image/adapter-cloudinary`

- Cloudinary storage with **zero dependencies**: signed uploads over `fetch`,
  with hand-rolled multipart encoding and `node:crypto` signing.
- `sign()` exported so the signature can be asserted on in tests.

### `@lens-image/react`

- `useImageUpload`: headless upload state with real progress from
  `XMLHttpRequest`, weighted by file size, with per-file status and cancellation.
- `useDropzone`: prop getters, with a depth-counted drag state that does not
  flicker over child elements.
- `toPictureProps` / `pickVariant`: `<picture>` props with intrinsic dimensions
  always set.
- `validateFile` / `matchesAccept`: client-side checks handling MIME types,
  wildcards and extensions.
- Zero dependencies; React is a peer.

[0.1.1]: https://github.com/Sthabiso10/lens-image/releases/tag/v0.1.1
[0.1.0]: https://github.com/Sthabiso10/lens-image/releases/tag/v0.1.0
