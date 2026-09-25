'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Rises into place the first time it scrolls into view.
 *
 * Server-rendered visible, and only hidden after mount if it is still below
 * the fold, so a reader without JavaScript, or one who lands halfway down the
 * page, never waits on an animation to see content.
 */
export function Reveal({
  delay = 0,
  className,
  children,
}: {
  /** Milliseconds, for staggering siblings. */
  delay?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'idle' | 'hidden' | 'shown'>('idle');

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Already on screen: leave it exactly as rendered.
    if (el.getBoundingClientRect().top < window.innerHeight) return;

    setState('hidden');
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setState('shown');
        io.disconnect();
      },
      { rootMargin: '0px 0px -12% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      data-reveal={state === 'idle' ? undefined : state}
      style={state === 'shown' ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
