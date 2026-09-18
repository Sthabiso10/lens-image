/**
 * `@lens-image/adapter-cloudinary` - Cloudinary storage.
 *
 * **Zero dependencies.** The official `cloudinary` package is not required:
 * signed uploads are an HTTP POST with a SHA-1 signature, which `node:crypto`
 * and the built-in `fetch` cover in a couple of hundred lines. That keeps the
 * install cost of this adapter at exactly zero packages.
 *
 * A note on what this adapter is for. Cloudinary does its own transformation,
 * so pushing Lens-optimized derivatives into it can be redundant. It earns its
 * place when you want Lens to own the pipeline - identical output across S3,
 * disk and Cloudinary - and Cloudinary purely as the CDN, or when you are
 * migrating in either direction and want one code path.
 *
 * @packageDocumentation
 */

import { createHash } from 'node:crypto';
import { LensError } from '@lens-image/core';
import type { StorageAdapter, StorageContext, StorageFile, StorageObject } from '@lens-image/core';

/** Options for {@link CloudinaryAdapter}. */
export interface CloudinaryAdapterOptions {
  /** Your cloud name. Required. */
  readonly cloudName: string;

  /** API key. Required for signed uploads. */
  readonly apiKey: string;

  /** API secret. Required for signed uploads. Never ship this to a browser. */
  readonly apiSecret: string;

  /** Asset folder. Combined with the key path. */
  readonly folder?: string;

  /**
   * Overwrite an existing `public_id`. Default `true`.
   *
   * Lens keys are content-addressed, so re-uploading the same image writes the
   * same bytes to the same id - overwriting is a no-op in practice.
   */
  readonly overwrite?: boolean;

  /** Tags applied to every upload. Handy for bulk cleanup. */
  readonly tags?: readonly string[];

  /** Cloudinary resource type. Default `'image'`. */
  readonly resourceType?: 'image' | 'raw' | 'auto';

  /** Upload preset name, for preset-driven accounts. */
  readonly uploadPreset?: string;

  /** Custom CDN hostname, when you have one configured. */
  readonly publicUrl?: string;

  /** Request timeout in ms. Default 60000. */
  readonly timeoutMs?: number;

  /** Injectable `fetch`, for tests and for proxy agents. */
  readonly fetch?: typeof fetch;
}

/** Options after the constructor has proved the credentials are present. */
type ResolvedCloudinaryOptions = CloudinaryAdapterOptions &
  Required<Pick<CloudinaryAdapterOptions, 'cloudName' | 'apiKey' | 'apiSecret'>>;

interface CloudinaryUploadResponse {
  public_id?: string;
  secure_url?: string;
  url?: string;
  bytes?: number;
  etag?: string;
  version?: number;
  format?: string;
  width?: number;
  height?: number;
  error?: { message?: string };
}

/**
 * Stores optimized images in Cloudinary.
 *
 * @example
 * ```ts
 * import { ImageOptimizer } from '@lens-image/core';
 * import { CloudinaryAdapter } from '@lens-image/adapter-cloudinary';
 *
 * const optimizer = new ImageOptimizer({
 *   adapter: new CloudinaryAdapter({
 *     cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
 *     apiKey: process.env.CLOUDINARY_API_KEY!,
 *     apiSecret: process.env.CLOUDINARY_API_SECRET!,
 *     folder: 'products',
 *   }),
 * });
 * ```
 */
export class CloudinaryAdapter implements StorageAdapter {
  readonly name = 'cloudinary';

  readonly #options: ResolvedCloudinaryOptions;
  readonly #fetch: typeof fetch;
  readonly #resourceType: string;

  constructor(options: CloudinaryAdapterOptions) {
    const missing = (['cloudName', 'apiKey', 'apiSecret'] as const).filter((k) => !options?.[k]);
    if (missing.length > 0) {
      throw new LensError(
        'ADAPTER_MISCONFIGURED',
        `CloudinaryAdapter is missing required option(s): ${missing.join(', ')}. ` +
          'All three come from your Cloudinary dashboard; keep apiSecret server-side only.',
        { details: { adapter: 'cloudinary', missing } },
      );
    }

    this.#options = options as ResolvedCloudinaryOptions;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#resourceType = options.resourceType ?? 'image';

    if (typeof this.#fetch !== 'function') {
      throw new LensError(
        'ADAPTER_MISCONFIGURED',
        'No global fetch available. Use Node 18+, or pass your own via the `fetch` option.',
        { details: { adapter: 'cloudinary' } },
      );
    }
  }

  async upload(file: StorageFile, ctx: StorageContext): Promise<StorageObject> {
    const publicId = this.#publicId(file.key);
    const timestamp = Math.floor(Date.now() / 1000);

    // Only these params are signed; `file`, `api_key` and `resource_type` are
    // excluded by Cloudinary's signature rules.
    const signed: Record<string, string> = {
      public_id: publicId,
      timestamp: String(timestamp),
      overwrite: String(this.#options.overwrite ?? true),
      ...(this.#options.folder ? { folder: this.#options.folder } : {}),
      ...(this.#options.tags?.length ? { tags: this.#options.tags.join(',') } : {}),
      ...(this.#options.uploadPreset ? { upload_preset: this.#options.uploadPreset } : {}),
      ...(file.metadata ? { context: encodeContext(file.metadata) } : {}),
    };

    const body = buildMultipart({
      ...signed,
      api_key: this.#options.apiKey,
      signature: sign(signed, this.#options.apiSecret),
    }, file);

    const response = await this.#request(
      `https://api.cloudinary.com/v1_1/${this.#options.cloudName}/${this.#resourceType}/upload`,
      { method: 'POST', body: toBodyInit(body.data), headers: { 'content-type': body.contentType } },
      ctx.signal,
      file.key,
    );

    const payload = (await response.json().catch(() => ({}))) as CloudinaryUploadResponse;

    if (!response.ok || !payload.secure_url) {
      throw new LensError(
        'UPLOAD_FAILED',
        `Cloudinary rejected "${file.key}": ${payload.error?.message ?? `HTTP ${response.status}`}.` +
          (response.status === 401 ? ' Check apiKey and apiSecret.' : ''),
        {
          details: {
            adapter: 'cloudinary',
            key: file.key,
            status: response.status,
            publicId,
          },
        },
      );
    }

    return {
      key: file.key,
      url: this.#rewriteHost(payload.secure_url),
      size: payload.bytes ?? file.data.byteLength,
      ...(payload.etag ? { etag: payload.etag } : {}),
      meta: {
        publicId: payload.public_id,
        version: payload.version,
        format: payload.format,
        width: payload.width,
        height: payload.height,
      },
    };
  }

  async exists(key: string): Promise<boolean> {
    const publicId = this.#fullPublicId(key);
    const url =
      `https://api.cloudinary.com/v1_1/${this.#options.cloudName}/resources/${this.#resourceType}` +
      `/upload/${encodeURIComponent(publicId)}`;

    const auth = Buffer.from(`${this.#options.apiKey}:${this.#options.apiSecret}`).toString('base64');
    const response = await this.#fetch(url, { headers: { authorization: `Basic ${auth}` } });

    if (response.status === 404) return false;
    if (response.ok) return true;

    throw new LensError(
      'UPLOAD_FAILED',
      `Cloudinary existence check for "${key}" failed with HTTP ${response.status}.`,
      { details: { adapter: 'cloudinary', key, status: response.status } },
    );
  }

  async remove(key: string): Promise<void> {
    const publicId = this.#fullPublicId(key);
    const timestamp = Math.floor(Date.now() / 1000);
    const signed = { public_id: publicId, timestamp: String(timestamp) };

    const body = buildMultipart({
      ...signed,
      api_key: this.#options.apiKey,
      signature: sign(signed, this.#options.apiSecret),
    });

    const response = await this.#request(
      `https://api.cloudinary.com/v1_1/${this.#options.cloudName}/${this.#resourceType}/destroy`,
      { method: 'POST', body: toBodyInit(body.data), headers: { 'content-type': body.contentType } },
      undefined,
      key,
    );

    if (!response.ok) {
      throw new LensError(
        'UPLOAD_FAILED',
        `Cloudinary could not delete "${key}" (HTTP ${response.status}).`,
        { details: { adapter: 'cloudinary', key, status: response.status } },
      );
    }
  }

  /**
   * Predicted delivery URL for a key.
   *
   * Cloudinary URLs normally carry a `v<version>` segment, which we cannot know
   * before the upload. The unversioned form works, but skips Cloudinary's
   * immutable-cache behaviour - so prefer `variant.url` from the upload result.
   */
  getUrl(key: string): string {
    const base =
      this.#options.publicUrl?.replace(/\/+$/, '') ??
      `https://res.cloudinary.com/${this.#options.cloudName}`;
    return `${base}/${this.#resourceType}/upload/${this.#fullPublicId(key)}`;
  }

  async #request(
    url: string,
    init: RequestInit,
    signal: AbortSignal | undefined,
    key: string,
  ): Promise<Response> {
    const timeout = AbortSignal.timeout(this.#options.timeoutMs ?? 60_000);
    // Compose the caller's signal with our timeout so either can cancel.
    const composed = signal ? anySignal([signal, timeout]) : timeout;

    try {
      return await this.#fetch(url, { ...init, signal: composed });
    } catch (error) {
      const aborted = (error as Error)?.name === 'AbortError' || (error as Error)?.name === 'TimeoutError';
      throw new LensError(
        'UPLOAD_FAILED',
        aborted
          ? `Cloudinary request for "${key}" timed out after ${this.#options.timeoutMs ?? 60_000}ms.`
          : `Cloudinary request for "${key}" failed to send.`,
        { cause: error, details: { adapter: 'cloudinary', key } },
      );
    }
  }

  /** Cloudinary public ids carry no extension - it infers format from the bytes. */
  #publicId(key: string): string {
    return key.replace(/\.[a-z0-9]+$/i, '');
  }

  /** Public id including the configured folder, as Cloudinary stores it. */
  #fullPublicId(key: string): string {
    const id = this.#publicId(key);
    return this.#options.folder ? `${this.#options.folder.replace(/\/+$/, '')}/${id}` : id;
  }

  #rewriteHost(url: string): string {
    if (!this.#options.publicUrl) return url;
    try {
      const parsed = new URL(url);
      const base = new URL(this.#options.publicUrl);
      parsed.protocol = base.protocol;
      parsed.host = base.host;
      return parsed.toString();
    } catch {
      return url;
    }
  }
}

// ---------------------------------------------------------------------------
// Signing and multipart encoding
// ---------------------------------------------------------------------------

/**
 * Cloudinary's signature: SHA-1 of the signed params sorted by key, joined as
 * `k=v&k=v`, with the API secret appended (not as a separator - appended).
 *
 * Exported because getting this wrong produces an opaque 401, and being able
 * to assert on it in a test is worth the extra export.
 */
export function sign(params: Record<string, string>, apiSecret: string): string {
  const payload = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== '')
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return createHash('sha1').update(payload + apiSecret).digest('hex');
}

/** Encodes metadata into Cloudinary's `context` syntax: `k=v|k=v`. */
function encodeContext(metadata: Readonly<Record<string, string>>): string {
  return Object.entries(metadata)
    .map(([k, v]) => `${k.replace(/[|=]/g, '')}=${String(v).replace(/[|=]/g, '')}`)
    .join('|');
}

const encoder = new TextEncoder();

/**
 * Builds a `multipart/form-data` body by hand.
 *
 * We could use the global `FormData` plus a `Blob`, but that forces an extra
 * copy of every image through Blob internals. Concatenating the parts directly
 * is one allocation, which matters when the "file" is a 4 MB buffer.
 */
export function buildMultipart(
  fields: Record<string, string>,
  file?: { key: string; data: Uint8Array; contentType: string },
): { data: Uint8Array; contentType: string } {
  const boundary = `----LensBoundary${createHash('sha1').update(String(Math.random())).digest('hex').slice(0, 16)}`;
  const parts: Uint8Array[] = [];

  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined || value === '') continue;
    parts.push(
      encoder.encode(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }

  if (file) {
    const filename = file.key.split('/').pop() ?? 'image';
    parts.push(
      encoder.encode(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
          `Content-Type: ${file.contentType}\r\n\r\n`,
      ),
    );
    parts.push(file.data);
    parts.push(encoder.encode('\r\n'));
  }

  parts.push(encoder.encode(`--${boundary}--\r\n`));

  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const data = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    data.set(part, offset);
    offset += part.byteLength;
  }

  return { data, contentType: `multipart/form-data; boundary=${boundary}` };
}

/**
 * Hands a `Uint8Array` to `fetch` as a request body.
 *
 * `BodyInit` accepts an `ArrayBufferView` at runtime, but TypeScript's DOM lib
 * narrows the view's buffer type in a way a plain `Uint8Array` does not satisfy.
 * The cast is the narrow, documented exception rather than loosening the
 * signature of everything upstream.
 */
function toBodyInit(data: Uint8Array): NonNullable<RequestInit['body']> {
  return data as unknown as NonNullable<RequestInit['body']>;
}

/** `AbortSignal.any` where available, with a listener-based fallback for Node 18. */
function anySignal(signals: readonly AbortSignal[]): AbortSignal {
  const withAny = AbortSignal as unknown as { any?: (s: readonly AbortSignal[]) => AbortSignal };
  if (typeof withAny.any === 'function') return withAny.any(signals);

  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

export default CloudinaryAdapter;
