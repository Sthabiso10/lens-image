'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_GROUPS } from '@/lib/nav';
import { useIndicator } from '@/lib/use-indicator';

/**
 * The docs rail: the page tree.
 *
 * Hidden below `lg`: the header's mobile menu carries the same tree there, so
 * this never renders twice on a phone.
 */
export function DocsSidebar() {
  const pathname = usePathname().replace(/\/$/, '') || '/';
  const nav = useRef<HTMLElement>(null);
  // The docs layout survives navigation, so one marker can glide from the
  // page you left to the one you opened instead of blinking between them.
  const marker = useIndicator(nav, '[aria-current="page"]', pathname);

  return (
    <nav ref={nav} aria-label="Documentation" className="relative flex flex-col gap-5">
      <span
        aria-hidden="true"
        className="absolute rounded-md bg-raised"
        style={{
          top: marker.top,
          left: marker.left,
          width: marker.width,
          height: marker.height,
          opacity: marker.visible ? 1 : 0,
          transition: marker.animate
            ? 'top 450ms var(--ease-out-expo), height 450ms var(--ease-out-expo), opacity 200ms'
            : 'opacity 200ms',
        }}
      >
        <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-accent-bright" />
      </span>
      {NAV_GROUPS.map((group) => (
        <div key={group.title}>
          <p className="label mb-1 px-3">{group.title}</p>
          <ul className="flex flex-col gap-px">
            {group.items.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`group relative block rounded-md py-1.5 pl-3 pr-2 text-sm transition-colors ${
                      active
                        ? 'font-medium text-accent-bright'
                        : 'text-secondary hover:bg-raised/60 hover:text-foreground'
                    }`}
                  >
                    <span
                      className={`inline-block transition-transform duration-300 ease-out-expo ${
                        active ? '' : 'group-hover:translate-x-0.5'
                      }`}
                    >
                      {item.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
