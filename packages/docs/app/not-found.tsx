import Link from 'next/link';
import { ArrowRight } from '@/components/Icons';
import { NAV_ORDER } from '@/lib/nav';

/**
 * The 404, as a lens pulling focus: the number starts as a blur and racks
 * sharp, which is about the only on-brand thing a missing page can do.
 *
 * Below it, the whole reading order. Someone who hit a dead link was looking
 * for *something* in the docs, so every page is one click away rather than
 * behind a single "go to the docs" button.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-shell flex-col items-center px-4 py-24 text-center sm:py-32">
      <p
        aria-hidden="true"
        className="animate-focus-in select-none font-mono text-7xl font-semibold tracking-tight text-foreground sm:text-8xl"
      >
        404
      </p>

      <h1
        className="mt-6 animate-rise text-2xl font-semibold text-foreground"
        style={{ animationDelay: '500ms' }}
      >
        This page is out of focus
      </h1>
      <p
        className="mt-3 max-w-sm animate-rise text-muted"
        style={{ animationDelay: '600ms' }}
      >
        It may have been renamed or moved. Here is everything that does exist.
      </p>

      <ul className="mt-8 grid w-full max-w-lg gap-2 text-left sm:grid-cols-2">
        {NAV_ORDER.map((page, index) => (
          <li
            key={page.href}
            className="animate-rise"
            style={{ animationDelay: `${700 + index * 60}ms` }}
          >
            <Link
              href={page.href}
              className="group flex h-full items-center justify-between gap-2 rounded-lg border border-line bg-surface px-4 py-3 text-sm font-medium text-foreground transition-[border-color,background-color,transform] duration-300 ease-out-expo hover:-translate-y-0.5 hover:border-line-strong hover:bg-raised"
            >
              {page.label}
              <ArrowRight className="h-3.5 w-3.5 text-subtle transition-[color,transform] duration-300 ease-out-expo group-hover:translate-x-0.5 group-hover:text-accent-bright" />
            </Link>
          </li>
        ))}
      </ul>

      <Link
        href="/"
        className="btn btn-ghost mt-6 animate-fade-in"
        style={{ animationDelay: '1200ms' }}
      >
        Back to the home page
      </Link>
    </div>
  );
}
