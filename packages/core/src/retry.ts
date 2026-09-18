/**
 * Retry with exponential backoff and full jitter.
 *
 * Applied to adapter writes only. Encoding is deterministic - if sharp fails
 * to encode a buffer once it will fail identically the second time, and
 * retrying just burns CPU before the same error.
 */

import { delay } from './concurrency.js';
import { LensError } from './errors.js';
import type { RetryOptions } from './types.js';

/** Fully-resolved retry policy. */
export interface ResolvedRetry {
  readonly attempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly isRetryable: (error: unknown) => boolean;
  readonly onRetry: ((info: { attempt: number; delayMs: number; error: unknown }) => void) | undefined;
}

/** Transient network failures worth a second look. */
const RETRYABLE_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EBUSY',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
  'RequestTimeout',
  'RequestTimeTooSkewed',
  'ThrottlingException',
  'TooManyRequestsException',
  'SlowDown',
  'InternalError',
  'ServiceUnavailable',
]);

/**
 * The default retry predicate.
 *
 * Retries transient network errors, HTTP 408/429 and 5xx. Never retries 4xx:
 * a 403 from a misconfigured bucket policy will still be a 403 in 800ms, and
 * hammering it just delays the error the developer needs to see.
 */
export function isRetryableError(error: unknown): boolean {
  if (LensError.is(error)) {
    // Our own validation/config errors are never transient.
    if (error.code !== 'UPLOAD_FAILED') return false;
    return isRetryableError(error.cause);
  }
  if (!error || typeof error !== 'object') return false;

  const err = error as {
    code?: string;
    name?: string;
    status?: number;
    statusCode?: number;
    $metadata?: { httpStatusCode?: number };
    $retryable?: { throttling?: boolean };
    cause?: unknown;
  };

  if (err.$retryable) return true;
  if (err.code && RETRYABLE_CODES.has(err.code)) return true;
  if (err.name && RETRYABLE_CODES.has(err.name)) return true;

  const status = err.status ?? err.statusCode ?? err.$metadata?.httpStatusCode;
  if (typeof status === 'number') {
    if (status === 408 || status === 429) return true;
    if (status >= 500 && status < 600) return true;
    return false;
  }

  // `fetch` wraps the real cause; unwrap one level before giving up.
  if (err.cause && err.cause !== error) return isRetryableError(err.cause);
  return false;
}

/** Fills in defaults for anything the caller left out. */
export function resolveRetry(options: RetryOptions | undefined): ResolvedRetry {
  return {
    attempts: Math.max(1, Math.floor(options?.attempts ?? 3)),
    baseDelayMs: Math.max(0, options?.baseDelayMs ?? 200),
    maxDelayMs: Math.max(0, options?.maxDelayMs ?? 5_000),
    isRetryable: options?.isRetryable ?? isRetryableError,
    onRetry: options?.onRetry,
  };
}

/**
 * Computes the backoff for a given attempt using full jitter:
 * `random(0, min(maxDelay, base * 2^(attempt-1)))`.
 *
 * The randomness is the point. Fixed backoff makes every worker that failed on
 * the same S3 throttle retry at the same instant, reproducing the pile-up that
 * caused the throttle.
 *
 * @param attempt - 1-based number of the attempt that just failed.
 * @param random - Injectable for deterministic tests.
 */
export function backoffDelay(
  attempt: number,
  policy: Pick<ResolvedRetry, 'baseDelayMs' | 'maxDelayMs'>,
  random: () => number = Math.random,
): number {
  const ceiling = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (attempt - 1));
  return Math.round(random() * ceiling);
}

/**
 * Runs `task`, retrying per the policy.
 *
 * `task` receives the 1-based attempt number so adapters can log or vary
 * behaviour (an idempotency key, say).
 *
 * @example
 * ```ts
 * await withRetry(resolveRetry({ attempts: 5 }), (attempt) => adapter.upload(file, { attempt, runId }));
 * ```
 */
export async function withRetry<T>(
  policy: ResolvedRetry,
  task: (attempt: number) => Promise<T>,
  signal?: AbortSignal,
  random: () => number = Math.random,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= policy.attempts; attempt++) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;

      const isLast = attempt === policy.attempts;
      if (isLast || signal?.aborted || LensError.is(error, 'ABORTED') || !policy.isRetryable(error)) {
        throw error;
      }

      const delayMs = backoffDelay(attempt, policy, random);
      policy.onRetry?.({ attempt, delayMs, error });
      await delay(delayMs, signal);
    }
  }

  // Unreachable: the loop either returns or throws.
  throw lastError;
}
