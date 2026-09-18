/**
 * A `Request -> Response` upload handler.
 *
 * Built on the Web Fetch API types that Node 18+ provides natively, so the same
 * function works as a Next.js Route Handler, a Remix action, a Hono/Elysia
 * route, a Bun or Deno server, or a Cloudflare Worker proxy - with no framework
 * adapter and no dependency.
 *
 * This is the server half of `@lens-image/react`'s `useImageUpload`: the hook POSTs
 * multipart form data, this parses it, optimizes, and returns JSON.
 */

import { LensError } from './../errors.js';
import type { ImageOptimizer } from './../optimizer.js';
import type { OptimizeOptions, OptimizeResult, Variant } from './../types.js';

/**
 * The bits of `File` we actually use.
 *
 * Declared structurally rather than referencing the DOM's `File`, because this
 * file has to compile for Node, Bun, Deno and Workers - four runtimes with four
 * slightly different `File` declarations and no shared lib.
 */
interface FileLike {
  readonly name: string;
  readonly size: number;
  readonly type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** Options for {@link createUploadHandler}. */
export interface UploadHandlerOptions {
  /** The optimizer to run uploads through. */
  readonly optimizer: ImageOptimizer;

  /** Multipart field name to read files from. Default `'file'`. */
  readonly fieldName?: string;

  /** Files accepted per request. Default 1. */
  readonly maxFiles?: number;

  /**
   * Per-request optimize options, or a function of the request.
   *
   * Use the function form for auth and tenancy - it is the right place to turn
   * a session into a key prefix, and the wrong place to trust anything the
   * client sent.
   */
  readonly options?:
    | Omit<OptimizeOptions, 'source'>
    | ((request: Request) => Omit<OptimizeOptions, 'source'> | Promise<Omit<OptimizeOptions, 'source'>>);

  /**
   * Reject the request before any work happens. Return a `Response` to
   * short-circuit, or nothing to continue. This is your auth hook.
   */
  readonly authorize?: (request: Request) => Response | undefined | Promise<Response | undefined>;

  /** Shape the success payload. Default: {@link serializeResult} per file. */
  readonly serialize?: (results: OptimizeResult[]) => unknown;

  /** Observe failures. The response is generated either way. */
  readonly onError?: (error: unknown, request: Request) => void;
}

/**
 * Builds an upload route handler.
 *
 * Errors become JSON with the status from {@link LensError.status}, so a file
 * that is too large is a 422 rather than a 500, without a try/catch in your route.
 *
 * @example Next.js App Router - `app/api/upload/route.ts`
 * ```ts
 * import { ImageOptimizer, createUploadHandler } from '@lens-image/core';
 * import { S3Adapter } from '@lens-image/adapter-s3';
 *
 * const optimizer = new ImageOptimizer({
 *   adapter: new S3Adapter({ bucket: 'uploads', region: 'us-east-1' }),
 * });
 *
 * export const POST = createUploadHandler({
 *   optimizer,
 *   maxFiles: 5,
 *   async authorize(req) {
 *     const session = await auth(req);
 *     if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
 *     return undefined;
 *   },
 *   options: async (req) => ({
 *     prefix: `users/${(await auth(req))!.userId}`,
 *     formats: ['webp', 'jpg'],
 *     sizes: [{ width: 1200 }, { width: 600 }],
 *     thumbnail: true,
 *   }),
 * });
 * ```
 */
export function createUploadHandler(
  options: UploadHandlerOptions,
): (request: Request) => Promise<Response> {
  const {
    optimizer,
    fieldName = 'file',
    maxFiles = 1,
    authorize,
    serialize = (results) => ({ files: results.map(serializeResult) }),
    onError,
  } = options;

  return async function handleUpload(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' }, 405, {
        Allow: 'POST',
      });
    }

    try {
      const rejection = await authorize?.(request);
      if (rejection) return rejection;

      const form = await readForm(request);
      const files = (form.getAll(fieldName) as unknown[]).filter(isFileLike);

      if (files.length === 0) {
        return json(
          {
            error: `No files found in the "${fieldName}" field.`,
            code: 'VALIDATION_FAILED',
          },
          400,
        );
      }
      if (files.length > maxFiles) {
        return json(
          {
            error: `Received ${files.length} files, the limit is ${maxFiles}.`,
            code: 'VALIDATION_FAILED',
          },
          413,
        );
      }

      const perRequest =
        typeof options.options === 'function' ? await options.options(request) : (options.options ?? {});

      // Sequential on purpose: each optimize call already fans out internally,
      // and overlapping whole files multiplies peak memory.
      const results: OptimizeResult[] = [];
      for (const file of files) {
        results.push(
          await optimizer.optimize({
            ...perRequest,
            source: new Uint8Array(await file.arrayBuffer()),
            filename: file.name || 'upload',
            ...(request.signal ? { signal: request.signal } : {}),
          }),
        );
      }

      return json(serialize(results), 200);
    } catch (error) {
      onError?.(error, request);

      if (LensError.is(error)) {
        return json({ error: error.message, code: error.code, details: error.details }, error.status);
      }
      return json(
        { error: 'Image processing failed.', code: 'INTERNAL_ERROR' },
        500,
      );
    }
  };
}

/**
 * Trims a result down to what a browser actually needs.
 *
 * Notably drops `variant.data` - returning megabytes of base64 to a client that
 * just uploaded those exact bytes is a common and expensive mistake.
 */
export function serializeResult(result: OptimizeResult): Record<string, unknown> {
  const strip = (variant: Variant) => {
    const { data: _data, ...rest } = variant;
    return rest;
  };

  return {
    id: result.id,
    source: {
      filename: result.source.filename,
      format: result.source.format,
      width: result.source.width,
      height: result.source.height,
      size: result.source.size,
    },
    formats: Object.fromEntries(
      Object.entries(result.formats).map(([format, group]) => [
        format,
        {
          urls: group!.urls,
          srcset: group!.srcset,
          size: group!.size,
          variants: group!.variants.map(strip),
        },
      ]),
    ),
    ...(result.thumbnail ? { thumbnail: strip(result.thumbnail) } : {}),
    totalSize: result.totalSize,
    savings: result.savings,
    durationMs: result.durationMs,
    warnings: result.warnings.map((w) => ({ code: w.code, message: w.message })),
  };
}

async function readForm(request: Request): Promise<FormData> {
  try {
    return await request.formData();
  } catch (error) {
    throw new LensError(
      'INVALID_SOURCE',
      'Request body is not valid multipart/form-data. Send the file with FormData, not as a raw body.',
      { cause: error },
    );
  }
}

/** Duck-typed so it works with Node's File, the DOM's File, Bun's and Deno's. */
function isFileLike(value: unknown): value is FileLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as FileLike).arrayBuffer === 'function' &&
    'name' in value
  );
}

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}
