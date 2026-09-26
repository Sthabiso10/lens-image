# Deploying the docs site

The site lives in `packages/docs`, builds to a **static export**, and is hosted
on Cloudflare as Workers static assets at
<https://lens-image.sthabisod10.workers.dev>.

Static export (`output: 'export'` in `next.config.mjs`) is deliberate: everything
runs in the browser. The playground plans variants against
`@lens-image/core/browser`, and there are no API routes, server actions or
revalidation. The build is a folder of files any host will serve, so the site is
not tied to any one host.

One consequence: **no server-side features.** If you ever need a real route,
drop the export and move to a Worker script or a server host.

## Cloudflare

`wrangler.jsonc` at the repository root hosts `packages/docs/out` as **Workers
static assets** with no Worker script, so every request is served straight from
the files and none of it is billed. Cloudflare's dashboard now creates Workers
rather than Pages projects; static assets are the Workers equivalent of a Pages
site.

Unknown paths get `out/404.html` (`not_found_handling: "404-page"`), and a
path without its trailing slash is redirected to the directory, which
`trailingSlash: true` already expects.

### Connecting the repository

In the Cloudflare dashboard: **Workers & Pages → Create → Import a repository**,
pick this repo, then:

| Setting | Value |
| --- | --- |
| Project name | `lens-image`, matching `name` in `wrangler.jsonc` |
| Root directory | `/` (the repository root, not `packages/docs`) |
| Build command | leave empty |
| Deploy command | `npx wrangler deploy` |

**The dashboard project name and `name` in `wrangler.jsonc` must match.** The
dashboard's builds deploy to the project's own Worker whatever the config says,
but `npx wrangler deploy` run by hand uses the config's name, and a mismatch
quietly creates a second Worker on a different URL.

The root directory is the repository root because the whole workspace has to be
installed: the site imports `@lens-image/core` by name and Next transpiles it
from source via `transpilePackages`, so the library has to be present.

`wrangler deploy` builds the site itself, through `build.command` in
`wrangler.jsonc`, so the dashboard build command is not needed. Anything set
there runs first and just builds the site twice. **Never set it to a bare
`npm run build`**: that builds only the libraries, and on its own it broke the
first Cloudflare deploy with "The directory specified by the assets.directory
field does not exist".

### Deploying by hand

```bash
npx wrangler deploy     # builds the site, then uploads it
```

Run it from the repository root, not from `packages/docs`.

Current wrangler needs **Node 22**. Cloudflare's build image already has it.
Locally, on Node 20, only an older wrangler runs, and it cannot start a Worker
whose `compatibility_date` is newer than it knows about, so preview with a date
override (which does not touch the config). It builds the site first too, and
rebuilds when `app`, `components`, `lib` or `public` in `packages/docs` change:

```bash
npx wrangler@4.86.0 dev --compatibility-date 2026-05-03
```

## Security headers

The site is static, so there is no server to attack. The headers limit what a
browser will let the pages do, which matters if anything injected ever reaches
them.

They are set in `packages/docs/public/_headers`. Next copies `public/` to the
root of the export, where Cloudflare reads the file and does not serve it.

| Header | Why |
| --- | --- |
| `Content-Security-Policy` | Only this origin may supply scripts, styles, fonts, images and data. `'unsafe-inline'` is needed for scripts because a static export inlines its hydration payload (`self.__next_f.push(...)`) with no server to stamp a nonce on it, and for styles because several components emit `<style>` tags and inline styles. `blob:` and `data:` in `img-src` are for the playground, which shows its encoded variants as object URLs. `frame-ancestors 'none'` stops the site being framed. |
| `X-Frame-Options: DENY` | The same anti-framing rule for browsers that predate `frame-ancestors`. |
| `X-Content-Type-Options: nosniff` | Files are only ever treated as the type they are served as. |
| `Referrer-Policy` | Links out to GitHub and npm send the origin, never the full path. |
| `Cross-Origin-Opener-Policy` | A page opened from this one cannot reach back into it. |
| `Permissions-Policy` | Nothing here needs the camera, microphone, location, payments or USB, so they are refused outright. |
| `Strict-Transport-Security` | HTTPS only, for two years, so a custom domain gets it too. |

**If you add anything that loads from another origin** (analytics, a font CDN,
an embedded video), add that origin to the matching CSP directive, or the
browser will block it and say so in the console. Test the policy against a
production build, not `next dev`, which needs `eval` and would fail it anyway.

## Dependency overrides

The root `package.json` overrides the copy of `postcss` bundled inside `next`.
Next 15 pins `postcss@8.4.31`, which `npm audit` flags. The advisories only
affect the build, not the served site, but the override clears them without
moving to Next 16. `npm ls` reports the override as "invalid" because Next pins
an exact version; that is expected.

Next 16.3.6 was tried and held back: its static export writes segment-prefetch
files to `docs/api/__next.docs/api/__PAGE__.txt`, while the client requests
`docs/api/__next.docs.api.__PAGE__.txt`, so every page with links logs 404s.
It also needs `--webpack` on `dev` and `build`, because Turbopack cannot resolve
the `.js` imports in `@lens-image/core`'s TypeScript source. Revisit both when
upgrading, and drop the override once Next ships a patched `postcss`.

## After a domain change

Add a custom domain under the Worker's **Settings → Domains & Routes**, then
update every place that hardcodes the URL:

1. `metadataBase` and `openGraph.url` in `packages/docs/app/layout.tsx`.
   Without this, Open Graph images resolve against the old host.
2. `SITE` in `scripts/brand-headers.mjs`, then run `npm run brand:build` to
   rewrite the logo link at the top of every README.
3. The Docs and playground links further down the root `README.md`.
4. The repository homepage: `gh repo edit <owner>/<repo> --homepage "https://<new>"`.

The READMEs are what npm shows on each package page, so npm only picks up the
new links at the next publish. Each package's `homepage` field points at the
GitHub repository, not the site, so it never needs changing.

Always load the new URL in a private window after changing it.

## Self-hosting instead

The export has no runtime requirements at all:

```bash
npm run build --workspace @lens-image/docs
npx serve packages/docs/out
```

Any static host works: S3 behind CloudFront, GitHub Pages, nginx.
`trailingSlash: true` means every route is a directory with an `index.html`, so
no host-specific rewrite rules are needed. Only Cloudflare reads `_headers`;
another host needs the security headers set in its own config.
