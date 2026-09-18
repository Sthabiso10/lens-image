/**
 * A codec-free {@link ImageEngine}.
 *
 * It cannot resize or transcode - it has no decoder. What it *can* do is read
 * dimensions from the header and hand the original bytes back unchanged, which
 * covers three real cases:
 *
 * 1. **Tests.** Deterministic, instant, no native binary in CI.
 * 2. **Store-only pipelines.** Validate, content-hash, key and upload an image
 *    without re-encoding it.
 * 3. **Graceful degradation.** When sharp is missing, the optimizer can still
 *    store the original rather than failing the whole request - the user's
 *    upload survives, just unoptimised.
 */

import { LensError } from './../errors.js';
import { sniff } from './../sniff.js';
import type { EncodedImage, ImageEngine, ImageFormat, ImageMetadata, TransformOp } from './../types.js';

/** Options for {@link createPassthroughEngine}. */
export interface PassthroughEngineOptions {
  /**
   * What to do when asked for work it cannot do.
   *
   * - `'throw'` (default) - a clear `ENCODE_FAILED`, so the optimizer records a
   *   warning and moves to the next format.
   * - `'ignore'` - return the original bytes with their true dimensions. Honest
   *   about what happened, because the result reports the real output size.
   */
  readonly onUnsupported?: 'throw' | 'ignore';
}

/**
 * Creates the passthrough engine.
 *
 * @example
 * ```ts
 * // Validate and store originals, no codec required.
 * const optimizer = new ImageOptimizer({
 *   engine: createPassthroughEngine(),
 *   adapter: new LocalAdapter({ root: './uploads' }),
 * });
 * ```
 */
export function createPassthroughEngine(options: PassthroughEngineOptions = {}): ImageEngine {
  const { onUnsupported = 'throw' } = options;

  return {
    name: 'passthrough',

    supports(): boolean {
      // It can "produce" any format only in the sense of not changing it. The
      // optimizer relies on transform() to reject genuine conversions.
      return true;
    },

    async probe(input: Uint8Array): Promise<ImageMetadata> {
      return sniff(input);
    },

    async transform(input: Uint8Array, op: TransformOp): Promise<EncodedImage> {
      const meta = sniff(input);
      const sameFormat = meta.format === (op.format as string);
      const needsResize =
        op.resize !== undefined &&
        ((op.resize.width !== undefined && op.resize.width !== meta.width) ||
          (op.resize.height !== undefined && op.resize.height !== meta.height));

      if ((!sameFormat || needsResize) && onUnsupported === 'throw') {
        throw new LensError(
          'ENCODE_FAILED',
          `The passthrough engine cannot ${!sameFormat ? `convert ${meta.format} to ${op.format}` : 'resize images'}. ` +
            'Install sharp (`npm install sharp`) to enable real image processing.',
          { details: { engine: 'passthrough', format: op.format, detected: meta.format } },
        );
      }

      return {
        // Copy so a caller mutating the result cannot corrupt the source buffer
        // that other variants in the same run are still reading from.
        data: input.slice(),
        format: (sameFormat ? op.format : (meta.format as ImageFormat)) ?? op.format,
        width: meta.width,
        height: meta.height,
        size: input.byteLength,
      };
    },
  };
}
