import { Reveal } from '@/components/Reveal';

/**
 * The opening of every home-page section: a mono kicker chip, a display
 * heading, and an optional lead. One component so the rhythm cannot drift
 * between sections.
 *
 * The heading's second line is set one tone down (`text-muted`, not the
 * decorative `--fg-subtle`) so that it stays legible at AA while still
 * reading as the quieter half of the sentence.
 */
export function SectionHead({
  kicker,
  title,
  quiet,
  lead,
  align = 'left',
  children,
}: {
  kicker: string;
  title: string;
  /** The grey second line, rendered after a line break. */
  quiet?: string;
  lead?: React.ReactNode;
  align?: 'left' | 'center';
  /** Sits to the right of the heading on wide screens (a button, usually). */
  children?: React.ReactNode;
}) {
  const centered = align === 'center';

  return (
    <Reveal
      className={`flex flex-col gap-6 ${
        centered ? 'items-center text-center' : 'lg:flex-row lg:items-end lg:justify-between'
      }`}
    >
      <div className={centered ? 'flex flex-col items-center' : undefined}>
        <span className="kicker">{kicker}</span>
        <h2 className="display mt-4 max-w-3xl text-4xl text-foreground sm:text-5xl">
          {title}
          {quiet ? (
            <>
              <br />
              <span className="text-muted">{quiet}</span>
            </>
          ) : null}
        </h2>
        {lead ? <p className="mt-4 max-w-xl text-base text-muted">{lead}</p> : null}
      </div>
      {children}
    </Reveal>
  );
}
