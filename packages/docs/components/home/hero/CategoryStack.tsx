import type { CSSProperties } from 'react';
import styles from '../home.module.css';
import { PauseGate } from './PauseGate';

/**
 * What Lens speaks, formats and backends alike. The order is a rotation of the
 * obvious one so that AVIF is the entry sitting in the highlighted slot when
 * the page loads, and so when motion is off.
 */
const CATEGORIES = ['Filesystem', 'Cloudinary', 'AVIF', 'WebP', 'JPEG', 'srcset', 'S3', 'R2'];

/** Index of the slot, counting from the top of the window, that is highlighted. */
const CENTRE = 2;

/**
 * A column of small pills climbing the frame's right edge, one slot at a time,
 * with whichever sits in the middle lit. It is a texture, not content: the
 * same things are named properly further down the page, so the whole column
 * is `aria-hidden`, hidden below `md`, and still under reduced motion.
 *
 * The list is rendered twice back to back and the track climbs exactly one
 * list's height, so the loop has no seam. Each pill's highlight is the same
 * clock offset by its own position (`--d`, in steps), which is how the lit
 * pill is always the one in the middle without any script deciding it.
 */
export function CategoryStack({ className }: { className?: string }) {
  const items = [...CATEGORIES, ...CATEGORIES];

  return (
    <PauseGate aria-hidden className={className}>
      <div className={styles.stack}>
        <ul className={styles.stackTrack}>
          {items.map((name, i) => {
            // How many steps into the loop this pill reaches the highlighted slot.
            const d = (((i - CENTRE) % CATEGORIES.length) + CATEGORIES.length) % CATEGORIES.length;
            return (
              <li
                key={i}
                className={`${styles.stackItem}${i >= CATEGORIES.length ? ` ${styles.duplicate}` : ''}`}
              >
                <span
                  className={`${styles.chip} inline-flex h-7 items-center rounded-full border px-3 font-mono text-xs backdrop-blur-sm`}
                  style={{ '--d': d } as CSSProperties}
                >
                  {name}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </PauseGate>
  );
}
