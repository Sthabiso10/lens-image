'use client';

import { useEffect, useState } from 'react';
import { useInView } from './useInView';

/**
 * A figure that counts up to its value the first time it is scrolled to.
 *
 * Rendered with the final number on the server, so it is correct without
 * JavaScript and under reduced motion. `useInView` only rewinds it to zero
 * while it is still below the fold, so the reset is never seen.
 */
export function CountUp({
  to,
  suffix = '',
  duration = 1600,
}: {
  to: number;
  suffix?: string;
  /** Milliseconds. */
  duration?: number;
}) {
  const [ref, state] = useInView<HTMLSpanElement>();
  const [value, setValue] = useState(to);

  useEffect(() => {
    if (state === 'waiting') {
      setValue(0);
      return;
    }
    if (state !== 'seen') return;

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      // easeOutExpo, like the hero's counter: most of the climb happens at once.
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setValue(Math.round(to * eased));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state, to, duration]);

  return (
    <span ref={ref} className="tabular-nums">
      {value}
      {suffix}
    </span>
  );
}
