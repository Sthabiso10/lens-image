#!/usr/bin/env node
/**
 * Runs the test suite with Node's built-in runner.
 *
 * Test files are discovered here rather than passed as a shell glob, because
 * `packages/ * /test/ *.test.ts` is expanded by the shell on Unix and handed
 * through literally on Windows - so the npm script would only work on one of
 * them. Discovering in Node makes `npm test` mean the same thing everywhere.
 *
 * Usage:
 *   node scripts/test.mjs                 run everything
 *   node scripts/test.mjs core            only packages/core
 *   node scripts/test.mjs -- --watch      pass flags through to node --test
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const separator = argv.indexOf('--');

const filters = (separator === -1 ? argv : argv.slice(0, separator)).filter((a) => !a.startsWith('-'));
const passthrough = separator === -1 ? argv.filter((a) => a.startsWith('-')) : argv.slice(separator + 1);

const files = [];
const pkgRoot = join(root, 'packages');

for (const pkg of readdirSync(pkgRoot)) {
  if (filters.length > 0 && !filters.includes(pkg)) continue;

  const testDir = join(pkgRoot, pkg, 'test');
  if (!existsSync(testDir)) continue;

  for (const entry of readdirSync(testDir)) {
    if (entry.endsWith('.test.ts')) files.push(relative(root, join(testDir, entry)));
  }
}

if (files.length === 0) {
  console.error(filters.length ? `No test files found for: ${filters.join(', ')}` : 'No test files found.');
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ['--test', '--import', 'tsx', ...passthrough, ...files],
  { cwd: root, stdio: 'inherit' },
);

process.exit(result.status ?? 1);
