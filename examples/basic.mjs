/**
 * The smallest useful Lens program.
 *
 * Runs with no credentials and no sharp: it uses the built-in passthrough
 * engine and the in-memory adapter, so it demonstrates the shape of the API
 * rather than real compression.
 *
 *   node examples/basic.mjs
 *
 * For actual resizing, install sharp and delete the `engine` line.
 */
import { ImageOptimizer, MemoryAdapter, createPassthroughEngine, formatBytes } from '@lens-image/core';

// A 1x1 PNG, so the example needs no fixture file on disk.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const adapter = new MemoryAdapter();

const optimizer = new ImageOptimizer({
  adapter,
  // Remove this line once sharp is installed, detection picks it up on its own.
  engine: createPassthroughEngine({ onUnsupported: 'ignore' }),
  quality: 80,
  onWarning: (warning) => console.warn(`  warning: ${warning.message}`),
});

const result = await optimizer.optimize({
  source: { data: PIXEL, filename: 'pixel.png' },
  formats: ['png'],
});

console.log(`source    ${result.source.filename}`);
console.log(`          ${result.source.format} ${result.source.width}x${result.source.height}, ${formatBytes(result.source.size)}`);
console.log(`engine    ${result.engine}`);
console.log(`adapter   ${result.adapter}`);
console.log(`took      ${result.durationMs}ms\n`);

for (const variant of result.variants) {
  console.log(`  ${variant.format.padEnd(5)} ${String(variant.width).padStart(5)}px  ${formatBytes(variant.size).padStart(10)}  ${variant.key}`);
}

console.log(`\nstored ${adapter.size} object(s):`);
for (const key of adapter.keys()) console.log(`  ${adapter.getUrl(key)}`);
