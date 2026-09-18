# @lens-image/docs

The documentation site. Private, never published to npm.

```bash
npm run dev --workspace @lens-image/docs      # http://localhost:3000
npm run build --workspace @lens-image/docs    # static export to ./out
```

## Shape

| | |
|---|---|
| `app/page.tsx` | Landing page. |
| `app/docs/*` | Introduction, getting started, pipeline, API, adapters. |
| `app/playground/page.tsx` | The variant planner. |
| `lib/nav.ts` | **The only place a page is registered.** Header, sidebar and prev/next all read it. |
| `lib/highlight.ts` | A ~150-line syntax tokeniser. |
| `lib/plan.ts` | The playground's planner, built on `@lens-image/core/browser`. |
| `components/Prose.tsx` | `Prose`, `PageHeader`, `Steps`, `Step`, `Callout`. |
| `components/ui/` | Drop-in components kept close to their upstream source. |
| `lib/utils.ts` | `cn()`. The helper shadcn components import from `@/lib/utils`. |
| `lib/hero-images.ts` | Generated. See below. |

Adding a page means creating `app/docs/<slug>/page.tsx` and adding one entry to
`lib/nav.ts`. The "On this page" rail builds itself from the rendered `<h2>` and
`<h3>` elements, so headings need no registration and get ids for free.

## Why it has almost no dependencies

`next`, `react`, `react-dom`, and Tailwind as a dev dependency. That is the
whole list.

The published packages are the product; the site is scaffolding. A site about a
library whose selling point is a small dependency graph should not itself pull
in a syntax highlighter, an icon set and a typography plugin, so the icons, the
highlighter and the prose styles are all hand-rolled and live in this folder.

## `components/ui/` and shadcn

This is not a shadcn project. The palette in `app/globals.css` is its own, and
running `shadcn init` would overwrite it. But `components/ui/` exists and
`@/lib/utils` exports `cn`, so a shadcn component can be pasted in and will
render in this theme without being forked.

`app/globals.css` also aliases the token names those components reach for, 
`--color-border`, `--color-muted-foreground`, `--color-primary` and friends, 
onto the palette that was already here.

`cn` is deliberately not `clsx` + `tailwind-merge`. It matches clsx's input
handling but does not merge conflicting Tailwind utilities; the trade-off, and
the one-line upgrade, are documented at the top of `lib/utils.ts`.

## The hero images are built by Lens

`npm run hero:build` downloads photographs at full size and puts them through
`ImageOptimizer` with `LocalAdapter`, writing `public/hero/` and the
`lib/hero-images.ts` manifest, including the measured before/after, which is
the figure the landing page quotes.

A hero for an image-optimization library that shipped unoptimized images would
be the easiest thing in the world to screenshot and dunk on. The last run was
7.2 MB down to 660 KB, 91% smaller.

The output is committed, so an ordinary build and the CI docs job never touch
the network.

## The playground is not a simulation

It imports `sniff`, `validateImage`, `normalizeFormats`, `buildKey` and
`defaultLabel` from `@lens-image/core/browser` and runs them for real. What it cannot
do is encode, because the browser has no libvips, so it reports dimensions and
storage keys, and deliberately reports **no file-size estimates**. Those would be
the one invented number on the page.

## Static export

`output: 'export'` in `next.config.mjs`. Nothing here needs a server: there are
no API routes, no server actions and no revalidation. The build is a folder of
files any host will serve.

Two configuration details that are easy to trip over:

- **`trailingSlash: true`**: static hosts map `/docs/getting-started` to a
  directory, so pages must emit `getting-started/index.html`.
- **`resolve.extensionAlias`**: `@lens-image/core` is written for NodeNext, where
  relative imports carry a `.js` extension even in TypeScript source. Consuming
  the package as source via `transpilePackages` means webpack looks for a real
  `validation.js` and finds `validation.ts`. The alias maps them.

## Deploying

See [`docs/DEPLOY.md`](../../docs/DEPLOY.md).
