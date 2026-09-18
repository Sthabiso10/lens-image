/**
 * Client-side types for `@lens-image/react`.
 *
 * Structurally compatible with the server's `OptimizeResult` as serialized by
 * `serializeResult`, but declared independently so this package does not import
 * `@lens-image/core` - which is Node-only and would drag `node:crypto` into a browser
 * bundle for nothing.
 */

/** One generated file, as the server reports it. */
export interface UploadedVariant {
  readonly format: string;
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly size: number;
  readonly quality: number;
  readonly key: string;
  readonly url: string;
  readonly contentType: string;
  readonly checksum: string;
}

/** All variants of one format. */
export interface UploadedFormat {
  readonly urls: Readonly<Record<string, string>>;
  readonly srcset: string;
  readonly size: number;
  readonly variants: readonly UploadedVariant[];
}

/** The JSON payload `createUploadHandler` returns for one file. */
export interface UploadedImage {
  readonly id: string;
  readonly source: {
    readonly filename: string;
    readonly format: string;
    readonly width: number;
    readonly height: number;
    readonly size: number;
  };
  readonly formats: Readonly<Record<string, UploadedFormat>>;
  readonly thumbnail?: UploadedVariant;
  readonly totalSize: number;
  readonly savings: number;
  readonly durationMs: number;
  readonly warnings: readonly { code: string; message: string }[];
}

/** Lifecycle of a single file in the queue. */
export type UploadStatus = 'idle' | 'validating' | 'uploading' | 'success' | 'error' | 'cancelled';

/** A tracked upload. */
export interface UploadItem {
  /** Stable id for React keys. Survives status changes. */
  readonly id: string;
  readonly file: File;
  readonly status: UploadStatus;
  /** 0-100. Jumps to 100 on success even if the browser never reported progress. */
  readonly progress: number;
  /** Bytes sent so far. */
  readonly loaded: number;
  /** Total bytes to send. */
  readonly total: number;
  /** Populated on success. */
  readonly result?: UploadedImage;
  /** Populated on error. */
  readonly error?: UploadError;
  /** Object URL for local preview. Revoked automatically on `reset`. */
  readonly previewUrl?: string;
}

/** A failed upload, with the server's error code when it supplied one. */
export interface UploadError {
  readonly message: string;
  /** Server `LensError` code, or a client-side code like `'FILE_TOO_LARGE'`. */
  readonly code: string;
  readonly status?: number;
  readonly details?: Readonly<Record<string, unknown>>;
}

/** Client-side checks, run before anything leaves the browser. */
export interface ClientValidationOptions {
  /** Reject files larger than this. */
  readonly maxBytes?: number;
  /** Accepted MIME types or extensions, e.g. `['image/png', '.webp']`. */
  readonly accept?: readonly string[];
  /** Maximum files per `upload()` call. */
  readonly maxFiles?: number;
}
