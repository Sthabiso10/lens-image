#!/usr/bin/env node
import { rmSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkgRoot = join(root, 'packages');

for (const pkg of readdirSync(pkgRoot)) {
  for (const target of ['dist', 'tsconfig.tsbuildinfo']) {
    const p = join(pkgRoot, pkg, target);
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}
console.log('Cleaned.');
