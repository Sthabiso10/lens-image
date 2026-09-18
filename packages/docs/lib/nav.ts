/**
 * One source of truth for the site's navigation.
 *
 * The header, the docs sidebar and the prev/next footer all read this, so a
 * new page is a single entry rather than three edits that drift apart.
 */

import corePkg from '@lens-image/core/package.json';

export interface NavItem {
  href: string;
  label: string;
  /** One line shown on the docs index cards and in the mobile menu. */
  summary?: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Start here',
    items: [
      {
        href: '/docs',
        label: 'Introduction',
        summary: 'What Lens is, what it deliberately is not, and how the packages fit together.',
      },
      {
        href: '/docs/getting-started',
        label: 'Getting started',
        summary: 'Install, optimize one image, wire up uploads end to end.',
      },
    ],
  },
  {
    title: 'Concepts',
    items: [
      {
        href: '/docs/pipeline',
        label: 'The pipeline',
        summary:
          'Validate, plan, encode, store. Where formats, quality, caching and graceful degradation fit.',
      },
    ],
  },
  {
    title: 'Reference',
    items: [
      {
        href: '/docs/api',
        label: 'API reference',
        summary: 'Everything exported from @lens-image/core and @lens-image/react.',
      },
      {
        href: '/docs/adapters',
        label: 'Storage adapters',
        summary: 'S3, filesystem, Cloudinary, and writing your own in forty lines.',
      },
    ],
  },
  {
    title: 'Try it',
    items: [
      {
        href: '/playground',
        label: 'Playground',
        summary: 'Drop an image in and see the variants, keys and srcset Lens would produce.',
      },
    ],
  },
];

/** Reading order, flattened. Drives the prev/next links at the foot of a page. */
export const NAV_ORDER: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/** Top-level links in the header. A subset, kept short on purpose. */
export const HEADER_LINKS: NavItem[] = [
  { href: '/docs', label: 'Docs' },
  { href: '/docs/pipeline', label: 'Pipeline' },
  { href: '/docs/api', label: 'API' },
  { href: '/docs/adapters', label: 'Adapters' },
  { href: '/playground', label: 'Playground' },
];

export const GITHUB_URL = 'https://github.com/Sthabiso10/lens-image';
export const NPM_URL = 'https://www.npmjs.com/package/@lens-image/core';

/**
 * The version in the header, hero pill and footer.
 *
 * Read from the manifest rather than typed in, because a hand-written badge
 * drifts the moment you publish. Packages are released together at the same
 * version, and this tracks `@lens-image/core`: the one a visitor is deciding
 * whether to install.
 */
export const VERSION: string = corePkg.version;

export function siblingsOf(pathname: string): { prev?: NavItem; next?: NavItem } {
  const clean = pathname.replace(/\/$/, '') || '/';
  const index = NAV_ORDER.findIndex((item) => item.href === clean);
  if (index === -1) return {};
  return { prev: NAV_ORDER[index - 1], next: NAV_ORDER[index + 1] };
}
