#!/usr/bin/env node
/**
 * Builds the docs hero's images: by running them through Lens.
 *
 * A hero for an image-optimization library that shipped unoptimized images
 * would be the easiest possible thing to screenshot and dunk on. So the assets
 * are not hand-exported: this downloads full-size photographs and puts them
 * through the actual `ImageOptimizer`, with the real `LocalAdapter`, and writes
 * the measured before/after into the manifest the hero imports.
 *
 * The numbers quoted on the landing page come from here, so they cannot drift
 * from what the library actually does.
 *
 *   node scripts/build-hero-images.mjs
 *
 * Needs sharp (a devDependency of this repo) and network access. Re-run it to
 * change the image set; the output is committed so a normal build and the CI
 * docs job never touch the network.
 */
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ImageOptimizer, formatBytes } from '@lens-image/core';
import { LocalAdapter } from '@lens-image/adapter-local';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'packages/docs/public/hero');
const manifestPath = join(root, 'packages/docs/lib/hero-images.ts');

/**
 * Unsplash photographs, free to use under the Unsplash License.
 *
 * Chosen for range rather than subject: the corridor reads as one ribbon, so
 * it needs a mix of dark and bright frames and of tight and open compositions,
 * or the whole thing flattens into a single tone as it sweeps past.
 */
const SOURCES = [
  { id: 'photo-1506744038136-46273834b3fb', alt: 'Lake reflecting a forested ridge at dusk' },
  { id: 'photo-1470071459604-3b5ec3a7fe05', alt: 'Fog drifting through a stand of pines' },
  { id: 'photo-1500530855697-b586d89ba3ee', alt: 'Aerial view of a coastline meeting open water' },
  { id: 'photo-1441974231531-c6227db76b6e', alt: 'Sunlight breaking through a dense forest canopy' },
  { id: 'photo-1439066615861-d1af74d74000', alt: 'Snow-covered peaks above a still lake' },
  { id: 'photo-1426604966848-d7adac402bff', alt: 'Green valley folding away into distant hills' },
  { id: 'photo-1447752875215-b2761acb3c5d', alt: 'Narrow path winding between tall trees' },
  { id: 'photo-1472214103451-9374bd1c798e', alt: 'Low sun across an open field of grass' },
  { id: 'photo-1469474968028-56623f02e42e', alt: 'Mountain ridge silhouetted against a bright sky' },
  { id: 'photo-1501785888041-af3ef285b470', alt: 'Wooden cabin on the shore of a mountain lake' },
  { id: 'photo-1493246507139-91e8fad9978e', alt: 'Abstract sweep of pale rock and shadow' },
  { id: 'photo-1444927714506-8492d94b5ba0', alt: 'Waves breaking under an overcast horizon' },
];

/** Full-size enough that the optimizer has real work to do. */
const sourceUrl = (id) => `https://images.unsplash.com/${id}?w=2000&q=90&fm=jpg`;

async function download(id) {
  const response = await fetch(sourceUrl(id));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Sources for the playground's sample buttons.
 *
 * These are written out *large and lightly compressed* on purpose. The hero
 * files are already 40 KB of WebP, so re-encoding one in the playground saves
 * almost nothing and makes the library look useless. A playground needs
 * something with fat to trim, which is what an untouched camera JPEG is.
 *
 * Local rather than hotlinked, because the playground draws them to a canvas
 * and a cross-origin image taints it: `toBlob` then throws and the whole
 * demonstration dies on someone else's CORS header.
 */
const SAMPLES = [
  { id: 'photo-1506744038136-46273834b3fb', name: 'Lake', alt: 'Lake reflecting a forested ridge at dusk' },
  { id: 'photo-1441974231531-c6227db76b6e', name: 'Forest', alt: 'Sunlight breaking through a dense forest canopy' },
  { id: 'photo-1500530855697-b586d89ba3ee', name: 'Coast', alt: 'Aerial view of a coastline meeting open water' },
];

const sampleDir = join(root, 'packages/docs/public/samples');
const sampleManifest = join(root, 'packages/docs/lib/sample-images.ts');

/** Big, lightly compressed JPEGs. The "before" the playground works on. */
async function buildSamples() {
  await rm(sampleDir, { recursive: true, force: true });
  await mkdir(sampleDir, { recursive: true });

  const optimizer = new ImageOptimizer({
    adapter: new LocalAdapter({ root: sampleDir, baseUrl: '/samples' }),
    sizes: [{ width: 1800 }],
    formats: ['jpg'],
    quality: 92,
    key: '{name}.{ext}',
  });

  const entries = [];
  console.log('\n  playground samples');

  for (const sample of SAMPLES) {
    try {
      const data = await download(sample.id);
      const result = await optimizer.optimize({
        source: { data, filename: `${sample.name.toLowerCase()}.jpg` },
      });
      const variant = result.variants[0];
      entries.push({
        name: sample.name,
        src: variant.url,
        alt: sample.alt,
        bytes: variant.size,
        width: variant.width,
        height: variant.height,
      });
      console.log(`    ${sample.name.padEnd(8)} ${formatBytes(variant.size).padStart(10)}  ${variant.width}x${variant.height}`);
    } catch (error) {
      console.warn(`    ${sample.name.padEnd(8)} skipped: ${error.message}`);
    }
  }

  await writeFile(
    sampleManifest,
    `/**
 * Generated by \`node scripts/build-hero-images.mjs\`: do not edit by hand.
 *
 * Large, lightly compressed JPEGs for the playground to chew on. Served from
 * this origin so drawing them to a canvas does not taint it.
 */

export interface SampleImage {
  readonly name: string;
  readonly src: string;
  readonly alt: string;
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
}

export const SAMPLE_IMAGES: SampleImage[] = ${JSON.stringify(entries, null, 2)};
`,
  );

  return entries.length;
}

async function main() {
  // A stale file from a previous set would be served forever, since the folder
  // is copied wholesale into the export.
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const optimizer = new ImageOptimizer({
    adapter: new LocalAdapter({ root: outDir, baseUrl: '/hero' }),
    // The largest a card ever gets is roughly 46cqw tall in a ~1400px
    // container, so 560px wide covers it on a 2x display without paying for
    // pixels nobody sees.
    sizes: [{ width: 560, height: 780, fit: 'cover' }],
    formats: ['webp'],
    quality: 72,
    // Flat filenames, because the manifest is what resolves them.
    key: '{name}.{ext}',
    onWarning: (w) => console.warn(`  ! ${w.message}`),
  });

  const entries = [];
  let sourceBytes = 0;
  let outputBytes = 0;

  for (const [index, source] of SOURCES.entries()) {
    const label = `${String(index + 1).padStart(2, '0')}/${SOURCES.length}`;
    try {
      const data = await download(source.id);
      const result = await optimizer.optimize({
        source: { data, filename: `hero-${String(index + 1).padStart(2, '0')}.jpg` },
      });

      const variant = result.variants[0];
      sourceBytes += result.source.size;
      outputBytes += variant.size;

      entries.push({ src: variant.url, alt: source.alt });

      console.log(
        `  ${label}  ${formatBytes(result.source.size).padStart(10)} -> ` +
          `${formatBytes(variant.size).padStart(9)}  ` +
          `${String(Math.round(result.savings * 100)).padStart(3)}% smaller  ${variant.key}`,
      );
    } catch (error) {
      // One dead photo id should not take the whole hero down; the corridor
      // repeats whatever it is given.
      console.warn(`  ${label}  skipped ${source.id}: ${error.message}`);
    }
  }

  if (entries.length === 0) throw new Error('No images were produced.');

  const savings = 1 - outputBytes / sourceBytes;
  const stats = {
    count: entries.length,
    sourceBytes,
    outputBytes,
    savingsPercent: Math.round(savings * 100),
  };

  await writeFile(
    manifestPath,
    `/**
 * Generated by \`node scripts/build-hero-images.mjs\`: do not edit by hand.
 *
 * These files were produced by Lens itself: downloaded at full size, then run
 * through \`ImageOptimizer\` with \`LocalAdapter\`. The numbers in \`HERO_STATS\`
 * are what that run measured, so the figure quoted on the landing page cannot
 * drift from what the library actually does.
 */

import type { StreamImage } from '@/components/ui/image-stream-hero';

export const HERO_IMAGES: StreamImage[] = ${JSON.stringify(entries, null, 2)};

/** Measured across the whole set at build time. */
export const HERO_STATS = ${JSON.stringify(stats, null, 2)} as const;
`,
  );

  const sampleCount = await buildSamples();

  const files = await readdir(outDir);
  console.log(
    `\n  ${files.length} file(s) in packages/docs/public/hero\n` +
      `  ${formatBytes(sourceBytes)} -> ${formatBytes(outputBytes)} ` +
      `(${stats.savingsPercent}% smaller overall)\n` +
      `  manifest: packages/docs/lib/hero-images.ts
` +
      `  ${sampleCount} playground sample(s) in packages/docs/public/samples`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
