/**
 * A ~40-line replacement for `p-map` / `p-limit`.
 *
 * Unbounded `Promise.all` over image encodes is how you turn a 12-variant
 * upload into an out-of-memory crash: sharp holds the full decoded bitmap per
 * in-flight job, so twelve 4K photos is several gigabytes of RSS.
 */

import { LensError, throwIfAborted } from './errors.js';

/** Outcome of one task in a {@link mapLimit} run. */
export type Settled<T> =
  | { readonly status: 'fulfilled'; readonly value: T; readonly index: number }
  | { readonly status: 'rejected'; readonly reason: unknown; readonly index: number };

/**
 * Runs `worker` over `items` with at most `limit` in flight, preserving input
 * order in the output.
 *
 * Unlike `Promise.all`, one rejection does not discard the work that succeeded:
 * every task settles and you get a per-item verdict. That is what makes
 * "the AVIF encoder died but the WebP is fine" a warning instead of a failure.
 *
 * @example
 * ```ts
 * const results = await mapLimit(variants, 4, (v) => encodeAndUpload(v));
 * const ok = results.filter((r) => r.status === 'fulfilled');
 * ```
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<Settled<R>[]> {
  if (items.length === 0) return [];

  const size = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  const results = new Array<Settled<R>>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: size }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;

      // Stop handing out work once aborted, but let in-flight tasks settle so
      // adapters get a chance to clean up rather than being orphaned.
      if (signal?.aborted) {
        results[index] = {
          status: 'rejected',
          index,
          reason: new LensError('ABORTED', 'Task was skipped because the run was aborted.'),
        };
        continue;
      }

      try {
        results[index] = { status: 'fulfilled', value: await worker(items[index] as T, index), index };
      } catch (reason) {
        results[index] = { status: 'rejected', reason, index };
      }
    }
  });

  await Promise.all(runners);
  throwIfAborted(signal, 'run');
  return results;
}

/** Sleep that rejects promptly when the signal fires, instead of after the delay. */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new LensError('ABORTED', 'Delay was aborted.'));
      return;
    }
    // Deliberately NOT unref'd. A pending retry backoff is real outstanding
    // work: unref-ing it lets Node drain the event loop and exit (or a test
    // runner declare the turn over) while an upload is still waiting to be
    // retried, silently dropping it.
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timer);
      reject(new LensError('ABORTED', 'Delay was aborted.'));
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
