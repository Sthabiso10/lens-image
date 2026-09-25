# Deploying the docs site

The site lives in `packages/docs`, builds to a **static export**, and deploys to
Vercel from the repository root.

Static export (`output: 'export'` in `next.config.mjs`) is deliberate: everything
runs in the browser. The playground plans variants against `@lens-image/core/browser`
, and there are no API routes, server actions or revalidation. The build is a
folder of files any host will serve, so the site is not tied to Vercel. It also
sidesteps Vercel's framework detection, which looks for `next` in the _root_
`package.json` and does not find it in a monorepo unless you set the project's
Root Directory, which cannot be done from `vercel.json` or the CLI.

One consequence: **no server-side features.** If you ever need a real route, set
Root Directory to `packages/docs` in the Vercel dashboard and drop the export.

`vercel.json` cannot carry comments, because Vercel's schema rejects unknown
keys, so the reasoning for each setting is here instead:

| Setting | Why |
| --- | --- |
| `installCommand: npm install` | Installs the **whole workspace**, not just `packages/docs`. The site imports `@lens-image/core` by name and Next transpiles it from source via `transpilePackages`, so the library has to be present. |
| `buildCommand: npm run build --workspace @lens-image/docs` | A bare `npm run build` at the root builds the _libraries_ and never touches the site. |
| `outputDirectory: packages/docs/out` | The build runs from the root, so the output is not where Vercel would look by default. |
| `framework: null` | Detection fails on a monorepo root anyway, and an incorrect guess adds routing rules a static export does not want. |
| `github.silent: true` | Suppresses the deployment-status comments Vercel posts on every commit. |
| `headers` | Security headers on every response. See below. |

## Security headers

The site is static, so there is no server to attack. The headers limit what a
browser will let the pages do, which matters if anything injected ever reaches
them.

| Header | Why |
| --- | --- |
| `Content-Security-Policy` | Only this origin may supply scripts, styles, fonts, images and data. `'unsafe-inline'` is needed for scripts because a static export inlines its hydration payload (`self.__next_f.push(...)`) with no server to stamp a nonce on it, and for styles because several components emit `<style>` tags and inline styles. `blob:` and `data:` in `img-src` are for the playground, which shows its encoded variants as object URLs. `frame-ancestors 'none'` stops the site being framed. |
| `X-Frame-Options: DENY` | The same anti-framing rule for browsers that predate `frame-ancestors`. |
| `X-Content-Type-Options: nosniff` | Files are only ever treated as the type they are served as. |
| `Referrer-Policy` | Links out to GitHub and npm send the origin, never the full path. |
| `Cross-Origin-Opener-Policy` | A page opened from this one cannot reach back into it. |
| `Permissions-Policy` | Nothing here needs the camera, microphone, location, payments or USB, so they are refused outright. |
| `Strict-Transport-Security` | HTTPS only, for two years. Vercel already sends this on its own domains; it is here so a custom domain gets it too. |

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

## Deploying

```bash
vercel deploy          # preview build, safe to run any time
vercel deploy --prod   # promote to the production domain
```

Both run from the repository root, not from `packages/docs`.

## Domains, and a trap

Vercel derives a project's production domain from the project name and falls
back to a random suffix when that subdomain is taken, so you can end up on
`lens-abc123.vercel.app` without noticing.

Renaming the project does **not** move the domain. Two things are needed:

```bash
vercel project rename <old> <new>
vercel domains add <new>.vercel.app <new>     # the part people forget
```

`vercel alias set` looks like it does the job and does not: an alias is not a
_project domain_, so Deployment Protection still applies and visitors get a
Vercel login page instead of the site. Always load the URL in a private window
after changing it.

## After a domain change

Three places hardcode the URL. Update all of them:

1. `metadataBase` and the `openGraph.url` in `packages/docs/app/layout.tsx`
   without this, Open Graph images resolve against the old host.
2. The repository homepage: `gh repo edit <owner>/<repo> --homepage "https://<new>"`.
3. The `homepage` field in each package's `package.json`, which npm renders on
   the package page.

## Self-hosting instead

The export has no runtime requirements at all:

```bash
npm run build --workspace @lens-image/docs
npx serve packages/docs/out
```

Any static host works, S3 behind CloudFront, Cloudflare Pages, GitHub Pages,
nginx. `trailingSlash: true` means every route is a directory with an
`index.html`, so no host-specific rewrite rules are needed.
