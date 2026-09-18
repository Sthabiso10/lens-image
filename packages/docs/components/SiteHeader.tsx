'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GITHUB_URL, HEADER_LINKS, NAV_GROUPS, VERSION } from '@/lib/nav';
import { Close, GitHub, Menu } from './Icons';

function isActive(pathname: string, href: string) {
  const clean = pathname.replace(/\/$/, '') || '/';
  if (clean === href) return true;
  // "Docs" covers every /docs/* page that no other header link claims
  // /docs/getting-started lights it, /docs/api lights "API" instead.
  const claimed = HEADER_LINKS.some((link) => link.href === clean);
  return href === '/docs' && !claimed && clean.startsWith('/docs');
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Route changes close the menu; an open menu locks the page behind it.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.documentElement.style.overflow = open ? 'hidden' : '';
    return () => {
      document.documentElement.style.overflow = '';
    };
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 h-12 border-b border-line bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-12 max-w-shell items-center gap-6 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground"
          aria-label="Lens home"
        >
          {/*
            The mark as a raster rather than the wordmark lockup. At a 48px
            header the lockup's "lens" would render about 10px tall and turn to
            mush, whereas real text stays crisp at any zoom and is selectable.
            The file is transparent, so it sits on the header rather than
            reading as a tile. A plain <img> because the export is static, so
            next/image would only add a loader for a 20px file.
          */}
          <img
            src="/brand/icon-64.png"
            alt=""
            width={26}
            height={26}
          />
          Lens
        </Link>

        <nav className="hidden items-center gap-0.5 md:flex" aria-label="Primary">
          {HEADER_LINKS.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                  active
                    ? 'bg-raised text-foreground'
                    : 'text-muted hover:bg-raised/60 hover:text-foreground'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <span className="hidden px-2 font-mono text-xs text-subtle sm:inline-block">
            v{VERSION}
          </span>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Lens on GitHub"
            className="btn btn-ghost w-8 px-0"
          >
            <GitHub />
          </a>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="btn btn-ghost w-8 px-0 md:hidden"
          >
            {open ? <Close /> : <Menu />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 top-12 overflow-y-auto border-t border-line bg-background px-4 pb-16 pt-4 md:hidden">
          <nav aria-label="Mobile">
            {NAV_GROUPS.map((group) => (
              <div key={group.title} className="mb-6">
                <p className="label px-2 py-1.5">{group.title}</p>
                <ul className="flex flex-col">
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="block rounded-md px-2 py-2 text-base text-secondary hover:bg-raised hover:text-foreground"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
