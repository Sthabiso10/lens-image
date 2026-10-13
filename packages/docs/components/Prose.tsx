/**
 * Shared typographic wrapper for documentation pages.
 *
 * Hand-rolled rather than `@tailwindcss/typography`, to keep the docs' own
 * dependency list short: the library is the product, the site is scaffolding.
 * Everything is arbitrary-variant selectors on the article, so pages stay
 * plain semantic JSX with no per-element class soup.
 *
 * The scale stays modest: body text is 15px, `h3` is a step above it and `h2`
 * a step above that. Headings use the display face (tight Inter), which is what
 * gives the pages their editorial note without making them shout; separation
 * between sections still comes from space, not from size or rules.
 */

import type { ReactNode } from 'react';
import styles from './Prose.module.css';

export function Prose({ children }: { children: ReactNode }) {
  return (
    <article
      className="flex max-w-prose flex-col gap-4 text-base text-secondary
        [&_a]:text-accent-bright [&_a]:underline [&_a]:decoration-accent-bright/35 [&_a]:underline-offset-[3px] [&_a:hover]:decoration-accent-bright

        [&_h2:not([data-step])]:mt-12 [&_h2:not([data-step])]:scroll-mt-20 [&_h2:not([data-step])]:font-display [&_h2:not([data-step])]:text-2xl [&_h2:not([data-step])]:font-semibold [&_h2:not([data-step])]:text-foreground
        [&_h3]:mt-6 [&_h3]:scroll-mt-20 [&_h3]:font-display [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-foreground

        [&_strong]:font-medium [&_strong]:text-foreground
        [&_em]:text-foreground

        [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2
        [&_ol]:flex [&_ol]:flex-col [&_ol]:gap-2
        [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_li]:marker:text-muted
        [&_ol_li]:list-decimal [&_ol_li]:marker:font-mono [&_ol_li]:marker:text-muted

        [&_:is(p,li,td,th,h2,h3,a,strong)>code]:rounded [&_:is(p,li,td,th,h2,h3,a,strong)>code]:border [&_:is(p,li,td,th,h2,h3,a,strong)>code]:border-line [&_:is(p,li,td,th,h2,h3,a,strong)>code]:bg-raised [&_:is(p,li,td,th,h2,h3,a,strong)>code]:px-1 [&_:is(p,li,td,th,h2,h3,a,strong)>code]:py-0.5 [&_:is(p,li,td,th,h2,h3,a,strong)>code]:font-mono [&_:is(p,li,td,th,h2,h3,a,strong)>code]:text-[0.875em] [&_:is(p,li,td,th,h2,h3,a,strong)>code]:text-foreground

        [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:rounded-xl [&_table]:border [&_table]:border-line [&_table]:bg-surface [&_table]:text-left [&_table]:text-sm
        [&_th]:whitespace-nowrap [&_th]:bg-raised/50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted
        [&_thead_tr]:border-b [&_thead_tr]:border-line
        [&_td]:border-t [&_td]:border-line [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-top
        [&_tbody_tr:first-child_td]:border-t-0
        [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-raised/40"
    >
      {children}
    </article>
  );
}

/**
 * The block at the top of every docs page: boxed group kicker, display title,
 * standfirst, then a rule that closes the header off from the body.
 *
 * `section` is the nav group the page belongs to ("Start here", "Reference"),
 * so the kicker says where in the docs you are. This is the page's only `h1`.
 * Lives outside `<Prose>` so the title can sit at the page scale without the
 * prose selectors having an opinion about `h1`. The lead is `text-muted`, not
 * `text-subtle`: it is real reading text and has to clear AA.
 */
export function PageHeader({
  section,
  title,
  lead,
  eyebrow,
}: {
  section: string;
  title: string;
  lead?: ReactNode;
  /** Something that sits above the kicker, such as an announcement pill. */
  eyebrow?: ReactNode;
}) {
  return (
    <header className="mb-8 max-w-prose">
      {eyebrow ? <div className="mb-5">{eyebrow}</div> : null}
      <p className="kicker">{section}</p>
      <h1 className="display mt-4 break-words text-4xl text-foreground sm:text-5xl lg:text-6xl">
        {title}
      </h1>
      {lead ? <p className="mt-5 max-w-[38rem] text-lg text-muted">{lead}</p> : null}
      <hr className="mt-8 border-line" />
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

/**
 * One step, laid out as a band: a hairline above,
 * a small mono code tag over the title on the left, and a large thin numeral
 * on the right. Both numbers are the same counter printed twice (see
 * Prose.module.css) and both are `aria-hidden`, because the title is what a
 * screen reader should hear and the sequence is already an ordered flow.
 */
export function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="step relative border-t border-line py-8 first:border-t-0 first:pt-2 last:pb-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <span
            aria-hidden="true"
            className={`${styles.code} font-mono text-[10.5px] font-medium leading-4 tracking-[0.14em] text-muted`}
          />
          <h2
            data-step
            className="display mt-2 scroll-mt-20 break-words text-2xl text-foreground"
          >
            {title}
          </h2>
        </div>
        <span
          aria-hidden="true"
          className={`${styles.numeral} select-none font-display text-5xl font-extralight leading-none tracking-[-0.05em] text-subtle tabular-nums sm:text-6xl`}
        />
      </div>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </div>
  );
}

/*
 * The three kinds of aside, each with the word that names it in the panel's
 * top-right. Note is the neutral one, warning is for things that bite, tip is
 * for things worth knowing. The tag text is real text (not decoration), so it
 * uses the status colours that clear AA on the panel surface.
 */
const CALLOUT_TONES = {
  note: { tag: 'Note', dot: 'bg-accent', tagClass: 'border-line-strong text-muted' },
  warn: { tag: 'Warning', dot: 'bg-warn', tagClass: 'border-warn/40 text-warn' },
  tip: { tag: 'Tip', dot: 'bg-signal', tagClass: 'border-signal/40 text-signal' },
} as const;

/**
 * An aside that must not be skimmed past: a caveat, a gotcha, a "do this once
 * and forget it". Styled as a small node panel, like the
 * boxes in the home page's pipeline graph: a header strip with the title on the left and a
 * mono type tag on the right, then the body underneath.
 */
export function Callout({
  tone = 'note',
  title,
  children,
}: {
  tone?: 'note' | 'warn' | 'tip';
  title?: string;
  children: ReactNode;
}) {
  const { tag, dot, tagClass } = CALLOUT_TONES[tone];

  return (
    <aside className="overflow-hidden rounded-xl border border-line bg-surface text-sm">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-raised/50 px-4 py-2">
        <p className="flex min-w-0 items-center gap-2 font-medium text-foreground">
          <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
          {title}
        </p>
        <span
          className={`shrink-0 rounded border px-1.5 py-px font-mono text-[10.5px] font-medium uppercase leading-4 tracking-[0.14em] ${tagClass}`}
        >
          {tag}
        </span>
      </div>
      <div className="px-4 py-3 text-muted [&_a]:text-accent-bright [&_a]:underline [&_a]:decoration-accent-bright/35 [&_a]:underline-offset-[3px] [&_a:hover]:decoration-accent-bright [&_code]:rounded [&_code]:border [&_code]:border-line [&_code]:bg-raised [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.875em] [&_code]:text-foreground">
        {children}
      </div>
    </aside>
  );
}
