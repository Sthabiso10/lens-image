/**
 * Error taxonomy.
 *
 * Every error Lens throws is a {@link LensError} with a stable `code`, so you
 * can branch on failure without string-matching messages. Messages are written
 * for the developer reading a stack trace at 2am: they say what was expected,
 * what happened, and what to do about it.
 */

import type { DetectedFormat, ImageFormat } from './types.js';

/** Stable, machine-readable failure codes. */
export type LensErrorCode =
  /** The `source` value was not a shape Lens understands. */
  | 'INVALID_SOURCE'
  /** The file could not be read from disk or the network. */
  | 'SOURCE_UNREADABLE'
  /** Bytes were read but are not a recognisable image. */
  | 'UNSUPPORTED_INPUT'
  /** Input failed a `validate` rule (size, dimensions, format allowlist). */
  | 'VALIDATION_FAILED'
  /** No codec is available to do the work. Usually: sharp is not installed. */
  | 'ENGINE_UNAVAILABLE'
  /** The codec threw while encoding. */
  | 'ENCODE_FAILED'
  /** Every requested format failed, including the fallback. */
  | 'ALL_FORMATS_FAILED'
  /** The storage adapter threw, after exhausting retries. */
  | 'UPLOAD_FAILED'
  /** An adapter was required for the operation but none was configured. */
  | 'ADAPTER_REQUIRED'
  /** The adapter does not implement an optional method this call needed. */
  | 'ADAPTER_UNSUPPORTED'
  /** Adapter constructor received bad or missing configuration. */
  | 'ADAPTER_MISCONFIGURED'
  /** The caller's `AbortSignal` fired. */
  | 'ABORTED'
  /** Option values were contradictory or out of range. */
  | 'INVALID_OPTIONS';

/** Extra context carried on a {@link LensError}. */
export interface LensErrorDetails {
  readonly format?: ImageFormat;
  readonly detected?: DetectedFormat;
  readonly key?: string;
  readonly adapter?: string;
  readonly engine?: string;
  readonly limit?: number;
  readonly actual?: number;
  readonly attempts?: number;
  readonly [key: string]: unknown;
}

/**
 * Base error for everything this library throws.
 *
 * @example
 * ```ts
 * try {
 *   await optimizer.optimize({ source: buf });
 * } catch (err) {
 *   if (LensError.is(err, 'VALIDATION_FAILED')) return res.status(400).json({ error: err.message });
 *   throw err;
 * }
 * ```
 */
export class LensError extends Error {
  /** Stable failure code. Branch on this, not on `message`. */
  readonly code: LensErrorCode;

  /** Structured context: limits, keys, formats involved. */
  readonly details: LensErrorDetails;

  /** A suggested HTTP status, so route handlers do not have to map codes. */
  readonly status: number;

  constructor(
    code: LensErrorCode,
    message: string,
    options: { cause?: unknown; details?: LensErrorDetails } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'LensError';
    this.code = code;
    this.details = options.details ?? {};
    this.status = STATUS_BY_CODE[code] ?? 500;
    Error.captureStackTrace?.(this, LensError);
  }

  /**
   * Type guard. Pass a `code` to narrow further.
   *
   * @example `if (LensError.is(err, 'UPLOAD_FAILED')) ...`
   */
  static is(error: unknown, code?: LensErrorCode): error is LensError {
    if (!(error instanceof LensError)) return false;
    return code === undefined || error.code === code;
  }

  /** JSON-safe representation, suitable for logs and API responses. */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      status: this.status,
      details: this.details,
    };
  }
}

const STATUS_BY_CODE: Partial<Record<LensErrorCode, number>> = {
  INVALID_SOURCE: 400,
  SOURCE_UNREADABLE: 400,
  UNSUPPORTED_INPUT: 415,
  VALIDATION_FAILED: 422,
  INVALID_OPTIONS: 400,
  ABORTED: 499,
  ENGINE_UNAVAILABLE: 500,
  ENCODE_FAILED: 500,
  ALL_FORMATS_FAILED: 500,
  UPLOAD_FAILED: 502,
  ADAPTER_REQUIRED: 500,
  ADAPTER_UNSUPPORTED: 501,
  ADAPTER_MISCONFIGURED: 500,
};

/** Throws `ABORTED` if the signal has already fired. Cheap enough to call often. */
export function throwIfAborted(signal: AbortSignal | undefined, what = 'operation'): void {
  if (signal?.aborted) {
    throw new LensError('ABORTED', `Lens ${what} was aborted by the caller's AbortSignal.`, {
      cause: signal.reason,
    });
  }
}

/**
 * Wraps a non-Lens error, preserving the original as `cause`.
 * Existing {@link LensError}s pass through untouched so codes are not lost.
 */
export function wrapError(
  code: LensErrorCode,
  message: string,
  cause: unknown,
  details?: LensErrorDetails,
): LensError {
  if (LensError.is(cause)) return cause;
  const reason = cause instanceof Error ? cause.message : String(cause);
  return new LensError(code, `${message} (${reason})`, { cause, details });
}
