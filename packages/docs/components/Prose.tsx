/**
 * Shared typographic wrapper for documentation pages.
 *
 * Hand-rolled rather than `@tailwindcss/typography`, to keep the docs' own
 * dependency list short: the library is the product, the site is scaffolding.
 * Everything is arbitrary-variant selectors on the article, so pages stay
 * plain semantic JSX with no per-element class soup.
 *
 * The scale is flat by design: body text is 15px, `h3` is body size at a
 * heavier weight, and `h2` is one step above that. Separation between sections
 * comes from space, not from size or rules.
 */

import type { ReactNode } from 'react';

export function Prose({ children }: { children: ReactNode }) {
  return (
    <article
      className="flex max-w-prose flex-col gap-4 text-base text-secondary
        [&_a]:text-accent-bright [&_a]:underline [&_a]:decoration-accent-bright/35 [&_a]:underline-offset-[3px] [&_a:hover]:decoration-accent-bright

        [&_h2:not([data-step])]:mt-10 [&_h2:not([data-step])]:scroll-mt-20 [&_h2:not([data-step])]:text-xl [&_h2:not([data-step])]:font-medium [&_h2:not([data-step])]:text-foreground
        [&_h3]:mt-6 [&_h3]:scroll-mt-20 [&_h3]:text-base [&_h3]:font-medium [&_h3]:text-foreground

        [&_strong]:font-medium [&_strong]:text-foreground
        [&_em]:text-foreground

        [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2
        [&_ol]:flex [&_ol]:flex-col [&_ol]:gap-2
        [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_li]:marker:text-subtle
        [&_ol_li]:list-decimal [&_ol_li]:marker:font-mono [&_ol_li]:marker:text-subtle

        [&_:is(p,li,td,th,h2,h3,a,strong)>code]:rounded [&_:is(p,li,td,th,h2,h3,a,strong)>code]:border [&_:is(p,li,td,th,h2,h3,a,strong)>code]:border-line [&_:is(p,li,td,th,h2,h3,a,strong)>code]:bg-raised [&_:is(p,li,td,th,h2,h3,a,strong)>code]:px-1 [&_:is(p,li,td,th,h2,h3,a,strong)>code]:py-0.5 [&_:is(p,li,td,th,h2,h3,a,strong)>code]:font-mono [&_:is(p,li,td,th,h2,h3,a,strong)>code]:text-[0.875em] [&_:is(p,li,td,th,h2,h3,a,strong)>code]:text-foreground

        [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:text-left [&_table]:text-sm
        [&_th]:whitespace-nowrap [&_th]:pb-2 [&_th]:pr-6 [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted
        [&_thead_tr]:border-b [&_thead_tr]:border-line
        [&_td]:border-t [&_td]:border-line [&_td]:py-2.5 [&_td]:pr-6 [&_td]:align-top
        [&_tbody_tr:first-child_td]:border-t-0"
    >
      {children}
    </article>
  );
}

/**
 * The block at the top of every docs page: section kicker, title, standfirst,
 * then a rule that closes the header off from the body.
 *
 * Lives outside `<Prose>` so the title can sit at the page scale without the
 * prose selectors having an opinion about `h1`.
 */
export function PageHeader({
  section,
  title,
  lead,
}: {
  section: string;
  title: string;
  lead?: ReactNode;
}) {
  return (
    <header className="mb-8 max-w-prose">
      <p className="label">{section}</p>
      <h1 className="mt-1.5 text-3xl font-semibold text-foreground">{title}</h1>
      {lead ? <p className="mt-3 text-base text-muted">{lead}</p> : null}
      <hr className="mt-6 border-line" />
    </header>
  );
}

/**
 * A numbered sequence.
 *
 * The number comes from a CSS counter rather than a prop, so inserting a step
 * in the middle does not mean renumbering the ones below it. Each step's title
 * is a real `<h2>`, so it is linkable and shows up in "On this page", but it
 * carries `data-step` to opt out of the prose heading spacing, which is set up
 * for sections rather than list items.
 */
export function Steps({ children }: { children: ReactNode }) {
  return <div className="steps my-2 flex flex-col">{children}</div>;
}

export function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="step relative flex gap-4 pb-8 last:pb-0">
      <div className="flex flex-col items-center">
        <span
          aria-hidden="true"
          className="step-number grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line bg-raised text-xs font-medium tabular-nums text-foreground"
        />
        {/* Connector to the next step. The last one's is hidden by `last:pb-0`
            collapsing the track to nothing. */}
        <span aria-hidden="true" className="mt-1.5 w-px flex-1 bg-line" />
      </div>

      <div className="min-w-0 flex-1">
        <h2 data-step className="scroll-mt-20 text-base font-medium text-foreground">
          {title}
        </h2>
        <div className="mt-3 flex flex-col gap-4">{children}</div>
      </div>
    </div>
  );
}

/**
 * An aside that must not be skimmed past: a caveat, a gotcha, a "do this once
 * and forget it". Two tones: neutral and warning.
 */
export function Callout({
  tone = 'note',
  title,
  children,
}: {
  tone?: 'note' | 'warn';
  title?: string;
  children: ReactNode;
}) {
  return (
    <aside className="max-w-prose rounded-lg border border-line bg-surface p-4 text-sm">
      {title ? (
        <p className="mb-1 flex items-center gap-2 font-medium text-foreground">
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${tone === 'warn' ? 'bg-warn' : 'bg-accent'}`}
          />
          {title}
        </p>
      ) : null}
      <div className="text-muted [&_a]:text-accent-bright [&_a]:underline [&_a]:decoration-accent-bright/35 [&_a]:underline-offset-[3px] [&_a:hover]:decoration-accent-bright [&_code]:rounded [&_code]:border [&_code]:border-line [&_code]:bg-raised [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.875em] [&_code]:text-foreground">
        {children}
      </div>
    </aside>
  );
}
