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
        className="display animate-focus-in select-none text-7xl text-foreground sm:text-[9rem] sm:leading-none"
      >
        404
      </p>

      <p className="kicker mt-8 animate-fade-in" style={{ animationDelay: '400ms' }}>
        Error 404
      </p>

      <h1
        className="display mt-6 animate-rise text-3xl text-foreground"
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
              className="frame group flex h-full items-center justify-between gap-2 px-5 py-4 text-sm font-medium text-foreground transition-[border-color,background-color,transform] duration-300 ease-out-expo hover:-translate-y-0.5 hover:border-line-strong hover:bg-raised"
            >
              {page.label}
              <span aria-hidden="true" className="arrow-chip">
                <ArrowRight className="btn-arrow h-3 w-3" />
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <Link
        href="/"
        className="btn-light mt-8 animate-fade-in"
        style={{ animationDelay: '1200ms' }}
      >
        Back to the home page
        <span className="btn-nub">
          <ArrowRight className="btn-arrow h-3 w-3" />
        </span>
      </Link>
    </div>
  );
}
