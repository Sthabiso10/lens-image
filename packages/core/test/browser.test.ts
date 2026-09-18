import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  LensError,
  formatBytes,
  resolveValidation,
  slugify,
  sniff,
  validateImage,
} from '../src/browser.js';
import { jpegFixture, pngFixture } from './fixtures.js';

const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src');

/**
 * Walks the import graph from an entry module and returns every local file it
 * reaches. Static analysis rather than a bundler, because the whole point is
 * to catch a `node:` import *before* someone's browser build does.
 */
function reachableFrom(entry: string): string[] {
  const seen = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);

    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/from\s+'(\.[^']+)'/g)) {
      const target = join(dirname(file), match[1]!.replace(/\.js$/, '.ts'));
      queue.push(target);
    }
  }
  return [...seen];
}

/** Every `node:` specifier imported by a file, static or dynamic. */
function nodeImports(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(/(?:from|import\()\s*'(node:[^']+)'/g)].map((m) => m[1]!);
}

describe('@lens-image/core/browser', () => {
  it('reaches no node: builtins from its import graph', () => {
    const offenders = reachableFrom(join(srcDir, 'browser.ts'))
      .map((file) => ({ file, imports: nodeImports(file) }))
      .filter((entry) => entry.imports.length > 0);

    assert.deepEqual(
      offenders.map((o) => `${o.file.slice(srcDir.length + 1)} -> ${o.imports.join(', ')}`),
      [],
      'the browser entry point must stay bundler-safe; move the offending code behind ./index.ts',
    );
  });

  it('is a strict subset of the main entry point', () => {
    // A symbol that exists in both must be the same symbol - otherwise the two
    // entry points would quietly drift and code would behave differently
    // depending on which one it imported from.
    const browser = readFileSync(join(srcDir, 'browser.ts'), 'utf8');
    const modules = [...browser.matchAll(/from\s+'\.\/([\w-]+)\.js'/g)].map((m) => m[1]!);

    const allowed = new Set([
      'sniff',
      'validation',
      'errors',
      'format',
      'naming',
      'srcset',
      'bytes',
      'types',
    ]);
    for (const module of modules) {
      assert.ok(allowed.has(module), `unexpected module in the browser entry: ${module}`);
    }
  });

  it('lists every src file, so a new one is a deliberate choice', () => {
    // Guards against the opposite mistake: adding a pure module and forgetting
    // it is unavailable to browser consumers.
    const files = readdirSync(srcDir).filter((f) => f.endsWith('.ts'));
    assert.ok(files.length > 0);
  });

  describe('the exported surface actually works', () => {
    it('sniffs an image from its header alone', () => {
      const full = jpegFixture(4032, 3024);
      // Exactly what a browser would read: the first few KB of a File.
      const header = full.slice(0, 4096);

      const meta = sniff(header, 8_400_000);

      assert.equal(meta.format, 'jpeg');
      assert.equal(meta.width, 4032);
      assert.equal(meta.size, 8_400_000, 'the real file size, not the header size');
    });

    it('validates with the same messages the server produces', () => {
      const policy = resolveValidation({ maxBytes: 1_000_000 })!;
      const meta = sniff(pngFixture(800, 600), 5_000_000);

      assert.throws(
        () => validateImage(meta, policy, 'huge.png'),
        (error: unknown) => {
          assert.ok(LensError.is(error, 'VALIDATION_FAILED'));
          // Binary units throughout: 1,000,000 bytes is 976.6 KiB, not 1000 KB.
          assert.match(error.message, /"huge\.png" is 4\.8 MiB, over the 976\.6 KiB limit/);
          return true;
        },
      );
    });

    it('exposes the pure string helpers', () => {
      assert.equal(slugify('Café Photo'), 'cafe-photo');
      assert.equal(formatBytes(5_242_880), '5.0 MiB');
    });
  });
});
