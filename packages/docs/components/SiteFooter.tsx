import Link from 'next/link';
import { GITHUB_URL, NAV_GROUPS, NPM_URL, VERSION } from '@/lib/nav';
import { GitHub } from './Icons';

/**
 * No top margin here on purpose. The docs rail is a filled column that runs the
 * height of its section, so a gap above the footer would leave the rail's
 * bottom edge floating in mid-air. Pages provide their own trailing space.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto max-w-shell px-4 py-10 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(4,minmax(0,1fr))]">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
              <img
                src="/brand/icon-64.png"
                alt=""
                width={22}
                height={22}
              />
              Lens
            </p>
            <p className="mt-2 max-w-xs text-sm text-muted">
              Composable image optimization for Node.js. A dependency-free core, and
              storage you plug in.
            </p>
          </div>

          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="text-sm font-medium text-foreground">{group.title}</p>
              <ul className="mt-3 flex flex-col gap-2">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-sm text-muted transition-colors hover:text-foreground"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-line pt-5 text-xs text-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>MIT licensed · v{VERSION}</p>
          <div className="flex items-center gap-4">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <GitHub className="h-3.5 w-3.5" />
              GitHub
            </a>
            <a
              href={NPM_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="transition-colors hover:text-foreground"
            >
              npm
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
