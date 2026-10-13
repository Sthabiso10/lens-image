'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GITHUB_URL, NAV_GROUPS, VERSION } from '@/lib/nav';
import { ArrowRight, Close, GitHub, Menu } from './Icons';

/**
 * The two links that live in the floating pill itself. Everything else is one
 * click away in the menu overlay, so the pill stays short enough to stay a pill.
 */
const PILL_LINKS = [
  { href: '/docs', label: 'Docs' },
  { href: '/playground', label: 'Playground' },
] as const;

const FOCUSABLE = 'a[href], button:not([disabled])';

function isActive(pathname: string, href: string) {
  const clean = pathname.replace(/\/$/, '') || '/';
  if (href === '/docs') return clean.startsWith('/docs');
  return clean === href;
}

/**
 * The site header: a logo, a floating pill in the middle, and the calls to
 * action on the right. The bar itself has no background; it sits over the page
 * on a short fade of the canvas colour so content scrolling underneath never
 * collides with the logo.
 *
 * The pill carries a Menu button, the two most-used links and a live read-out
 * of how far down the page you are. The read-out is decoration for sighted
 * users (the same information is in the scrollbar), so it is hidden from
 * assistive tech rather than announced on every scroll tick.
 *
 * Height stays at 48px (`h-12`): the docs rail, the reading-progress line and
 * `main`'s top padding are all measured from it. Inside it, the logo, the
 * centre pill, the GitHub circle and Get started are all 40px, so they share
 * one baseline. The pill and its links are the `segmented` toggle, the GitHub
 * link an icon button and Get started the primary, so the header is built from
 * the same pieces as the rest of the site.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [percent, setPercent] = useState(0);
  const header = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const overlay = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Route changes close the menu.
  useEffect(() => close(), [pathname, close]);

  /*
   * Scroll progress. Reads happen inside a requestAnimationFrame so a fast
   * scroll costs at most one layout read per frame, and state is only set when
   * the rounded number actually changes. Height changes (images decoding,
   * route changes, the window resizing) shift the denominator without firing a
   * scroll event, so a ResizeObserver on the body re-reads for those.
   */
  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const next = max > 0 ? Math.min(100, Math.max(0, Math.round((window.scrollY / max) * 100))) : 0;
      setPercent((current) => (current === next ? current : next));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };

    read();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer.disconnect();
    };
  }, [pathname]);

  /*
   * While the overlay is open: lock the page behind it, move focus into it,
   * close on Escape, and keep Tab inside.
   *
   * The overlay is a modal, so everything outside it and the Menu button (the
   * way out, which stays on top) is made `inert`: the page content, the footer
   * and the header's own logo, links and buttons. Those header controls sit in
   * the DOM between the Menu button and the overlay and above it in z-order, so
   * without `inert` they would stay clickable and tabbable. The attribute is set
   * by hand because React 18's types do not know it. The Tab loop below is then
   * a backstop for focus that has escaped to the browser chrome.
   */
  useEffect(() => {
    if (!open) return;

    const inerted = [
      document.getElementById('main'),
      document.querySelector<HTMLElement>('footer'),
      ...Array.from(header.current?.querySelectorAll<HTMLElement>('[data-menu-inert]') ?? []),
    ].filter((node): node is HTMLElement => node !== null);
    for (const node of inerted) node.setAttribute('inert', '');

    document.documentElement.style.overflow = 'hidden';
    const first = overlay.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;

      const loop = [
        menuButton.current,
        ...Array.from(overlay.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []),
      ].filter((node): node is HTMLElement => node !== null);
      if (loop.length === 0) return;

      const start = loop[0];
      const end = loop[loop.length - 1];
      const current = document.activeElement as HTMLElement | null;

      if (!current || !loop.includes(current)) {
        event.preventDefault();
        start.focus();
      } else if (event.shiftKey && current === start) {
        event.preventDefault();
        end.focus();
      } else if (!event.shiftKey && current === end) {
        event.preventDefault();
        start.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.documentElement.style.overflow = '';
      for (const node of inerted) node.removeAttribute('inert');

      /*
       * Every way of closing ends here (Escape, the Menu button, a link, a route
       * change), so focus is put back in one place. By now the overlay is gone,
       * so if focus was inside it the browser has dropped it to <body>: that is
       * the case to repair. If it is anywhere else, the Menu button already has
       * it or navigation has moved it into the new page, and it stays put.
       */
      const active = document.activeElement;
      if (!active || active === document.body) menuButton.current?.focus();
    };
  }, [open]);

  return (
    <header ref={header} className="pointer-events-none fixed inset-x-0 top-0 z-50 h-12">
      {/* The fade that lets a transparent bar sit over moving content. */}
      <div
        aria-hidden="true"
        className={`absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-background via-background/70 to-transparent transition-opacity duration-200 ${
          open ? 'opacity-0' : 'opacity-100'
        }`}
      />

      <div className="relative z-20 mx-auto flex h-12 max-w-shell items-center gap-2 px-4 sm:px-6">
        <Link
          href="/"
          data-menu-inert=""
          className="pointer-events-auto flex h-10 items-center gap-2 text-sm font-semibold tracking-tight text-foreground"
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
          <img src="/brand/icon-64.png" alt="" width={26} height={26} />
          Lens
        </Link>

        {/*
          Centred on the viewport from `md` up. Below that it is an ordinary
          flex child pushed right, because a centred pill would collide with
          the logo and the GitHub button at 375px.
        */}
        <div className="segmented pointer-events-auto max-md:ml-auto md:absolute md:left-1/2 md:-translate-x-1/2">
          <button
            ref={menuButton}
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={open ? 'site-menu' : undefined}
            className="segmented-item min-w-[4.75rem] text-foreground!"
          >
            {/* Keyed so the icon pops as it swaps. */}
            {open ? (
              <Close key="close" className="animate-pop" />
            ) : (
              <Menu key="menu" />
            )}
            {open ? 'Close' : 'Menu'}
          </button>

          <nav
            aria-label="Primary"
            data-menu-inert=""
            className={`hidden items-center gap-1 transition-opacity md:flex ${open ? 'pointer-events-none opacity-0' : ''}`}
          >
            {PILL_LINKS.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className="segmented-item"
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/*
            The padding is on the wrapper and the number sits in a fixed 4ch
            box, so "0%" to "100%" all end at the same x and "100%" fits.
          */}
          <span
            aria-hidden="true"
            data-menu-inert=""
            className={`pl-1 pr-2.5 font-mono text-xs text-muted transition-opacity ${open ? 'opacity-0' : ''}`}
          >
            <span className="inline-block w-[4ch] text-right tabular-nums">{percent}%</span>
          </span>
        </div>

        <div
          data-menu-inert=""
          className={`ml-2 flex items-center gap-2 transition-opacity md:ml-auto ${
            open ? 'pointer-events-none opacity-0' : 'pointer-events-auto'
          }`}
        >
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Lens on GitHub"
            className="btn-icon"
          >
            <GitHub />
          </a>
          <Link href="/docs/getting-started" className="btn-light max-sm:hidden">
            Get started
            <span className="btn-nub">
              <ArrowRight className="btn-arrow h-3 w-3" />
            </span>
          </Link>
        </div>
      </div>

      {open ? (
        <div
          ref={overlay}
          id="site-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Site menu"
          className="pointer-events-auto fixed inset-0 z-10 animate-fade-in overflow-y-auto bg-background/95 backdrop-blur-xl"
        >
          <div className="mx-auto max-w-shell px-4 pb-16 pt-24 sm:px-6">
            <div className="grid gap-x-12 gap-y-10 md:grid-cols-2">
              {NAV_GROUPS.map((group, index) => (
                <div
                  key={group.title}
                  className="animate-rise"
                  style={{ animationDelay: `${60 + index * 60}ms` }}
                >
                  <p className="kicker">{group.title}</p>
                  <ul className="mt-3 flex flex-col">
                    {group.items.map((item) => {
                      const current = (pathname.replace(/\/$/, '') || '/') === item.href;
                      return (
                        <li key={item.href} className="border-t border-line first:border-t-0">
                          <Link
                            href={item.href}
                            onClick={close}
                            aria-current={current ? 'page' : undefined}
                            className="group block py-3"
                          >
                            <span
                              className={`display flex items-center gap-3 text-3xl tracking-[-0.03em] transition-colors sm:text-4xl ${
                                current
                                  ? 'text-accent-bright'
                                  : 'text-foreground group-hover:text-accent-bright'
                              }`}
                            >
                              {item.label}
                              <ArrowRight className="h-5 w-5 -translate-x-1 text-subtle opacity-0 transition-[opacity,transform] duration-300 ease-out-expo group-hover:translate-x-0 group-hover:text-accent-bright group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100" />
                            </span>
                            {item.summary ? (
                              <span className="mt-1 block max-w-md text-sm text-muted">
                                {item.summary}
                              </span>
                            ) : null}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>

            <div className="mt-12 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line pt-6">
              <Link href="/docs/getting-started" onClick={close} className="btn-light">
                Get started
                <span className="btn-nub">
                  <ArrowRight className="btn-arrow h-3 w-3" />
                </span>
              </Link>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer noopener"
                onClick={close}
                className="btn-ghost"
              >
                <GitHub className="h-3.5 w-3.5" />
                GitHub
              </a>
              <span className="font-mono text-xs text-muted sm:ml-auto">v{VERSION}</span>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
