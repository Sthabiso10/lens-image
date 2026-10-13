import Link from 'next/link';
import { CodeBlock, CommandLine } from '@/components/CodeBlock';
import { ArrowRight } from '@/components/Icons';
import { Reveal } from '@/components/Reveal';
import { SectionHead } from './SectionHead';

type Step = {
  code: string;
  number: string;
  title: string;
  lead: string;
  cells: { heading: string; points: string[] }[];
  /** What goes in the right-hand column, top to bottom. */
  commands?: string[];
  snippet: string;
  filename: string;
};

/**
 * The quick start, taken apart into four bands. The snippets are the ones from
 * the README and the getting-started page, split where the work splits, so
 * reading the four in order reproduces the original eight lines.
 */
const STEPS: Step[] = [
  {
    code: 'IN',
    number: '01',
    title: 'Install',
    lead: 'The core is one package with nothing underneath it. The codec is yours to choose.',
    cells: [
      {
        heading: 'In your lockfile',
        points: [
          'One package: @lens-image/core has zero dependencies',
          'sharp is an optional peer, installed by you and visible there',
        ],
      },
      {
        heading: 'To start',
        points: [
          'Node 18.19 or newer',
          'No adapter needed: without one, Lens hands the bytes back',
        ],
      },
    ],
    commands: ['npm install @lens-image/core sharp'],
    filename: 'optimizer.ts',
    snippet: `import { ImageOptimizer } from '@lens-image/core';

// No adapter yet? Fine. Lens runs in process-only mode.
const optimizer = new ImageOptimizer();`,
  },
  {
    code: 'AD',
    number: '02',
    title: 'Pick an adapter',
    lead: 'Storage is an interface with one required method. Choose where the files land.',
    cells: [
      {
        heading: 'Ships today',
        points: [
          'S3, and R2, MinIO, Spaces or B2 through an endpoint',
          'Filesystem, with atomic writes',
          'Cloudinary, signed over plain fetch',
        ],
      },
      {
        heading: 'Or your own',
        points: [
          'One required method: upload()',
          'Retries, concurrency limits and error wrapping are handled for you',
        ],
      },
    ],
    commands: ['npm install @lens-image/adapter-s3 @aws-sdk/client-s3'],
    filename: 'optimizer.ts',
    snippet: `import { S3Adapter } from '@lens-image/adapter-s3';

const optimizer = new ImageOptimizer({
  adapter: new S3Adapter({ bucket: 'my-images', region: 'us-east-1' }),
});`,
  },
  {
    code: 'OP',
    number: '03',
    title: 'Optimize',
    lead: 'One call produces every format at every size, uploads them, and returns the URLs.',
    cells: [
      {
        heading: 'Per call',
        points: [
          'Every format at every size, planned up front',
          'Formats fail independently: a failure is a warning',
        ],
      },
      {
        heading: 'By default',
        points: [
          'Metadata stripped, EXIF orientation applied',
          'Never upscales, never trusts a file extension',
        ],
      },
    ],
    filename: 'upload.ts',
    snippet: `const result = await optimizer.optimize({
  source: './photo.jpg',
  quality: 80,
  formats: ['webp', 'jpg'],
  sizes: [{ width: 1200 }, { width: 600 }, { width: 300 }],
});`,
  },
  {
    code: 'SH',
    number: '04',
    title: 'Ship the srcset',
    lead: 'The result comes back grouped by format, ready to drop into markup.',
    cells: [
      {
        heading: 'In the result',
        points: [
          'A srcset per format, sorted ascending',
          'result.savings and result.warnings alongside',
        ],
      },
      {
        heading: 'In your markup',
        points: [
          'toPicture() returns picture sources and an img fallback',
          'Keys are content-addressed, so immutable caching is safe',
        ],
      },
    ],
    filename: 'page.tsx',
    snippet: `result.formats.webp.srcset;
// 'https://…-300w.webp 300w, https://…-600w.webp 600w, https://…-1200w.webp 1200w'

import { toPicture } from '@lens-image/core';

const pic = toPicture(result, {
  alt: 'Cabin at dusk',
  sizes: '(max-width: 768px) 100vw, 50vw',
});`,
  },
];

/** Warm tint at the foot of each band, as a share of the colour mixed in. */
const WARMTH = [6, 7, 9, 10];

/**
 * Four tall bands, one per step.
 *
 * From `lg` up, on screens at least 820px tall, each band is `position: sticky`, so as you scroll the next one
 * slides up over the last and leaves a sliver of its top edge behind, like a
 * stack of cards. Each band is fully opaque (the gradient is mixed from
 * `--surface`, never transparent) or the one underneath would show through.
 * Below `lg`, or on a short window (under 820px tall), they are an ordinary
 * stack: a band there can be taller than the viewport, and a sticky element
 * taller than the screen would hide its own bottom half.
 *
 * The warm tint is the one place `--accent-warm` is used on this page, and it
 * deepens with each step so the sequence reads as progress.
 */
export function Steps() {
  return (
    <section className="mx-auto max-w-shell px-4 py-20 sm:px-6 sm:py-28" aria-label="How it works">
      <SectionHead kicker="QUICK START" title="From install to srcset" quiet="in four steps.">
        <Link href="/docs/getting-started" className="btn-light self-start lg:self-auto">
          Read the walkthrough
          <span className="btn-nub">
            <ArrowRight className="btn-arrow h-3 w-3" />
          </span>
        </Link>
      </SectionHead>

      <ol className="mt-14 flex flex-col gap-4">
        {STEPS.map((step, index) => (
          <li
            key={step.code}
            className="rounded-2xl border border-line-strong p-5 sm:p-8 lg:[@media(min-height:820px)]:sticky lg:top-[var(--stick)] lg:p-10"
            style={
              {
                '--stick': `${72 + index * 14}px`,
                background: `linear-gradient(to bottom, var(--surface), color-mix(in oklab, var(--accent-warm) ${WARMTH[index]}%, var(--surface)))`,
              } as React.CSSProperties
            }
          >
            <Reveal>
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="font-mono text-xs text-muted">
                    <span aria-hidden="true">({step.code})</span>
                  </p>
                  <h3 className="display mt-3 text-3xl text-foreground sm:text-4xl">
                    <span className="sr-only">Step {index + 1}: </span>
                    {step.title}
                  </h3>
                  <p className="mt-3 max-w-md text-base text-secondary">{step.lead}</p>
                </div>
                <span
                  aria-hidden="true"
                  className="display select-none text-5xl leading-none tabular-nums text-subtle sm:text-7xl"
                  style={{ fontWeight: 200 }}
                >
                  {step.number}
                </span>
              </div>

              <div className="mt-8 grid gap-4 lg:mt-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
                <div className="grid content-start gap-4">
                  {step.cells.map((cell) => (
                    <div
                      key={cell.heading}
                      className="rounded-xl border border-line bg-background/50 p-5"
                    >
                      <p className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">
                        {cell.heading}
                      </p>
                      <ul className="mt-3 flex flex-col gap-2 text-sm text-secondary">
                        {cell.points.map((point) => (
                          <li key={point} className="flex gap-2.5">
                            <span
                              aria-hidden="true"
                              className="mt-[9px] h-1 w-1 flex-none rounded-full bg-[var(--accent-warm)]"
                            />
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-3">
                  {step.commands?.map((command) => (
                    <CommandLine key={command} command={command} />
                  ))}
                  <CodeBlock code={step.snippet} language="ts" filename={step.filename} />
                </div>
              </div>
            </Reveal>
          </li>
        ))}
      </ol>
    </section>
  );
}
