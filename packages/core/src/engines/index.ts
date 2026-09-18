/** Engine selection. */

import { createPassthroughEngine } from './passthrough.js';
import { createSharpEngine } from './sharp.js';
import type { ImageEngine } from './../types.js';

export { createSharpEngine, resetSharpCache, type SharpEngineOptions } from './sharp.js';
export { createPassthroughEngine, type PassthroughEngineOptions } from './passthrough.js';

let detected: Promise<ImageEngine> | undefined;

/**
 * Picks the best engine available in this process.
 *
 * Returns the sharp engine when sharp can be imported, otherwise the
 * passthrough engine. Detection happens once and is memoised - an optimizer
 * constructed at module scope should not pay for a dynamic import on every call.
 *
 * Note that the passthrough fallback is not silent: it throws a message naming
 * sharp the first time you ask it to actually resize something. The goal is
 * that "I forgot to install sharp" surfaces as one clear error rather than as
 * mysteriously unprocessed images.
 */
export async function detectEngine(): Promise<ImageEngine> {
  detected ??= (async () => {
    const sharp = createSharpEngine();
    return (await sharp.supports('webp')) ? sharp : createPassthroughEngine();
  })();
  return detected;
}

/** Test seam: forget the memoised engine detection. */
export function resetEngineDetection(): void {
  detected = undefined;
}
