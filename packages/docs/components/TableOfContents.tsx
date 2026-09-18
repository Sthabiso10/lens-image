'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

interface Heading {
  id: string;
  text: string;
  level: 2 | 3;
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/**
 * "On this page", built from the DOM rather than from page metadata.
 *
 * The docs pages are hand-written TSX, so there is no frontmatter to read and
 * no MDX pipeline to hook. Scanning the rendered article after mount keeps the
 * pages plain JSX and means a new `<h2>` shows up here with no second edit
 * the same reason `lib/nav.ts` is the only place pages are registered.
 *
 * It also assigns the ids, so every heading becomes linkable for free.
 *
 * Keyed on the pathname because the docs layout: and therefore this component
 *: survives client-side navigation between pages. Without the dependency the
 * rail keeps the first page's headings forever and the ids are never written
 * on any page after it.
 */
export function TableOfContents() {
  const pathname = usePathname();
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    setActive(null);

    const nodes = Array.from(
      document.querySelectorAll<HTMLHeadingElement>('article h2, article h3'),
    );

    const seen = new Set<string>();
    const found = nodes.map((node) => {
      const text = node.textContent?.trim() ?? '';

      // Two sections can legitimately share a name ("Writing your own" appears
      // on more than one page); suffix duplicates so the anchors stay unique.
      let id = node.id || slugify(text);
      if (seen.has(id)) {
        let suffix = 2;
        while (seen.has(`${id}-${suffix}`)) suffix += 1;
        id = `${id}-${suffix}`;
      }
      seen.add(id);
      node.id = id;

      return { id, text, level: node.tagName === 'H3' ? (3 as const) : (2 as const) };
    });

    setHeadings(found);
    if (found.length === 0) return;

    // The ids land after mount, so a URL that arrived with a hash. A shared
    // link, or a jump from search, has already failed to resolve it. Now that
    // the targets exist, honour it. `scroll-mt` on the headings keeps the
    // sticky header from covering the one we land on.
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (hash) {
      document.getElementById(hash)?.scrollIntoView();
      setActive(hash);
    }

    // Only the top slice of the viewport counts as "here", otherwise every
    // heading below the fold is intersecting at once and the last one wins.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-72px 0px -70% 0px', threshold: 0 },
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [pathname]);

  if (headings.length === 0) return null;

  return (
    <nav aria-label="On this page" className="flex flex-col gap-2 text-sm">
      <p className="label mb-1">On this page</p>
      <ul className="flex flex-col border-l border-line">
        {headings.map((heading) => {
          const isActive = active === heading.id;
          return (
            <li key={heading.id}>
              <a
                href={`#${heading.id}`}
                aria-current={isActive ? 'location' : undefined}
                className={`-ml-px block border-l py-1 pr-2 transition-colors ${
                  heading.level === 3 ? 'pl-6' : 'pl-3'
                } ${
                  isActive
                    ? 'border-accent-bright font-medium text-accent-bright'
                    : 'border-transparent text-secondary hover:border-line-strong hover:text-foreground'
                }`}
              >
                {heading.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
