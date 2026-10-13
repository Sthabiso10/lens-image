import type { CSSProperties } from 'react';
import styles from '../home.module.css';
import { PauseGate } from './PauseGate';

/**
 * The pipeline stages the card steps through, in the order the hero set was
 * actually produced by `scripts/build-hero-images.mjs`. None of this is
 * invented for the animation:
 *
 * - reading: each full-size JPEG is downloaded (`?w=2000&q=90&fm=jpg`, lines
 *   54 and 171) and handed to `optimizer.optimize`.
 * - sniffing: `optimize` checks the bytes before trusting the filename, via
 *   `sniff()` in packages/core/src/optimizer.ts (line 349).
 * - resizing: `sizes: [{ width: 560, height: 780, fit: 'cover' }]` (line 156).
 * - encoding: `formats: ['webp']`, `quality: 72` (lines 157 and 158).
 * - writing: `new LocalAdapter({ root: outDir, baseUrl: '/hero' })` (line 152).
 *
 * If that script's options change, change these words with them.
 */
const stages = (count: number) => [
  `Reading ${count} photographs…`,
  'Sniffing bytes…',
  'Resizing to 560 × 780…',
  'Encoding WebP at quality 72…',
  'Writing via LocalAdapter…',
];

/** `7593751` -> `7.2 MB`, matching how the script reports the same figure. */
function megabytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function kilobytes(bytes: number) {
  const kb = Math.round(bytes / 1024);
  return kb >= 1024 ? megabytes(bytes) : `${kb} KB`;
}

/**
 * The hero's bottom-right card: a pipeline "running", then holding the result.
 *
 * It cycles through the stages above with a spinner, settles on the measured
 * figure for roughly two thirds of each loop, and fades back to the start. The
 * figure is computed from the manifest's byte counts rather than typed in, so
 * it cannot drift from `HERO_STATS`.
 *
 * Everything moves with CSS animations on a shared clock (see `home.module.css`),
 * so the server markup and the first client render are the same and there is no
 * state to rewind. The stage lines are `aria-hidden` and the card is not a live
 * region: the stages are decorative motion, and the result sentence is real
 * text that is always in the DOM. Under reduced motion only the result shows.
 */
export function LiveRun({
  count,
  sourceBytes,
  outputBytes,
}: {
  count: number;
  sourceBytes: number;
  outputBytes: number;
}) {
  const savings = Math.round((1 - outputBytes / sourceBytes) * 100);

  return (
    <PauseGate
      className={`${styles.run} animate-fade-in w-full max-w-[19.5rem] rounded-xl border border-line bg-surface/80 text-left backdrop-blur-md`}
      style={{ animationDelay: '700ms' }}
    >
      <div className="p-3.5">
        <p className="flex items-center gap-2 font-mono text-2xs uppercase tracking-[0.14em] text-muted">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-signal" />
          Fig. 01 · Measured, not mocked
        </p>

        <div className={`${styles.runBody} mt-3`}>
          {stages(count).map((label, i) => (
            <p
              key={label}
              aria-hidden
              className={`${styles.stage} flex items-center gap-2 font-mono text-xs text-secondary`}
              style={{ '--i': i } as CSSProperties}
            >
              <span className={styles.spinner} />
              {label}
            </p>
          ))}

          <div className={`${styles.result} flex items-center gap-3`}>
            <span
              aria-hidden
              className="display shrink-0 text-4xl tabular-nums tracking-[-0.04em] text-signal"
            >
              {savings}%
            </span>
            <p className="text-xs text-secondary">
              The {count} images flying past were optimized by Lens,{' '}
              <span className="text-muted">
                {megabytes(sourceBytes)} down to{' '}
                <span className="tabular-nums text-secondary">{kilobytes(outputBytes)}</span>,{' '}
                <span className="tabular-nums text-signal">{savings}% smaller</span>.
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Fills as the stages pass and turns green on the result. */}
      <span aria-hidden className={styles.runBar} />
    </PauseGate>
  );
}
