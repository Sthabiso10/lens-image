/**
 * Turning the many shapes of "an image" into bytes plus a filename.
 *
 * Node builtins only - `node:fs/promises` for paths, global `fetch` for remote
 * URLs (Node 18+), and manual concatenation for async iterables.
 */

import { basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatBytes } from './bytes.js';
import { LensError, wrapError } from './errors.js';
import type { ImageSource } from './types.js';

/** Bytes plus whatever we learned about where they came from. */
export interface ResolvedSource {
  readonly data: Uint8Array;
  /** Basename including extension, or `'image'` when nothing better is known. */
  readonly filename: string;
  /** MIME type declared by the transport, if any. Never trusted for validation. */
  readonly contentType?: string;
  /** Where the bytes came from, for error messages. */
  readonly origin: 'path' | 'buffer' | 'stream' | 'url';
}

export interface ResolveOptions {
  /** Overrides any filename derived from the source. */
  readonly filename?: string;
  /** Permit `http:` / `https:` sources. Off by default. */
  readonly allowRemote?: boolean;
  /** Hard ceiling applied while reading, so a huge stream cannot exhaust memory. */
  readonly maxBytes?: number;
  readonly signal?: AbortSignal;
}

const isAsyncIterable = (value: unknown): value is AsyncIterable<Uint8Array> =>
  typeof value === 'object' && value !== null && Symbol.asyncIterator in value;

/**
 * Normalises any {@link ImageSource} into a buffer.
 *
 * @throws {LensError} `INVALID_SOURCE` for an unrecognised shape,
 *   `SOURCE_UNREADABLE` when the read itself fails,
 *   `VALIDATION_FAILED` when `maxBytes` is exceeded mid-read.
 *
 * @example
 * ```ts
 * await resolveSource('./photo.jpg');
 * await resolveSource(request.body, { filename: 'upload.png', maxBytes: 5_000_000 });
 * ```
 */
export async function resolveSource(
  source: ImageSource,
  options: ResolveOptions = {},
): Promise<ResolvedSource> {
  const { filename: override } = options;

  // { data, filename } wrapper - unwrap and recurse, keeping the inner filename
  // unless the caller supplied an explicit override.
  if (
    typeof source === 'object' &&
    source !== null &&
    !(source instanceof URL) &&
    !ArrayBuffer.isView(source) &&
    !isAsyncIterable(source) &&
    'data' in source
  ) {
    const wrapper = source as { data: Uint8Array | AsyncIterable<Uint8Array>; filename?: string; contentType?: string };
    const inner = await resolveSource(wrapper.data, {
      ...options,
      filename: override ?? wrapper.filename,
    });
    return wrapper.contentType ? { ...inner, contentType: wrapper.contentType } : inner;
  }

  if (typeof source === 'string') {
    return readPath(source, override, options);
  }

  if (source instanceof URL) {
    if (source.protocol === 'file:') {
      return readPath(fileURLToPath(source), override, options);
    }
    if (source.protocol === 'http:' || source.protocol === 'https:') {
      return readRemote(source, override, options);
    }
    throw new LensError(
      'INVALID_SOURCE',
      `Unsupported URL protocol "${source.protocol}". Use a file:, http: or https: URL.`,
    );
  }

  if (ArrayBuffer.isView(source)) {
    const data = toUint8(source);
    assertUnderLimit(data.byteLength, options.maxBytes);
    return { data, filename: normalizeFilename(override ?? 'image'), origin: 'buffer' };
  }

  if (isAsyncIterable(source)) {
    const data = await collect(source, options.maxBytes, options.signal);
    return { data, filename: normalizeFilename(override ?? 'image'), origin: 'stream' };
  }

  throw new LensError(
    'INVALID_SOURCE',
    'source must be a file path, URL, Uint8Array, async iterable of chunks, or { data, filename }. ' +
      `Received ${describe(source)}.`,
  );
}

async function readPath(
  path: string,
  override: string | undefined,
  options: ResolveOptions,
): Promise<ResolvedSource> {
  const { readFile, stat } = await import('node:fs/promises');
  try {
    if (options.maxBytes !== undefined) {
      // Check the size before reading so an oversized file never lands in memory.
      const info = await stat(path);
      assertUnderLimit(info.size, options.maxBytes, path);
    }
    const buffer = await readFile(path, options.signal ? { signal: options.signal } : undefined);
    return {
      data: toUint8(buffer),
      filename: normalizeFilename(override ?? basename(path)),
      origin: 'path',
    };
  } catch (error) {
    if (LensError.is(error)) throw error;
    if ((error as NodeJS.ErrnoException)?.name === 'AbortError') {
      throw new LensError('ABORTED', `Reading "${path}" was aborted.`, { cause: error });
    }
    throw wrapError('SOURCE_UNREADABLE', `Could not read image at "${path}"`, error, { path });
  }
}

async function readRemote(
  url: URL,
  override: string | undefined,
  options: ResolveOptions,
): Promise<ResolvedSource> {
  if (!options.allowRemote) {
    throw new LensError(
      'INVALID_SOURCE',
      `Refusing to fetch "${url.href}". Remote sources are disabled by default because they are ` +
        'an SSRF surface; pass `allowRemote: true` to the optimizer once you have validated the host.',
      { details: { url: url.href } },
    );
  }
  let response: Response;
  try {
    response = await fetch(url, options.signal ? { signal: options.signal } : {});
  } catch (error) {
    throw wrapError('SOURCE_UNREADABLE', `Fetching "${url.href}" failed`, error, { url: url.href });
  }
  if (!response.ok) {
    throw new LensError(
      'SOURCE_UNREADABLE',
      `Fetching "${url.href}" returned HTTP ${response.status} ${response.statusText}.`,
      { details: { url: url.href, status: response.status } },
    );
  }

  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > 0) {
    assertUnderLimit(declared, options.maxBytes, url.href);
  }

  const data = toUint8(new Uint8Array(await response.arrayBuffer()));
  assertUnderLimit(data.byteLength, options.maxBytes, url.href);

  const contentType = response.headers.get('content-type') ?? undefined;
  const derived = basename(url.pathname) || 'image';
  return {
    data,
    filename: normalizeFilename(override ?? derived),
    ...(contentType ? { contentType } : {}),
    origin: 'url',
  };
}

/** Drains an async iterable into one buffer, enforcing `maxBytes` as it goes. */
async function collect(
  stream: AsyncIterable<Uint8Array>,
  maxBytes: number | undefined,
  signal: AbortSignal | undefined,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for await (const chunk of stream) {
      if (signal?.aborted) {
        throw new LensError('ABORTED', 'Reading the source stream was aborted.');
      }
      const bytes = toUint8(chunk);
      total += bytes.byteLength;
      assertUnderLimit(total, maxBytes);
      chunks.push(bytes);
    }
  } catch (error) {
    throw wrapError('SOURCE_UNREADABLE', 'Reading the source stream failed', error);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function assertUnderLimit(size: number, maxBytes: number | undefined, what?: string): void {
  if (maxBytes !== undefined && size > maxBytes) {
    throw new LensError(
      'VALIDATION_FAILED',
      `Image is ${formatBytes(size)}${what ? ` ("${what}")` : ''}, over the ${formatBytes(maxBytes)} limit.`,
      { details: { limit: maxBytes, actual: size } },
    );
  }
}

/**
 * Views any ArrayBufferView as a Uint8Array without copying.
 *
 * The byteOffset/byteLength dance matters: Node often hands you a Buffer that
 * is a window onto a larger pooled allocation, and ignoring that ships the
 * neighbouring bytes too.
 */
function toUint8(view: ArrayBufferView): Uint8Array {
  return view instanceof Uint8Array && view.byteOffset === 0 && view.byteLength === view.buffer.byteLength
    ? view
    : new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

/** Strips directory separators and control characters from a filename. */
function normalizeFilename(name: string): string {
  const cleaned = name.split(/[\\/]/).pop() ?? 'image';
  // eslint-disable-next-line no-control-regex
  const safe = cleaned.replace(/[\x00-\x1f\x7f]/g, '').trim();
  return safe.length > 0 ? safe : 'image';
}

/** Filename without its extension. */
export function stem(filename: string): string {
  const ext = extname(filename);
  return ext ? filename.slice(0, -ext.length) : filename;
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return typeof value;
}

export { formatBytes };
