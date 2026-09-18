'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * A before/after comparison slider.
 *
 * Ported from `@diceui/compare-slider` on 21st.dev, keeping its API
 * `CompareSlider` / `Before` / `After` / `Handle` / `Label`, the `interaction`
 * and `orientation` props, and the full keyboard model.
 *
 * Three deliberate departures from the original:
 *
 * 1. **No `radix-ui`.** That dependency exists only to support `asChild`, which
 *    nothing here uses.
 * 2. **No `lucide-react`.** The handle needs two chevrons; this site already
 *    hand-rolls its icons.
 * 3. **Plain state instead of an external store.** The original uses
 *    `useSyncExternalStore` so a deep tree can subscribe without re-rendering
 *    the root. With two children and a handle, the re-render is the cheap part
 *    and the store is machinery without a payload.
 *
 * The original also shipped four util modules (`compose-refs`, `use-as-ref`,
 * `use-lazy-ref`, `use-isomorphic-layout-effect`) that the registry response
 * did not include, so a verbatim copy would not have compiled.
 */

type Interaction = 'hover' | 'drag';
type Orientation = 'horizontal' | 'vertical';

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const PAGE_KEYS = ['PageUp', 'PageDown'];
const ARROW_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

interface ContextValue {
  value: number;
  interaction: Interaction;
  orientation: Orientation;
}

const CompareSliderContext = React.createContext<ContextValue | null>(null);

function useCompareSlider(consumer: string): ContextValue {
  const context = React.useContext(CompareSliderContext);
  if (!context) {
    throw new Error(`\`${consumer}\` must be used within \`CompareSlider\`.`);
  }
  return context;
}

export interface CompareSliderProps extends React.ComponentProps<'div'> {
  /** Controlled position, 0-100. */
  value?: number;
  /** Uncontrolled starting position, 0-100. @default 50 */
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  /** Keyboard step. @default 1 */
  step?: number;
  /** `'drag'` needs a press; `'hover'` follows the pointer. @default 'drag' */
  interaction?: Interaction;
  /** @default 'horizontal' */
  orientation?: Orientation;
}

export function CompareSlider({
  value: valueProp,
  defaultValue = 50,
  onValueChange,
  step = 1,
  interaction = 'drag',
  orientation = 'horizontal',
  className,
  children,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onKeyDown,
  ...props
}: CompareSliderProps) {
  const [uncontrolled, setUncontrolled] = React.useState(() =>
    clamp(defaultValue, 0, 100),
  );
  const value = valueProp !== undefined ? clamp(valueProp, 0, 100) : uncontrolled;

  const rootRef = React.useRef<HTMLDivElement>(null);
  const dragging = React.useRef(false);

  const set = React.useCallback(
    (next: number) => {
      const clamped = clamp(next, 0, 100);
      if (valueProp === undefined) setUncontrolled(clamped);
      onValueChange?.(clamped);
    },
    [valueProp, onValueChange],
  );

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    onPointerMove?.(event);
    if (event.defaultPrevented) return;
    if (interaction === 'drag' && !dragging.current) return;

    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;

    const vertical = orientation === 'vertical';
    const position = vertical ? event.clientY - rect.top : event.clientX - rect.left;
    const size = vertical ? rect.height : rect.width;
    if (size > 0) set((position / size) * 100);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    onPointerDown?.(event);
    if (event.defaultPrevented || interaction !== 'drag') return;

    // Pointer capture keeps the drag alive when the cursor leaves the element,
    // which is most of a drag near either end.
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = true;
    handlePointerMove(event);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    onPointerUp?.(event);
    if (event.defaultPrevented || interaction !== 'drag') return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragging.current = false;
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;

    if (event.key === 'Home') {
      event.preventDefault();
      set(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      set(100);
      return;
    }
    if (!PAGE_KEYS.includes(event.key) && !ARROW_KEYS.includes(event.key)) return;

    event.preventDefault();

    // Page keys and shift-arrow both mean "a big step".
    const big = PAGE_KEYS.includes(event.key) || event.shiftKey;
    const vertical = orientation === 'vertical';
    const back = vertical
      ? ['ArrowUp', 'PageUp'].includes(event.key)
      : ['ArrowLeft', 'PageUp'].includes(event.key);

    set(value + step * (big ? 10 : 1) * (back ? -1 : 1));
  };

  const context = React.useMemo<ContextValue>(
    () => ({ value, interaction, orientation }),
    [value, interaction, orientation],
  );

  return (
    <CompareSliderContext.Provider value={context}>
      <div
        {...props}
        ref={rootRef}
        role="slider"
        tabIndex={0}
        aria-orientation={orientation}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value)}
        aria-valuetext={`${Math.round(value)}% optimized`}
        data-orientation={orientation}
        className={cn(
          'relative isolate select-none overflow-hidden outline-none',
          'touch-none focus-visible:ring-2 focus-visible:ring-accent',
          orientation === 'horizontal' ? 'w-full' : 'h-full',
          className,
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
      >
        {children}
      </div>
    </CompareSliderContext.Provider>
  );
}

/** The layer revealed on the trailing side of the handle. */
export function CompareSliderBefore({
  className,
  style,
  children,
  ...props
}: React.ComponentProps<'div'>) {
  const { value, orientation } = useCompareSlider('CompareSliderBefore');
  const clipPath =
    orientation === 'vertical' ? `inset(${value}% 0 0 0)` : `inset(0 0 0 ${value}%)`;

  return (
    <div
      aria-hidden="true"
      data-slot="compare-slider-before"
      {...props}
      className={cn('absolute inset-0 h-full w-full', className)}
      style={{ clipPath, ...style }}
    >
      {children}
    </div>
  );
}

/** The layer revealed on the leading side of the handle. */
export function CompareSliderAfter({
  className,
  style,
  children,
  ...props
}: React.ComponentProps<'div'>) {
  const { value, orientation } = useCompareSlider('CompareSliderAfter');
  const clipPath =
    orientation === 'vertical'
      ? `inset(0 0 ${100 - value}% 0)`
      : `inset(0 ${100 - value}% 0 0)`;

  return (
    <div
      aria-hidden="true"
      data-slot="compare-slider-after"
      {...props}
      className={cn('absolute inset-0 h-full w-full', className)}
      style={{ clipPath, ...style }}
    >
      {children}
    </div>
  );
}

/** The draggable divider. */
export function CompareSliderHandle({
  className,
  style,
  children,
  ...props
}: React.ComponentProps<'div'>) {
  const { value, interaction, orientation } = useCompareSlider('CompareSliderHandle');
  const vertical = orientation === 'vertical';

  return (
    <div
      role="presentation"
      aria-hidden="true"
      data-slot="compare-slider-handle"
      {...props}
      className={cn(
        'absolute z-30 flex items-center justify-center',
        vertical ? 'left-0 h-10 w-full -translate-y-1/2' : 'top-0 h-full w-10 -translate-x-1/2',
        interaction === 'drag' && 'cursor-grab active:cursor-grabbing',
        className,
      )}
      style={{ [vertical ? 'top' : 'left']: `${value}%`, ...style }}
    >
      {children ?? (
        <>
          <div
            className={cn(
              'absolute bg-foreground/90',
              vertical
                ? 'top-1/2 h-0.5 w-full -translate-y-1/2'
                : 'left-1/2 h-full w-0.5 -translate-x-1/2',
            )}
          />
          {interaction === 'drag' && (
            <div className="z-30 grid size-9 place-items-center rounded-full border border-line-strong bg-background/90 text-foreground shadow-panel backdrop-blur-sm">
              <svg
                viewBox="0 0 24 24"
                width={14}
                height={14}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className={vertical ? 'rotate-90' : undefined}
              >
                <path d="M9 6 3 12l6 6M15 6l6 6-6 6" />
              </svg>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** A caption pinned to one side of the frame. */
export function CompareSliderLabel({
  side = 'before',
  className,
  children,
  ...props
}: React.ComponentProps<'div'> & { side?: 'before' | 'after' }) {
  const { orientation } = useCompareSlider('CompareSliderLabel');
  const vertical = orientation === 'vertical';

  return (
    <div
      data-slot="compare-slider-label"
      {...props}
      className={cn(
        'absolute z-20 rounded-md border border-line bg-background/80 px-2.5 py-1 font-mono text-2xs text-secondary backdrop-blur-sm',
        vertical
          ? side === 'before'
            ? 'left-2 top-2'
            : 'bottom-2 left-2'
          : side === 'before'
            ? 'left-2 top-2'
            : 'right-2 top-2',
        className,
      )}
    >
      {children}
    </div>
  );
}

export default CompareSlider;
