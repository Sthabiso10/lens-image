'use client';

import { useEffect, useRef } from 'react';
import styles from '../home.module.css';

/**
 * A wrapper whose CSS animations hold still while nobody can see them.
 *
 * The hero's decorative loops (the live-run card, the category stack) are pure
 * CSS, which keeps them out of React's render path and means the server HTML
 * and the first client render are identical. This is the only JavaScript they
 * need: it flips a `data-paused` attribute when the hero has scrolled away or
 * the tab is hidden, and the stylesheet freezes every animation beneath it.
 *
 * The attribute is set directly on the node rather than through state, so
 * nothing re-renders and nothing can disagree with the server markup.
 */
export function PauseGate({ children, className, ...props }: React.ComponentProps<'div'>) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let onscreen = true;
    let tabVisible = !document.hidden;
    const apply = () => el.toggleAttribute('data-paused', !(onscreen && tabVisible));

    const onVisibility = () => {
      tabVisible = !document.hidden;
      apply();
    };
    document.addEventListener('visibilitychange', onVisibility);

    let io: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(([entry]) => {
        onscreen = !!entry?.isIntersecting;
        apply();
      });
      io.observe(el);
    }
    apply();

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      io?.disconnect();
    };
  }, []);

  return (
    <div ref={ref} className={`${styles.gate}${className ? ` ${className}` : ''}`} {...props}>
      {children}
    </div>
  );
}
