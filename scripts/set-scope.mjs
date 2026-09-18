#!/usr/bin/env node
/**
 * Rewrites the npm scope across every package, README and example.
 *
 *   node scripts/set-scope.mjs @your-scope
 *
 * `@lens` may already be claimed on the public registry. Rather than finding
 * that out at `npm publish` time, this rewrites the whole repo in one shot so
 * the docs and the cross-package dependency ranges stay consistent.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const next = process.argv[2];

if (!next || !/^@[a-z0-9][a-z0-9._-]*$/.test(next)) {
  console.error('Usage: node scripts/set-scope.mjs @your-scope');
  process.exit(1);
}

const corePkg = JSON.parse(readFileSync(join(root, 'packages/core/package.json'), 'utf8'));
const current = corePkg.name.split('/')[0];

if (current === next) {
  console.log(`Scope is already ${next}.`);
  process.exit(0);
}

const SKIP = new Set(['node_modules', 'dist', '.git', 'coverage', '.tmp']);
const EXT = /\.(ts|tsx|mjs|js|json|md|yml)$/;

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (EXT.test(entry)) files.push(p);
  }
})(root);

const escaped = current.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pattern = new RegExp(escaped + '/', 'g');

let changed = 0;
for (const file of files) {
  const before = readFileSync(file, 'utf8');
  const after = before.replace(pattern, next + '/');
  if (after !== before) {
    writeFileSync(file, after);
    changed++;
  }
}

console.log(`Rewrote ${current} -> ${next} in ${changed} file(s). Run "npm install" to relink.`);
