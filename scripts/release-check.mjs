#!/usr/bin/env node
/**
 * Pre-publish guard. Enforces the promises the README makes, so "zero npm
 * surprises" is a CI failure rather than a good intention:
 *
 *   1. `@lens-image/core` has zero runtime `dependencies`.
 *   2. No adapter smuggles a heavy SDK into `dependencies` (they are peers).
 *   3. Every package version matches.
 *   4. Every package has README, LICENSE, an exports map and a `files` allowlist.
 *   5. Cross-package ranges point at the version actually being published.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkgRoot = join(root, 'packages');

const errors = [];
const warnings = [];

const pkgs = readdirSync(pkgRoot)
  .filter((d) => existsSync(join(pkgRoot, d, 'package.json')))
  .map((d) => ({
    dir: join(pkgRoot, d),
    json: JSON.parse(readFileSync(join(pkgRoot, d, 'package.json'), 'utf8')),
  }))
  // The docs site lives in packages/ but is never published, so none of the
  // publishing rules below apply to it.
  .filter(({ json }) => json.private !== true);

const versions = new Set(pkgs.map((p) => p.json.version));
if (versions.size !== 1) {
  errors.push(`Version drift across packages: ${[...versions].join(', ')}`);
}
const version = pkgs[0]?.json.version;
const scope = pkgs[0]?.json.name.split('/')[0] ?? '@lens';

for (const { dir, json } of pkgs) {
  const deps = Object.keys(json.dependencies ?? {});
  const internal = deps.filter((d) => d.startsWith(scope + '/'));
  const external = deps.filter((d) => !d.startsWith(scope + '/'));

  if (json.name.endsWith('/core') && deps.length > 0) {
    errors.push(`${json.name} must have zero dependencies, found: ${deps.join(', ')}`);
  }
  if (external.length > 0) {
    errors.push(
      `${json.name} declares runtime dependencies (${external.join(', ')}); use peerDependencies.`,
    );
  }
  for (const dep of internal) {
    const range = json.dependencies[dep];
    if (!range.includes(version)) {
      errors.push(`${json.name} depends on ${dep}@${range}, expected ^${version}`);
    }
  }
  for (const file of ['README.md', 'LICENSE']) {
    if (!existsSync(join(dir, file))) errors.push(`${json.name} is missing ${file}`);
  }
  if (!json.exports) errors.push(`${json.name} has no "exports" map`);
  if (!Array.isArray(json.files)) errors.push(`${json.name} has no "files" allowlist`);

  // npm renders these on the package page; without them the listing looks
  // abandoned and there is no obvious place to file a bug.
  for (const field of ['description', 'license', 'repository', 'homepage', 'bugs', 'engines']) {
    if (!json[field]) errors.push(`${json.name} has no "${field}"`);
  }
  if (json.repository && json.repository.directory !== `packages/${basename(dir)}`) {
    errors.push(`${json.name} has a repository.directory that does not match its folder`);
  }
  if (!json.types && !json.exports?.['.']?.import?.types) {
    errors.push(`${json.name} publishes no type declarations`);
  }
  if (!json.publishConfig?.access) {
    warnings.push(`${json.name} has no publishConfig.access (scoped packages default to restricted)`);
  }
  if (!existsSync(join(dir, 'dist'))) {
    warnings.push(`${json.name} has no dist/ - run "npm run build" first`);
  }
}

for (const w of warnings) console.warn(`warn  ${w}`);
for (const e of errors) console.error(`error ${e}`);

if (errors.length) {
  console.error(`\nrelease-check failed with ${errors.length} error(s).`);
  process.exit(1);
}
console.log(`\nrelease-check passed for v${version} across ${pkgs.length} packages.`);
