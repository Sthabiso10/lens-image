'use client';

import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from 'react';

export interface IndicatorBox {
  top: number;
  left: number;
  width: number;
  height: number;
  /** False until the first measurement, and whenever nothing is active. */
  visible: boolean;
  /**
   * False for the very first placement, so the marker appears where it
   * belongs instead of sliding in from the corner.
   */
  animate: boolean;
}

const HIDDEN: IndicatorBox = {
  top: 0,
  left: 0,
  width: 0,
  height: 0,
  visible: false,
  animate: false,
};

/**
 * Measures the active item inside `container`, so one marker element can
 * slide between items instead of each item painting its own and the
 * highlight jumping.
 *
 * `selector` finds the active item; `key` is whatever changes when it does
 * (the pathname, the active heading). Re-measures on resize, because the
 * sidebar and the table of contents both reflow with the viewport.
 */
export function useIndicator(
  container: RefObject<HTMLElement | null>,
  selector: string,
  key: unknown,
): IndicatorBox {
  const [box, setBox] = useState<IndicatorBox>(HIDDEN);

  const measure = useCallback(() => {
    const root = container.current;
    const item = root?.querySelector<HTMLElement>(selector);
    if (!root || !item) {
      setBox((current) => (current.visible ? { ...current, visible: false } : current));
      return;
    }
    const outer = root.getBoundingClientRect();
    const inner = item.getBoundingClientRect();
    setBox((current) => ({
      top: inner.top - outer.top + root.scrollTop,
      left: inner.left - outer.left + root.scrollLeft,
      width: inner.width,
      height: inner.height,
      visible: true,
      // Slide only from a place it was actually showing.
      animate: current.visible,
    }));
  }, [container, selector]);

  useLayoutEffect(measure, [measure, key]);

  useEffect(() => {
    const root = container.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(root);
    return () => observer.disconnect();
  }, [container, measure]);

  return box;
}
