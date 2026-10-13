'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * - `idle`: server render, or a reader for whom nothing should animate.
 * - `waiting`: armed and still below the fold; show the starting state.
 * - `seen`: has scrolled into view; play, then stay put.
 */
export type InViewState = 'idle' | 'waiting' | 'seen';

/**
 * Reports when an element first scrolls into view, for things that count or
 * grow once and then stay.
 *
 * Same contract as `Reveal`: the first render (and so the server render) is the
 * finished state, and the hook only arms itself after mount if the element is
 * below the fold. Without JavaScript, with reduced motion, or when the element
 * is already on screen at load, the final figures are simply there and nothing
 * rewinds in front of the reader.
 */
export function useInView<T extends Element>(): [React.RefObject<T>, InViewState] {
  const ref = useRef<T>(null);
  const [state, setState] = useState<InViewState>('idle');

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;

    setState('waiting');
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setState('seen');
        io.disconnect();
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return [ref as React.RefObject<T>, state];
}
