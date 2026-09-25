'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { siblingsOf } from '@/lib/nav';
import { ArrowRight } from './Icons';

/** Previous / next links, derived from the reading order in `lib/nav.ts`. */
export function DocsPager() {
  const { prev, next } = siblingsOf(usePathname());
  if (!prev && !next) return null;

  return (
    <nav
      aria-label="Pagination"
      className="mt-12 grid gap-2 border-t border-line pt-6 sm:grid-cols-2"
    >
      {/*
        Cards rather than bare links: the whole block is the target, and the
        direction label means the page title does not have to say which way
        it goes. The arrow leans the way you would travel.
      */}
      {prev ? (
        <Link
          href={prev.href}
          className="group flex flex-col gap-0.5 rounded-lg border border-line bg-surface px-4 py-3 transition-colors hover:border-line-strong hover:bg-raised"
        >
          <span className="label">Previous</span>
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ArrowRight className="h-3.5 w-3.5 rotate-180 text-subtle transition-[color,transform] duration-300 ease-out-expo group-hover:-translate-x-0.5 group-hover:text-accent-bright" />
            {prev.label}
          </span>
        </Link>
      ) : (
        <span className="hidden sm:block" />
      )}

      {next ? (
        <Link
          href={next.href}
          className="group flex flex-col items-end gap-0.5 rounded-lg border border-line bg-surface px-4 py-3 text-right transition-colors hover:border-line-strong hover:bg-raised"
        >
          <span className="label">Next</span>
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            {next.label}
            <ArrowRight className="h-3.5 w-3.5 text-subtle transition-[color,transform] duration-300 ease-out-expo group-hover:translate-x-0.5 group-hover:text-accent-bright" />
          </span>
        </Link>
      ) : null}
    </nav>
  );
}
