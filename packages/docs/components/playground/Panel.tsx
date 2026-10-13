import { useId } from 'react';

/**
 * One dark panel in the studio: a title on the left, a small mono type tag on
 * the right, and the controls underneath.
 *
 * The tag is a node-graph label ("SOURCE", "EFFECT",
 * "PREVIEW"): it says what *kind* of thing the panel is, which the title (what
 * it is called) does not. It is decoration for sighted users, so it is
 * `aria-hidden`; the title names the region.
 */
export function Panel({
  title,
  tag,
  children,
  className = '',
  flush = false,
}: {
  title: string;
  tag: string;
  children: React.ReactNode;
  className?: string;
  /** Drops the body padding, for content that runs edge to edge. */
  flush?: boolean;
}) {
  const id = useId();

  return (
    <section
      aria-labelledby={id}
      className={`min-w-0 rounded-xl border border-line bg-surface ${className}`}
    >
      <header className="flex items-center justify-between gap-3 border-b border-line px-3.5 py-2.5">
        <h2 id={id} className="text-sm font-medium text-foreground">
          {title}
        </h2>
        <span
          aria-hidden="true"
          className="font-mono text-[10.5px] uppercase leading-4 tracking-[0.14em] text-muted"
        >
          {tag}
        </span>
      </header>
      <div className={flush ? '' : 'p-3.5'}>{children}</div>
    </section>
  );
}

/** A labelled group inside a panel. `htmlFor` ties the label to its control. */
export function Field({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="label mb-1.5 block">
          {label}
        </label>
      ) : (
        <p className="label mb-1.5">{label}</p>
      )}
      {children}
      {hint ? <p className="mt-1.5 text-2xs text-muted">{hint}</p> : null}
    </div>
  );
}
