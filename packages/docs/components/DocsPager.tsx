'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { siblingsOf } from '@/lib/nav';
import { ArrowRight } from './Icons';

/**
 * The mono direction code above each title. Hidden from assistive tech and
 * replaced by a plain-language `sr-only` phrase, because "open paren prev close
 * paren" is not something anyone wants read aloud. `text-muted`, not subtle: it
 * is small text and has to clear AA.
 */
const CODE_CLASS =
  'font-mono text-[10.5px] font-medium uppercase leading-4 tracking-[0.14em] text-muted';

/** Previous / next links, derived from the reading order in `lib/nav.ts`. */
export function DocsPager() {
  const { prev, next } = siblingsOf(usePathname());
  if (!prev && !next) return null;

  return (
    <nav
      aria-label="Pagination"
      className="mt-14 grid gap-3 sm:grid-cols-2"
    >
      {/*
        Framed cards rather than bare links: the whole block is the target, and
        the direction code means the page title does not have to say which way
        it goes. The arrow leans the way you would travel. The frame's corner
        dots sit in the top padding, so that is deeper than a plain card's.
      */}
      {prev ? (
        <Link
          href={prev.href}
          className="frame group flex flex-col gap-1 px-5 pb-5 pt-7 transition-colors hover:border-line-strong hover:bg-raised"
        >
          <span className={CODE_CLASS} aria-hidden="true">
            (Prev)
          </span>
          <span className="sr-only">Previous page: </span>
          <span className="display flex items-center gap-2 text-lg text-foreground">
            <span aria-hidden="true" className="arrow-chip">
              <ArrowRight className="h-3 w-3 rotate-180 transition-transform duration-150 group-hover:-translate-x-0.5" />
            </span>
            {prev.label}
          </span>
        </Link>
      ) : (
        <span className="hidden sm:block" />
      )}

      {next ? (
        <Link
          href={next.href}
          className="frame group flex flex-col items-end gap-1 px-5 pb-5 pt-7 text-right transition-colors hover:border-line-strong hover:bg-raised"
        >
          <span className={CODE_CLASS} aria-hidden="true">
            (Next)
          </span>
          <span className="sr-only">Next page: </span>
          <span className="display flex items-center gap-2 text-lg text-foreground">
            {next.label}
            <span aria-hidden="true" className="arrow-chip">
              <ArrowRight className="btn-arrow h-3 w-3" />
            </span>
          </span>
        </Link>
      ) : null}
    </nav>
  );
}
