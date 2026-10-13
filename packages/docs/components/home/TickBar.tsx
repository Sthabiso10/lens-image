'use client';

import { useInView } from './useInView';

/**
 * One bar of the size comparison, drawn as a row of thin vertical ticks rather
 * than a solid fill: the same trick as a bar-race chart, and it reads as a
 * measurement instead of a progress bar.
 *
 * The ticks are a repeating gradient clipped to `percent` of the track, so the
 * bar can grow by animating width alone. It starts empty only while it is
 * waiting below the fold (see `useInView`), and is already full otherwise.
 *
 * The visible figures are the label; the bar itself is decoration.
 */
export function TickBar({
  percent,
  tone,
}: {
  /** 0–100, of the track. */
  percent: number;
  tone: 'muted' | 'accent';
}) {
  const [ref, state] = useInView<HTMLDivElement>();
  const width = state === 'waiting' ? 0 : percent;

  return (
    <div ref={ref} aria-hidden="true" className="h-9 w-full overflow-hidden rounded-[4px] bg-surface">
      <div
        className="h-full"
        style={{
          width: `${width}%`,
          // Hairline ticks: 2px on, 4px off. Never below 3px wide at the small end.
          minWidth: percent > 0 ? 3 : 0,
          backgroundImage: `repeating-linear-gradient(90deg, ${
            tone === 'accent' ? 'var(--accent-bright)' : 'var(--fg-muted)'
          } 0 2px, transparent 2px 6px)`,
          transition: 'width 1.4s var(--ease-out-expo)',
        }}
      />
    </div>
  );
}
