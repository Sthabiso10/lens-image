import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /**
   * The monorepo root.
   *
   * Next walks up looking for a lockfile and can land outside the repo
   * entirely when one exists in a parent directory. Naming the root explicitly
   * keeps file tracing deterministic wherever the build runs.
   */
  outputFileTracingRoot: resolve(here, '..', '..'),

  /**
   * Static export.
   *
   * Nothing here needs a server: the playground plans variants in the browser
   * using @lens-image/core/browser, and there are no API routes or revalidation.
   * Exporting means the site is a folder of files any host will serve, which is
   * cheaper and one less thing to be locked into.
   */
  output: 'export',

  // Static hosts map /docs/getting-started to a directory, so emit
  // getting-started/index.html rather than getting-started.html.
  trailingSlash: true,

  // Compile the workspace package from source, so an edit to the library shows
  // up here without a rebuild.
  transpilePackages: ['@lens-image/core'],

  webpack(config) {
    /**
     * `@lens-image/core` is written for NodeNext, where relative imports carry a
     * `.js` extension even in TypeScript source (`./validation.js`). When the
     * package is consumed as *source*: which is the point of
     * `transpilePackages`: webpack looks for a real `validation.js` and does
     * not find it, because the file on disk is `validation.ts`.
     *
     * `extensionAlias` is the supported fix: try the TypeScript files first for
     * any `.js` request, then fall back to a genuine `.js`. Without it, the
     * only alternative is to point the site at the built `dist`, which costs a
     * rebuild on every library edit.
     */
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
