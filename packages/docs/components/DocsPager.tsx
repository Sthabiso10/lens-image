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
      className="mt-12 flex items-center justify-between gap-3 border-t border-line pt-5"
    >
      {prev ? (
        <Link
          href={prev.href}
          className="group inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-foreground"
        >
          <ArrowRight className="h-3.5 w-3.5 rotate-180 text-subtle transition-colors group-hover:text-foreground" />
          {prev.label}
        </Link>
      ) : (
        <span />
      )}

      {next ? (
        <Link
          href={next.href}
          className="group inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-foreground"
        >
          {next.label}
          <ArrowRight className="h-3.5 w-3.5 text-subtle transition-colors group-hover:text-foreground" />
        </Link>
      ) : null}
    </nav>
  );
}
