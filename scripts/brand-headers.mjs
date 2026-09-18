#!/usr/bin/env node
/**
 * Puts the logo at the top of the root README and every published package one.
 *
 *   node scripts/brand-headers.mjs
 *
 * ### Why the URL is absolute
 *
 * npm renders these READMEs on npmjs.com, where a relative path resolves
 * against nothing at all. `docs/media/logo.png` works on GitHub and renders as
 * a broken image on the page most people actually land on, so the header has
 * to point at raw.githubusercontent.com.
 *
 * ### Why the URL carries a hash
 *
 * npm and GitHub both proxy README images through a cache. Pinned to `main`,
 * the URL never changes, so replacing the artwork leaves every package page
 * showing the old one until that cache happens to expire. The logo's own
 * content hash is appended as a query parameter: raw.githubusercontent.com
 * ignores it, and the proxies treat a new hash as a new image. Re-run this
 * script after `brand:build` and the header updates itself.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const LOGO = join(root, 'docs/media/logo.png');

// Checked before changing: this has to resolve, or it is a dead link sitting on
// five npm package pages. It pointed at the repo while the site was undeployed.
const SITE = 'https://lens-image-docs.vercel.app';

const hash = createHash('sha256').update(readFileSync(LOGO)).digest('hex').slice(0, 8);
const RAW = `https://raw.githubusercontent.com/Sthabiso10/lens-image/main/docs/media/logo.png?v=${hash}`;

const badges = (name) =>
  `  <a href="https://www.npmjs.com/package/${name}"><img alt="npm" src="https://img.shields.io/npm/v/${name.replace('/', '%2F')}.svg?color=cb3837" /></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6.svg" />
  <img alt="MIT license" src="https://img.shields.io/badge/license-MIT-blue.svg" />`;

const logoBlock = (width) => `<p align="center">
  <a href="${SITE}">
    <img src="${RAW}" alt="Lens" width="${width}" />
  </a>
</p>`;

/**
 * Rewrites the logo block in place.
 *
 * The root README's header is hand-written below the logo, so only the logo
 * block itself is replaced there. Package READMEs get the whole header, which
 * makes the script idempotent: it strips what it wrote last time first.
 */
function updateLogo(file, width) {
  const before = readFileSync(join(root, file), 'utf8');
  const block = /^<p align="center">\s*\n\s*<a href="[^"]*">\s*\n\s*<img src="[^"]*" alt="Lens" width="\d+" \/>\s*\n\s*<\/a>\s*\n<\/p>/;

  if (!block.test(before)) return null;
  const after = before.replace(block, logoBlock(width));
  if (after === before) return false;

  writeFileSync(join(root, file), after);
  return true;
}

const PACKAGES = [
  ['packages/core/README.md', '@lens-image/core'],
  ['packages/adapter-s3/README.md', '@lens-image/adapter-s3'],
  ['packages/adapter-local/README.md', '@lens-image/adapter-local'],
  ['packages/adapter-cloudinary/README.md', '@lens-image/adapter-cloudinary'],
  ['packages/react/README.md', '@lens-image/react'],
];

let changed = 0;
const report = (file, result) => {
  if (result === null) {
    console.error(`  ${file}: no logo block found, left alone`);
    process.exitCode = 1;
  } else if (result) {
    changed += 1;
    console.log(`  ${file}`);
  }
};

report('README.md', updateLogo('README.md', 368));

for (const [file, name] of PACKAGES) {
  const path = join(root, file);
  const before = readFileSync(path, 'utf8');

  const body = before.startsWith('<p align="center">') ? before.slice(before.indexOf('\n# ')) : before;

  const after = `${logoBlock(300)}

<p align="center">
${badges(name)}
</p>

${body.replace(/^\n+/, '')}`;

  if (after !== before) {
    writeFileSync(path, after);
    changed += 1;
    console.log(`  ${file}`);
  }
}

console.log(`\n${changed} README(s) updated, logo v${hash}`);
