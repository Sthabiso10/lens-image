'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_GROUPS } from '@/lib/nav';

/**
 * The docs rail: the page tree.
 *
 * Hidden below `lg`: the header's mobile menu carries the same tree there, so
 * this never renders twice on a phone.
 */
export function DocsSidebar() {
  const pathname = usePathname().replace(/\/$/, '') || '/';

  return (
    <nav aria-label="Documentation" className="flex flex-col gap-5">
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
                    className={`relative block rounded-md py-1.5 pl-3 pr-2 text-sm transition-colors ${
                      active
                        ? 'bg-raised font-medium text-accent-bright'
                        : 'text-secondary hover:bg-raised/60 hover:text-foreground'
                    }`}
                  >
                    {active ? (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-accent-bright"
                      />
                    ) : null}
                    {item.label}
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
