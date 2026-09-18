<p align="center">
  <a href="https://lens-image.vercel.app">
    <img src="https://raw.githubusercontent.com/Sthabiso10/lens-image/main/docs/media/logo.png" alt="Lens" width="300" />
  </a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@lens-image/adapter-s3"><img alt="npm" src="https://img.shields.io/npm/v/@lens-image%2Fadapter-s3.svg?color=cb3837" /></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6.svg" />
  <img alt="MIT license" src="https://img.shields.io/badge/license-MIT-blue.svg" />
</p>

# @lens-image/adapter-s3

**S3 storage for [Lens](https://github.com/Sthabiso10/lens-image).** Works with AWS S3 and anything that speaks the S3 API: Cloudflare R2, MinIO, DigitalOcean Spaces, Backblaze B2.

```bash
npm install @lens-image/adapter-s3 @aws-sdk/client-s3
```

`@aws-sdk/client-s3` is a **peer dependency**. It's ~15 MB installed and you almost certainly already have it; pinning our own copy would duplicate it and fight your version choices.

---

## Usage

```ts
import { ImageOptimizer } from '@lens-image/core';
import { S3Adapter } from '@lens-image/adapter-s3';

const optimizer = new ImageOptimizer({
  adapter: new S3Adapter({
    bucket: 'my-images',
    region: 'us-east-1',
    prefix: 'products',
    publicUrl: 'https://cdn.example.com',   // your CloudFront distribution
  }),
});

const result = await optimizer.optimize({
  source: './photo.jpg',
  formats: ['webp', 'jpg'],
  sizes: [{ width: 1200 }, { width: 600 }],
});

result.formats.webp.urls['600w'];
// 'https://cdn.example.com/products/a1b2c3d4e5/photo-600w.webp'
```

---

## Options

| Option | Type | |
|---|---|---|
| `bucket` | `string` | **Required.** |
| `region` | `string` | Required unless you pass `client` or `endpoint`. |
| `client` | `S3Client` | Your own client. **Preferred in production**, see below. |
| `credentials` | `{ accessKeyId, secretAccessKey, sessionToken? }` | Omit to use the default AWS chain. |
| `endpoint` | `string` | For R2, MinIO, Spaces. |
| `forcePathStyle` | `boolean` | Required by MinIO and most self-hosted S3. |
| `prefix` | `string` | Prepended to every key. |
| `acl` | `string` | **Unset by default**, see [ACLs](#a-note-on-acls). |
| `storageClass` | `string` | e.g. `'INTELLIGENT_TIERING'`. |
| `serverSideEncryption` | `string` | `'AES256'` or `'aws:kms'`. |
| `kmsKeyId` | `string` | With `'aws:kms'`. |
| `publicUrl` | `string` | CDN base. **Set this if a CDN fronts the bucket.** |
| `putObjectParams` | `object` | Merged last into `PutObject`. Escape hatch. |
| `sdk` | `S3Module` | Pre-imported SDK, for bundler-constrained runtimes and tests. |

### Reuse your own client

```ts
import { S3Client } from '@aws-sdk/client-s3';

const client = new S3Client({ region: 'us-east-1' });

new S3Adapter({ bucket: 'my-images', client });
```

You get connection reuse and your own credential chain, and the adapter won't destroy a client it didn't create.

---

## Other providers

### Cloudflare R2

```ts
new S3Adapter({
  bucket: 'images',
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_KEY, secretAccessKey: R2_SECRET },
  publicUrl: 'https://images.example.com',
});
```

### MinIO

```ts
new S3Adapter({
  bucket: 'images',
  endpoint: 'http://localhost:9000',
  forcePathStyle: true,
  credentials: { accessKeyId: 'minioadmin', secretAccessKey: 'minioadmin' },
});
```

### DigitalOcean Spaces

```ts
new S3Adapter({
  bucket: 'my-space',
  region: 'nyc3',
  endpoint: 'https://nyc3.digitaloceanspaces.com',
  publicUrl: 'https://my-space.nyc3.cdn.digitaloceanspaces.com',
});
```

---

## A note on ACLs

`acl` is **unset by default**, and that's deliberate. Buckets created since April 2023 have S3 Block Public Access on and Object Ownership set to *Bucket owner enforced*, where sending **any** ACL, including `'private'`, makes the request fail with `AccessControlListNotSupported`.

Make objects public with a bucket policy or a CloudFront origin access control instead. If your bucket genuinely uses ACLs, set `acl: 'public-read'` explicitly.

---

## Error messages

The adapter translates SDK errors into ones that name the likely cause:

```ts
// AccessDenied →
// 'S3 AccessDenied for "a/b.webp" in "my-images". Check the IAM policy grants
//  s3:PutObject on this bucket, and that any configured ACL is allowed by
//  Object Ownership settings.'

// PermanentRedirect →
// 'S3 PermanentRedirect for "a/b.webp" in "my-images". The bucket "my-images"
//  lives in a different region than the one configured.'
```

All are `LensError` with `code: 'UPLOAD_FAILED'` and `details.{ bucket, key, code, status }`.

### Retries

Handled by the core. Transient failures (`ECONNRESET`, throttling, 5xx) are retried with exponential backoff and full jitter. 4xx responses are never retried, because a 403 from a bad IAM policy will still be a 403 in 800 ms.

```ts
new ImageOptimizer({ adapter, retry: { attempts: 5, baseDelayMs: 300 } });
```

---

## Metadata

`optimize({ metadata })` maps to S3 user metadata, sanitised to header-safe ASCII first, non-ASCII values otherwise produce a signature error that names no key.

```ts
await optimizer.optimize({ source, metadata: { uploadedBy: 'user-42' } });
// → x-amz-meta-uploadedby: user-42
```

---

## IAM policy

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
    "Resource": "arn:aws:s3:::my-images/*"
  }]
}
```

`s3:GetObject` is only needed for `cache: 'storage'` (which calls `HeadObject`), and `s3:DeleteObject` for `optimizer.delete()`.

---

## License

MIT
