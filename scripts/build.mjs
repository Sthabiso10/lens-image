#!/usr/bin/env node
/**
 * Builds every workspace package to dual ESM + CJS output using nothing but `tsc`.
 *
 * Why not a bundler? The selling point of this project is a dependency graph you
 * can audit in one screen. A bundler would add ~100 transitive dev packages to
 * save us forty lines of script.
 *
 * Output layout per package:
 *   dist/esm/ ** + dist/esm/package.json  ({ "type": "module" })
 *   dist/cjs/ ** + dist/cjs/package.json  ({ "type": "commonjs" })
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Build order matters: adapters resolve `@lens-image/core` types through node_modules. */
const ORDER = ['core', 'adapter-local', 'adapter-s3', 'adapter-cloudinary', 'react'];

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const targets = only.length ? ORDER.filter((p) => only.includes(p)) : ORDER;

const isWin = process.platform === 'win32';

let failed = false;
for (const pkg of targets) {
  const dir = join(root, 'packages', pkg);
  if (!existsSync(dir)) continue;

  rmSync(join(dir, 'dist'), { recursive: true, force: true });

  for (const [variant, config] of [
    ['esm', 'tsconfig.build.json'],
    ['cjs', 'tsconfig.cjs.json'],
  ]) {
    process.stdout.write(`  building ${pkg} (${variant})... `);

    // A path relative to `root`, not an absolute one. On Windows this runs
    // through a shell (npx is a .cmd), which re-splits the command line on
    // spaces, so an absolute path under "C:\My Projects\..." would arrive at
    // tsc as two arguments and fail with TS5042. The relative form has no
    // spaces regardless of where the repo lives.
    const project = relative(root, join(dir, config)).split('\\').join('/');

    const res = spawnSync(isWin ? 'npx.cmd' : 'npx', ['tsc', '-p', project], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      shell: isWin,
    });
    if (res.status !== 0) {
      failed = true;
      process.stdout.write('FAILED\n');
      process.stderr.write(String(res.stdout ?? '') + String(res.stderr ?? '') + '\n');
      break;
    }
    const out = join(dir, 'dist', variant);
    mkdirSync(out, { recursive: true });
    writeFileSync(
      join(out, 'package.json'),
      JSON.stringify({ type: variant === 'esm' ? 'module' : 'commonjs' }, null, 2) + '\n',
    );
    process.stdout.write('ok\n');
  }
  if (failed) break;
}

if (failed) {
  console.error('\nBuild failed.');
  process.exit(1);
}
console.log('\nBuild complete.');
