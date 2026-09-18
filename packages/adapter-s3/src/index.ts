/**
 * `@lens-image/adapter-s3` - AWS S3 and S3-compatible storage.
 *
 * `@aws-sdk/client-s3` is a **peer dependency**, not a dependency. It is ~15 MB
 * installed and you very likely already have it; pinning our own copy would
 * duplicate it in your bundle and fight your version choices. Install it
 * yourself:
 *
 * ```sh
 * npm install @lens-image/adapter-s3 @aws-sdk/client-s3
 * ```
 *
 * Works with anything that speaks the S3 API - Cloudflare R2, Backblaze B2,
 * MinIO, DigitalOcean Spaces - via `endpoint` and `forcePathStyle`.
 *
 * @packageDocumentation
 */

import { LensError } from '@lens-image/core';
import type { StorageAdapter, StorageContext, StorageFile, StorageObject } from '@lens-image/core';

// --- Structural typing of the sliver of the AWS SDK we touch ----------------

interface PutObjectInput {
  Bucket: string;
  Key: string;
  Body: Uint8Array;
  ContentType?: string;
  CacheControl?: string;
  Metadata?: Record<string, string>;
  ACL?: string;
  StorageClass?: string;
  ServerSideEncryption?: string;
  SSEKMSKeyId?: string;
  ContentDisposition?: string;
  [key: string]: unknown;
}

interface S3ClientLike {
  send(command: unknown, options?: { abortSignal?: AbortSignal }): Promise<Record<string, unknown>>;
  destroy?(): void;
}

/**
 * The shape of `@aws-sdk/client-s3` this adapter uses.
 *
 * Exported so you can satisfy it with a pre-imported module or a stub - see
 * {@link S3AdapterOptions.sdk}.
 */
export interface S3Module {
  S3Client: new (config: Record<string, unknown>) => S3ClientLike;
  PutObjectCommand: new (input: PutObjectInput) => unknown;
  HeadObjectCommand: new (input: { Bucket: string; Key: string }) => unknown;
  DeleteObjectCommand: new (input: { Bucket: string; Key: string }) => unknown;
}

let sdk: Promise<S3Module> | undefined;

async function loadSdk(): Promise<S3Module> {
  sdk ??= (async () => {
    try {
      const specifier = '@aws-sdk/client-s3';
      return (await import(/* @vite-ignore */ `${specifier}`)) as S3Module;
    } catch (error) {
      throw new LensError(
        'ADAPTER_MISCONFIGURED',
        '@lens-image/adapter-s3 needs @aws-sdk/client-s3, which is not installed. ' +
          'Run `npm install @aws-sdk/client-s3`. It is a peer dependency so that this adapter ' +
          'uses the same SDK version as the rest of your app.',
        { cause: error, details: { adapter: 's3' } },
      );
    }
  })();
  return sdk;
}

/** Options for {@link S3Adapter}. */
export interface S3AdapterOptions {
  /** Target bucket. Required. */
  readonly bucket: string;

  /** AWS region, e.g. `'us-east-1'`. Required unless you pass your own `client`. */
  readonly region?: string;

  /**
   * An existing `S3Client`.
   *
   * Prefer this in a real app: you get connection reuse, your own credential
   * chain, and no second copy of the SDK's config resolution.
   */
  readonly client?: S3ClientLike;

  /**
   * Explicit credentials. Omit to use the default AWS chain (environment,
   * shared config, IMDS, IRSA). Omitting is almost always correct.
   */
  readonly credentials?: {
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
    readonly sessionToken?: string;
  };

  /** Custom endpoint for S3-compatible services (R2, MinIO, Spaces). */
  readonly endpoint?: string;

  /** Required by MinIO and most self-hosted S3 services. Default `false`. */
  readonly forcePathStyle?: boolean;

  /** Prepended to every key. */
  readonly prefix?: string;

  /**
   * Object ACL, e.g. `'public-read'`.
   *
   * Left unset by default. Most modern buckets have "Block Public Access" and
   * Object Ownership enforced, where sending any ACL makes the request fail -
   * use a bucket policy or CloudFront instead.
   */
  readonly acl?: string;

  /** Storage class, e.g. `'INTELLIGENT_TIERING'`. */
  readonly storageClass?: string;

  /** Server-side encryption, e.g. `'AES256'` or `'aws:kms'`. */
  readonly serverSideEncryption?: string;

  /** KMS key id, when `serverSideEncryption` is `'aws:kms'`. */
  readonly kmsKeyId?: string;

  /**
   * Public URL base, e.g. `'https://cdn.example.com'`.
   *
   * Set this whenever a CDN fronts the bucket - otherwise URLs point at the
   * origin and every request bypasses your cache.
   */
  readonly publicUrl?: string;

  /** Extra `PutObject` parameters, merged last. Escape hatch for anything above. */
  readonly putObjectParams?: Record<string, unknown>;

  /**
   * A pre-imported `@aws-sdk/client-s3` module.
   *
   * By default the SDK is loaded with a dynamic `import()`, which keeps it out
   * of the dependency tree. Pass it explicitly when dynamic import is not
   * available to you - some bundler configurations and edge runtimes - or when
   * stubbing the SDK in tests.
   *
   * @example `import * as s3 from '@aws-sdk/client-s3'; new S3Adapter({ ..., sdk: s3 })`
   */
  readonly sdk?: S3Module;
}

/**
 * Stores optimized images in S3 or an S3-compatible bucket.
 *
 * @example AWS with a CloudFront distribution
 * ```ts
 * import { ImageOptimizer } from '@lens-image/core';
 * import { S3Adapter } from '@lens-image/adapter-s3';
 *
 * const optimizer = new ImageOptimizer({
 *   adapter: new S3Adapter({
 *     bucket: 'my-images',
 *     region: 'us-east-1',
 *     prefix: 'products',
 *     publicUrl: 'https://cdn.example.com',
 *   }),
 * });
 * ```
 *
 * @example Cloudflare R2
 * ```ts
 * new S3Adapter({
 *   bucket: 'images',
 *   region: 'auto',
 *   endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
 *   credentials: { accessKeyId: R2_KEY, secretAccessKey: R2_SECRET },
 *   publicUrl: 'https://images.example.com',
 * });
 * ```
 */
export class S3Adapter implements StorageAdapter {
  readonly name = 's3';

  readonly #options: S3AdapterOptions;
  readonly #prefix: string;
  readonly #ownsClient: boolean;
  #client: S3ClientLike | Promise<S3ClientLike>;

  constructor(options: S3AdapterOptions) {
    if (!options?.bucket) {
      throw new LensError(
        'ADAPTER_MISCONFIGURED',
        'S3Adapter needs a `bucket`, e.g. new S3Adapter({ bucket: "my-images", region: "us-east-1" }).',
        { details: { adapter: 's3' } },
      );
    }
    if (!options.region && !options.client && !options.endpoint) {
      throw new LensError(
        'ADAPTER_MISCONFIGURED',
        'S3Adapter needs a `region` (or your own `client`, or an `endpoint`). ' +
          'For R2 and most S3-compatible services, region is "auto".',
        { details: { adapter: 's3', bucket: options.bucket } },
      );
    }

    this.#options = options;
    this.#prefix = (options.prefix ?? '').replace(/^\/+|\/+$/g, '');
    this.#ownsClient = !options.client;
    this.#client = options.client ?? this.#createClient();
  }

  async upload(file: StorageFile, ctx: StorageContext): Promise<StorageObject> {
    const { PutObjectCommand } = await this.#sdk();
    const client = await this.#resolveClient();
    const key = this.#withPrefix(file.key);

    const input: PutObjectInput = {
      Bucket: this.#options.bucket,
      Key: key,
      Body: file.data,
      ContentType: file.contentType,
      ...(file.cacheControl ? { CacheControl: file.cacheControl } : {}),
      ...(file.metadata ? { Metadata: sanitizeMetadata(file.metadata) } : {}),
      ...(this.#options.acl ? { ACL: this.#options.acl } : {}),
      ...(this.#options.storageClass ? { StorageClass: this.#options.storageClass } : {}),
      ...(this.#options.serverSideEncryption
        ? { ServerSideEncryption: this.#options.serverSideEncryption }
        : {}),
      ...(this.#options.kmsKeyId ? { SSEKMSKeyId: this.#options.kmsKeyId } : {}),
      ...this.#options.putObjectParams,
    };

    let response: Record<string, unknown>;
    try {
      response = await client.send(
        new PutObjectCommand(input),
        ctx.signal ? { abortSignal: ctx.signal } : undefined,
      );
    } catch (error) {
      throw toLensError(error, key, this.#options.bucket);
    }

    return {
      key,
      url: this.getUrl(key),
      size: file.data.byteLength,
      ...(typeof response.ETag === 'string' ? { etag: response.ETag.replace(/"/g, '') } : {}),
      meta: {
        bucket: this.#options.bucket,
        ...(response.VersionId ? { versionId: response.VersionId } : {}),
      },
    };
  }

  async exists(key: string): Promise<boolean> {
    const { HeadObjectCommand } = await this.#sdk();
    const client = await this.#resolveClient();
    try {
      await client.send(new HeadObjectCommand({ Bucket: this.#options.bucket, Key: this.#withPrefix(key) }));
      return true;
    } catch (error) {
      const status = httpStatus(error);
      if (status === 404 || status === 403) return false;
      // A 500 is not "missing" - surface it rather than silently reprocessing.
      throw toLensError(error, key, this.#options.bucket);
    }
  }

  async remove(key: string): Promise<void> {
    const { DeleteObjectCommand } = await this.#sdk();
    const client = await this.#resolveClient();
    try {
      await client.send(new DeleteObjectCommand({ Bucket: this.#options.bucket, Key: this.#withPrefix(key) }));
    } catch (error) {
      throw toLensError(error, key, this.#options.bucket);
    }
  }

  /**
   * Public URL for a key.
   *
   * Uses `publicUrl` when configured, then `endpoint`, then the regional
   * virtual-hosted AWS URL.
   */
  getUrl(key: string): string {
    const full = this.#withPrefix(key);
    const path = full.split('/').map(encodeURIComponent).join('/');

    if (this.#options.publicUrl) {
      return `${this.#options.publicUrl.replace(/\/+$/, '')}/${path}`;
    }
    if (this.#options.endpoint) {
      const base = this.#options.endpoint.replace(/\/+$/, '');
      return this.#options.forcePathStyle
        ? `${base}/${this.#options.bucket}/${path}`
        : `${base}/${path}`;
    }
    const region = this.#options.region ?? 'us-east-1';
    const host =
      region === 'us-east-1'
        ? `${this.#options.bucket}.s3.amazonaws.com`
        : `${this.#options.bucket}.s3.${region}.amazonaws.com`;
    return `https://${host}/${path}`;
  }

  /** Closes the SDK client, but only if this adapter created it. */
  async dispose(): Promise<void> {
    if (!this.#ownsClient) return;
    const client = await this.#client;
    client.destroy?.();
  }

  /** The injected SDK module, or the lazily imported one. */
  #sdk(): Promise<S3Module> {
    return this.#options.sdk ? Promise.resolve(this.#options.sdk) : loadSdk();
  }

  async #createClient(): Promise<S3ClientLike> {
    const { S3Client } = await this.#sdk();
    return new S3Client({
      ...(this.#options.region ? { region: this.#options.region } : {}),
      ...(this.#options.credentials ? { credentials: this.#options.credentials } : {}),
      ...(this.#options.endpoint ? { endpoint: this.#options.endpoint } : {}),
      ...(this.#options.forcePathStyle !== undefined
        ? { forcePathStyle: this.#options.forcePathStyle }
        : {}),
    });
  }

  async #resolveClient(): Promise<S3ClientLike> {
    this.#client = await this.#client;
    return this.#client;
  }

  #withPrefix(key: string): string {
    return this.#prefix ? `${this.#prefix}/${key}` : key;
  }
}

/**
 * S3 user metadata travels in HTTP headers, so values must be ASCII and keys
 * must be header-safe. Anything else fails the request with a signature error
 * that gives no hint about which key was at fault.
 */
function sanitizeMetadata(metadata: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    const safeKey = key.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
    // Dropping non-ASCII can leave stray whitespace behind ("café ☕" -> "caf "),
    // so collapse and trim rather than shipping a value with a dangling space.
    const safeValue = String(value)
      .replace(/[^\x20-\x7e]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (safeKey && safeValue) out[safeKey] = safeValue;
  }
  return out;
}

function httpStatus(error: unknown): number | undefined {
  const err = error as { $metadata?: { httpStatusCode?: number }; statusCode?: number; name?: string };
  if (err?.name === 'NotFound' || err?.name === 'NoSuchKey') return 404;
  return err?.$metadata?.httpStatusCode ?? err?.statusCode;
}

/** Turns SDK errors into `LensError`s with messages that name the likely cause. */
function toLensError(error: unknown, key: string, bucket: string): LensError {
  if (LensError.is(error)) return error;

  const err = error as { name?: string; message?: string; Code?: string };
  const status = httpStatus(error);
  const code = err?.name ?? err?.Code ?? 'UnknownError';

  const hint =
    code === 'AccessDenied' || status === 403
      ? ' Check the IAM policy grants s3:PutObject on this bucket, and that any configured ACL is allowed by Object Ownership settings.'
      : code === 'NoSuchBucket'
        ? ` The bucket "${bucket}" does not exist in this region.`
        : code === 'InvalidAccessKeyId' || code === 'SignatureDoesNotMatch'
          ? ' The credentials are invalid or the region does not match the bucket.'
          : code === 'PermanentRedirect'
            ? ` The bucket "${bucket}" lives in a different region than the one configured.`
            : '';

  const lensError = new LensError(
    'UPLOAD_FAILED',
    `S3 ${code} for "${key}" in "${bucket}".${hint}`,
    { cause: error, details: { adapter: 's3', key, bucket, code, ...(status ? { status } : {}) } },
  );
  return lensError;
}

/** Test seam: forget the memoised AWS SDK import. */
export function resetS3Sdk(): void {
  sdk = undefined;
}

export default S3Adapter;
