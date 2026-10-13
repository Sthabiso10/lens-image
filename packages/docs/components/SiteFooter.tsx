import Link from 'next/link';
import { GITHUB_URL, NAV_GROUPS, NPM_URL, VERSION } from '@/lib/nav';

/*
 * The footer is deliberately quiet: a closing line, three short columns and a
 * hairline row. No wordmark, no band, no decoration. The page above it has
 * already made its case; this is where a reader who finished goes to find the
 * next link, so it is built for finding things and nothing else.
 */

/** Where the changelog lives. Built from the repo URL so a rename is one edit. */
const CHANGELOG_URL = `${GITHUB_URL}/blob/main/CHANGELOG.md`;

interface FooterLink {
  label: string;
  href: string;
  /** External links open in a new tab and say so with a trailing arrow. */
  external?: boolean;
}

/**
 * The Playground is a product page rather than documentation, so it is listed
 * once, under Product, and filtered out of the Docs column. Everything else in
 * the nav is documentation and comes straight from `lib/nav.ts`, so a new docs
 * page appears here without a second edit.
 */
const PRODUCT: FooterLink[] = [
  { label: 'Docs', href: '/docs' },
  { label: 'Playground', href: '/playground' },
  { label: 'Changelog', href: CHANGELOG_URL, external: true },
];

const DOCS: FooterLink[] = NAV_GROUPS.flatMap((group) => group.items)
  .filter((item) => item.href !== '/playground')
  .map((item) => ({ label: item.label, href: item.href }));

const ELSEWHERE: FooterLink[] = [
  { label: 'GitHub', href: GITHUB_URL, external: true },
  { label: 'npm', href: NPM_URL, external: true },
];

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  { title: 'Product', links: PRODUCT },
  { title: 'Docs', links: DOCS },
  { title: 'Elsewhere', links: ELSEWHERE },
];

const LINK_CLASS =
  'inline-block rounded-sm py-0.5 text-sm text-secondary transition-colors hover:text-foreground';

/**
 * No top margin here on purpose. The docs rail is a filled column that runs the
 * height of its section, so a gap above the footer would leave the rail's
 * bottom edge floating in mid-air. Pages provide their own trailing space.
 *
 * Two columns on a phone, with the closing line spanning both above them; at
 * `lg` the line takes the left and the three columns sit beside it.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto max-w-shell px-4 sm:px-6">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 py-10 sm:grid-cols-3 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))] lg:gap-x-10">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <Link
              href="/"
              aria-label="Lens, home"
              className="inline-flex items-center gap-2.5 rounded-md"
            >
              <img src="/brand/icon-64.png" alt="" width={24} height={24} className="h-6 w-6" />
              <span className="display text-base text-foreground">Lens</span>
            </Link>
            <p className="mt-3 max-w-[16rem] text-sm text-muted">
              Zero-dependency core. Your storage, your codec.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <p className="kicker">{column.title}</p>
              <ul className="mt-3 flex flex-col">
                {column.links.map((link) => (
                  <li key={link.href}>
                    {link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer noopener"
                        className={LINK_CLASS}
                      >
                        {link.label}
                        <span aria-hidden="true" className="ml-1 text-muted">
                          ↗
                        </span>
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    ) : (
                      <Link href={link.href} className={LINK_CLASS}>
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/*
          The hairline row. Small uppercase mono with wide tracking, at
          --fg-muted: 10.5px type needs the AA-passing grey, not --fg-subtle.
        */}
        <div className="flex flex-col gap-2 border-t border-line py-5 font-mono text-[10.5px] uppercase leading-4 tracking-[0.14em] text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>MIT License · v{VERSION}</p>
          <p>Built for Node.js</p>
        </div>
      </div>
    </footer>
  );
}
