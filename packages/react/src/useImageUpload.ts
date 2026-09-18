/**
 * `useImageUpload` - headless upload state with real progress.
 *
 * No UI, no styles, no portal. It gives you state and three functions; you
 * render whatever your design system wants.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { validateFile } from './validate.js';
import type {
  ClientValidationOptions,
  UploadError,
  UploadItem,
  UploadStatus,
  UploadedImage,
} from './types.js';

/** Options for {@link useImageUpload}. */
export interface UseImageUploadOptions extends ClientValidationOptions {
  /** The endpoint to POST to, e.g. `'/api/upload'`. Required. */
  readonly endpoint: string;

  /** Multipart field name. Must match the server's `fieldName`. Default `'file'`. */
  readonly fieldName?: string;

  /** Extra headers - auth tokens, CSRF. Do not set `Content-Type`. */
  readonly headers?: Readonly<Record<string, string>>;

  /** Extra multipart fields sent alongside each file (album id, alt text, ...). */
  readonly fields?: Readonly<Record<string, string>>;

  /** Send cookies cross-origin. Default `'same-origin'`. */
  readonly credentials?: RequestCredentials;

  /**
   * Upload all files in one request rather than one request per file.
   * Default `false`, which gives per-file progress and per-file failure.
   */
  readonly batch?: boolean;

  /** Pull the image array out of a custom response shape. */
  readonly parseResponse?: (payload: unknown) => UploadedImage[];

  /** Fired per file as soon as its upload succeeds. */
  readonly onSuccess?: (image: UploadedImage, item: UploadItem) => void;

  /** Fired per file on failure. */
  readonly onError?: (error: UploadError, item: UploadItem) => void;

  /** Fired once when every file in an `upload()` call has settled. */
  readonly onComplete?: (images: UploadedImage[]) => void;

  /** Generate local object URLs for previews. Default `true`. */
  readonly preview?: boolean;
}

/** What {@link useImageUpload} returns. */
export interface UseImageUploadResult {
  /** Every tracked file, in the order it was added. */
  readonly items: readonly UploadItem[];

  /** Successfully uploaded images, in completion order. */
  readonly images: readonly UploadedImage[];

  /** True while any file is uploading. */
  readonly isUploading: boolean;

  /** Aggregate progress 0-100, weighted by file size. */
  readonly progress: number;

  /** The first error in the queue, for a simple single-error UI. */
  readonly error: UploadError | undefined;

  /** Overall status. `'error'` only when nothing succeeded. */
  readonly status: UploadStatus;

  /** Starts uploading. Accepts a FileList, an array, or a single File. */
  upload: (files: FileList | File[] | File | null | undefined) => Promise<UploadedImage[]>;

  /** Aborts everything in flight. Items become `'cancelled'`. */
  cancel: () => void;

  /** Clears state and revokes preview URLs. */
  reset: () => void;

  /** Removes one item by id, revoking its preview URL. */
  remove: (id: string) => void;
}

/**
 * Tracks image uploads to a Lens endpoint.
 *
 * Progress comes from `XMLHttpRequest.upload.onprogress`. That is deliberate:
 * `fetch` cannot report request-body progress in any shipping browser, so a
 * fetch implementation would have to fake the progress bar. This does not.
 *
 * @example
 * ```tsx
 * function Uploader() {
 *   const { upload, items, progress, isUploading, error } = useImageUpload({
 *     endpoint: '/api/upload',
 *     maxBytes: 10 * 1024 * 1024,
 *     accept: ['image/*'],
 *   });
 *
 *   return (
 *     <>
 *       <input
 *         type="file"
 *         multiple
 *         accept="image/*"
 *         disabled={isUploading}
 *         onChange={(e) => upload(e.target.files)}
 *       />
 *
 *       {isUploading && <progress value={progress} max={100} />}
 *       {error && <p role="alert">{error.message}</p>}
 *
 *       {items.map((item) => (
 *         <figure key={item.id}>
 *           <img src={item.result?.thumbnail?.url ?? item.previewUrl} alt="" />
 *           <figcaption>{item.file.name} - {item.status} {item.progress}%</figcaption>
 *         </figure>
 *       ))}
 *     </>
 *   );
 * }
 * ```
 */
export function useImageUpload(options: UseImageUploadOptions): UseImageUploadResult {
  const [items, setItems] = useState<UploadItem[]>([]);

  // Options live in a ref so callbacks stay referentially stable across renders -
  // otherwise every parent re-render would invalidate `upload` and break any
  // effect or memo depending on it.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const requests = useRef(new Set<XMLHttpRequest>());
  const previews = useRef(new Set<string>());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const request of requests.current) request.abort();
      requests.current.clear();
      // Object URLs are a documented memory leak if never revoked; unmount is
      // the last chance to do it.
      for (const url of previews.current) URL.revokeObjectURL(url);
      previews.current.clear();
    };
  }, []);

  const patch = useCallback((id: string, changes: Partial<UploadItem>) => {
    if (!mounted.current) return;
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }, []);

  const upload = useCallback<UseImageUploadResult['upload']>(async (input) => {
    const config = optionsRef.current;
    const files = toArray(input);
    if (files.length === 0) return [];

    if (config.maxFiles !== undefined && files.length > config.maxFiles) {
      files.length = config.maxFiles;
    }

    const queued: UploadItem[] = files.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      file,
      status: 'validating',
      progress: 0,
      loaded: 0,
      total: file.size,
      ...(config.preview !== false ? { previewUrl: createPreview(file, previews.current) } : {}),
    }));

    if (mounted.current) setItems((current) => [...current, ...queued]);

    // Validate first so a rejected file never opens a socket.
    const valid: UploadItem[] = [];
    for (const item of queued) {
      const error = validateFile(item.file, config);
      if (error) {
        patch(item.id, { status: 'error', error });
        config.onError?.(error, item);
      } else {
        valid.push(item);
      }
    }
    if (valid.length === 0) return [];

    const uploaded = config.batch
      ? await sendBatch(valid, config, patch, requests.current)
      : (
          await Promise.all(valid.map((item) => sendOne(item, config, patch, requests.current)))
        ).filter((image): image is UploadedImage => image !== null);

    config.onComplete?.(uploaded);
    return uploaded;
  }, [patch]);

  const cancel = useCallback(() => {
    for (const request of requests.current) request.abort();
    requests.current.clear();
    setItems((current) =>
      current.map((item) =>
        item.status === 'uploading' || item.status === 'validating'
          ? { ...item, status: 'cancelled' as const }
          : item,
      ),
    );
  }, []);

  const reset = useCallback(() => {
    for (const request of requests.current) request.abort();
    requests.current.clear();
    for (const url of previews.current) URL.revokeObjectURL(url);
    previews.current.clear();
    setItems([]);
  }, []);

  const remove = useCallback((id: string) => {
    setItems((current) => {
      const target = current.find((item) => item.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
        previews.current.delete(target.previewUrl);
      }
      return current.filter((item) => item.id !== id);
    });
  }, []);

  const derived = useMemo(() => {
    const images = items
      .map((item) => item.result)
      .filter((result): result is UploadedImage => result !== undefined);

    const isUploading = items.some(
      (item) => item.status === 'uploading' || item.status === 'validating',
    );

    // Weight by byte count, so a 40 KB icon finishing does not push a bar
    // tracking a 12 MB photo to 50%.
    const totalBytes = items.reduce((sum, item) => sum + item.total, 0);
    const loadedBytes = items.reduce((sum, item) => sum + item.loaded, 0);
    const progress = totalBytes === 0 ? 0 : Math.round((loadedBytes / totalBytes) * 100);

    const error = items.find((item) => item.error)?.error;

    const status: UploadStatus = isUploading
      ? 'uploading'
      : items.length === 0
        ? 'idle'
        : images.length > 0
          ? 'success'
          : error
            ? 'error'
            : 'idle';

    return { images, isUploading, progress, error, status };
  }, [items]);

  return { items, upload, cancel, reset, remove, ...derived };
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

type Patch = (id: string, changes: Partial<UploadItem>) => void;

function sendOne(
  item: UploadItem,
  config: UseImageUploadOptions,
  patch: Patch,
  pool: Set<XMLHttpRequest>,
): Promise<UploadedImage | null> {
  const body = new FormData();
  body.append(config.fieldName ?? 'file', item.file, item.file.name);
  for (const [key, value] of Object.entries(config.fields ?? {})) body.append(key, value);

  return send(body, config, pool, {
    onProgress: (loaded, total) => {
      patch(item.id, {
        status: 'uploading',
        loaded,
        total,
        progress: total === 0 ? 0 : Math.round((loaded / total) * 100),
      });
    },
  })
    .then((images) => {
      const image = images[0];
      if (!image) throw { code: 'EMPTY_RESPONSE', message: 'The server returned no image data.' };
      patch(item.id, { status: 'success', progress: 100, loaded: item.total, result: image });
      config.onSuccess?.(image, item);
      return image;
    })
    .catch((error: UploadError) => {
      const cancelled = error.code === 'CANCELLED';
      patch(item.id, { status: cancelled ? 'cancelled' : 'error', error });
      if (!cancelled) config.onError?.(error, item);
      return null;
    });
}

function sendBatch(
  batch: readonly UploadItem[],
  config: UseImageUploadOptions,
  patch: Patch,
  pool: Set<XMLHttpRequest>,
): Promise<UploadedImage[]> {
  const body = new FormData();
  for (const item of batch) body.append(config.fieldName ?? 'file', item.file, item.file.name);
  for (const [key, value] of Object.entries(config.fields ?? {})) body.append(key, value);

  const totalBytes = batch.reduce((sum, item) => sum + item.total, 0);

  return send(body, config, pool, {
    onProgress: (loaded) => {
      // One request means one progress stream, so it is distributed across the
      // batch proportionally rather than invented per file.
      const ratio = totalBytes === 0 ? 0 : loaded / totalBytes;
      for (const item of batch) {
        patch(item.id, {
          status: 'uploading',
          loaded: Math.round(item.total * ratio),
          progress: Math.round(ratio * 100),
        });
      }
    },
  })
    .then((images) => {
      batch.forEach((item, index) => {
        const image = images[index];
        if (image) {
          patch(item.id, { status: 'success', progress: 100, loaded: item.total, result: image });
          config.onSuccess?.(image, item);
        } else {
          const error = { code: 'MISSING_RESULT', message: 'The server returned no result for this file.' };
          patch(item.id, { status: 'error', error });
          config.onError?.(error, item);
        }
      });
      return images;
    })
    .catch((error: UploadError) => {
      for (const item of batch) {
        patch(item.id, { status: error.code === 'CANCELLED' ? 'cancelled' : 'error', error });
        if (error.code !== 'CANCELLED') config.onError?.(error, item);
      }
      return [];
    });
}

/** The XHR call itself. Rejects with an {@link UploadError}, never a raw Error. */
function send(
  body: FormData,
  config: UseImageUploadOptions,
  pool: Set<XMLHttpRequest>,
  handlers: { onProgress: (loaded: number, total: number) => void },
): Promise<UploadedImage[]> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    pool.add(request);

    request.open('POST', config.endpoint, true);
    request.withCredentials = (config.credentials ?? 'same-origin') === 'include';

    for (const [key, value] of Object.entries(config.headers ?? {})) {
      // Setting Content-Type by hand drops the multipart boundary the browser
      // generated, and the server then cannot parse the body at all.
      if (key.toLowerCase() === 'content-type') continue;
      request.setRequestHeader(key, value);
    }

    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) handlers.onProgress(event.loaded, event.total);
    });

    request.addEventListener('load', () => {
      pool.delete(request);

      let payload: unknown;
      try {
        payload = JSON.parse(request.responseText);
      } catch {
        reject({
          code: 'INVALID_RESPONSE',
          message: `The server returned a non-JSON response (HTTP ${request.status}).`,
          status: request.status,
        } satisfies UploadError);
        return;
      }

      if (request.status < 200 || request.status >= 300) {
        const error = payload as { error?: string; code?: string; details?: Record<string, unknown> };
        reject({
          code: error?.code ?? 'UPLOAD_FAILED',
          message: error?.error ?? `Upload failed with HTTP ${request.status}.`,
          status: request.status,
          ...(error?.details ? { details: error.details } : {}),
        } satisfies UploadError);
        return;
      }

      resolve(parse(payload, config));
    });

    request.addEventListener('error', () => {
      pool.delete(request);
      reject({
        code: 'NETWORK_ERROR',
        message: 'The upload could not reach the server. Check your connection and try again.',
      } satisfies UploadError);
    });

    request.addEventListener('abort', () => {
      pool.delete(request);
      reject({ code: 'CANCELLED', message: 'The upload was cancelled.' } satisfies UploadError);
    });

    request.addEventListener('timeout', () => {
      pool.delete(request);
      reject({ code: 'TIMEOUT', message: 'The upload timed out.' } satisfies UploadError);
    });

    request.send(body);
  });
}

function parse(payload: unknown, config: UseImageUploadOptions): UploadedImage[] {
  if (config.parseResponse) return config.parseResponse(payload);

  const body = payload as { files?: UploadedImage[] } | UploadedImage[] | UploadedImage;
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object' && 'files' in body && Array.isArray(body.files)) {
    return body.files;
  }
  return body ? [body as UploadedImage] : [];
}

function toArray(input: FileList | File[] | File | null | undefined): File[] {
  if (!input) return [];
  if (input instanceof File) return [input];
  return Array.from(input as FileList | File[]);
}

function createPreview(file: File, pool: Set<string>): string | undefined {
  if (typeof URL?.createObjectURL !== 'function') return undefined;
  const url = URL.createObjectURL(file);
  pool.add(url);
  return url;
}
