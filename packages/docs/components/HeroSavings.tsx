'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// React 18 warns about layout effects during server rendering.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * The hero's closing line, with its figures counted rather than printed.
 *
 * The output size counts *down* from the source size and the percentage
 * counts up, so the line plays out the compression it describes. It waits for
 * the corridor's arrival to finish first, then runs once.
 *
 * Rendered with the final figures on the server, so the numbers are right
 * without JavaScript. The line is still invisible (it fades in late) when the
 * layout effect rewinds it to the start values, so the rewind is never seen.
 */
export function HeroSavings({
  count,
  sourceBytes,
  outputBytes,
  savingsPercent,
}: {
  count: number;
  sourceBytes: number;
  outputBytes: number;
  savingsPercent: number;
}) {
  const [t, setT] = useState(1);
  const ref = useRef<HTMLSpanElement>(null);

  useIsoLayoutEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // The line fades in late. If it is already showing by the time this runs
    // (a slow device, a cold dev server), rewinding would be seen as the
    // figures jumping back to zero, so the final numbers simply stay.
    const line = ref.current?.parentElement;
    if (line && Number(getComputedStyle(line).opacity) > 0.02) return;

    setT(0);
    let frame = 0;
    const timer = setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / 1600);
        setT(p);
        if (p < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, 1000);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, []);

  // easeOutExpo: most of the drop happens at once, then it settles.
  const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
  const kb = Math.round((sourceBytes + (outputBytes - sourceBytes) * eased) / 1024);
  const size = kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;

  return (
    <span ref={ref}>
      The {count} images flying past were optimized by Lens,{' '}
      <span className="text-muted">
        {(sourceBytes / 1024 / 1024).toFixed(1)} MB down to{' '}
        <span className="tabular-nums text-secondary">{size}</span>,{' '}
        <span className={`tabular-nums transition-colors duration-500 ${t === 1 ? 'text-signal' : ''}`}>
          {Math.round(savingsPercent * eased)}%
        </span>{' '}
        smaller.
      </span>
    </span>
  );
}
