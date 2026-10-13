import styles from '../home.module.css';

/**
 * A tiny "SCROLL" prompt at the bottom centre of the hero frame: mono label and
 * a short line with a light running along it. It exists only where it can be
 * seen to work: hidden below `md` (a phone does not need telling) and under
 * reduced motion, and where the browser supports scroll-driven animation it
 * fades out as the page starts to move. Decoration, so `aria-hidden`.
 */
export function ScrollCue() {
  return (
    <div aria-hidden className={styles.cue}>
      <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted">Scroll</span>
      <span className={styles.cueLine} />
    </div>
  );
}
