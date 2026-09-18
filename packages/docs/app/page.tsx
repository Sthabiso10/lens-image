import Link from 'next/link';
import { CodeBlock, CommandLine } from '@/components/CodeBlock';
import { ArrowRight, Database, Layers, Package, Shield } from '@/components/Icons';
import { ImageStreamHero } from '@/components/ui/image-stream-hero';
import { SqueezeCarousel, type SqueezeSlide } from '@/components/ui/carousel-squeeze';
import { HERO_IMAGES, HERO_STATS } from '@/lib/hero-images';
import { GITHUB_URL, VERSION } from '@/lib/nav';

const INSTALL = 'npm install @lens-image/core sharp';

const QUICKSTART = `import { ImageOptimizer } from '@lens-image/core';
import { S3Adapter } from '@lens-image/adapter-s3';

const optimizer = new ImageOptimizer({
  adapter: new S3Adapter({ bucket: 'my-images', region: 'us-east-1' }),
});

const result = await optimizer.optimize({
  source: './photo.jpg',
  quality: 80,
  formats: ['webp', 'jpg'],
  sizes: [{ width: 1200 }, { width: 600 }, { width: 300 }],
});

result.formats.webp.srcset;
// 'https://…-300w.webp 300w, https://…-600w.webp 600w, https://…-1200w.webp 1200w'`;

const DEGRADE = `const result = await optimizer.optimize({
  source,
  formats: ['avif', 'webp', 'jpg'],
});

// AVIF unavailable on this platform? You still get WebP and JPEG.
result.warnings;
// [{ code: 'format_unsupported', format: 'avif', message: '…' }]`;

const FEATURES = [
  {
    icon: Package,
    title: 'Zero dependencies in the core',
    body: 'npm install @lens-image/core adds exactly one package to your lockfile. Not one plus forty. A CI check enforces it, so it stays true.',
    href: '/docs',
  },
  {
    icon: Database,
    title: 'Storage is an interface',
    body: 'One required method. S3, filesystem and Cloudinary ship today; R2, GCS or your own take about forty lines.',
    href: '/docs/adapters',
  },
  {
    icon: Layers,
    title: 'The codec is one too',
    body: 'sharp is an optional peer, imported lazily. Swap it, stub it in tests, or skip it if you only validate and store.',
    href: '/docs/pipeline',
  },
  {
    icon: Shield,
    title: 'Safe by default',
    body: 'Decompression-bomb guard, format sniffing instead of file extensions, EXIF stripped, remote fetching off.',
    href: '/docs/pipeline',
  },
];

/** A wordmark for the corner of the open panel. */
const mark = (text: string) => (
  <span className="text-sm font-medium tracking-tight text-white">{text}</span>
);

/**
 * The storage backends, as carousel panels.
 *
 * The panel imagery is the same set the hero flies past: already optimized by
 * Lens, already on disk, so this section costs no new bytes.
 */
const ADAPTER_SLIDES: SqueezeSlide[] = [
  {
    id: 's3',
    title: 'Amazon S3, and everything that speaks its API.',
    description:
      'Cloudflare R2, MinIO, DigitalOcean Spaces and Backblaze B2 all work through the same adapter, set an endpoint and go. The AWS SDK stays a peer dependency, so you keep your own version.',
    action: 'Read the S3 guide',
    href: '/docs/adapters',
    overlay: mark('@lens-image/adapter-s3'),
    image: HERO_IMAGES[2]?.src,
    imageAlt: HERO_IMAGES[2]?.alt,
  },
  {
    id: 'local',
    title: 'The filesystem, done carefully.',
    description:
      'Atomic writes, so a crash mid-upload leaves the previous file intact rather than a truncated one. Any key that resolves outside the root is refused outright. Zero dependencies.',
    action: 'Read the filesystem guide',
    href: '/docs/adapters',
    overlay: mark('@lens-image/adapter-local'),
    image: HERO_IMAGES[5]?.src,
    imageAlt: HERO_IMAGES[5]?.alt,
  },
  {
    id: 'cloudinary',
    title: 'Cloudinary, without the SDK.',
    description:
      'Signed uploads are an HTTP POST with a SHA-1 signature, which node:crypto and the built-in fetch cover in a couple of hundred lines. Install cost: zero packages.',
    action: 'Read the Cloudinary guide',
    href: '/docs/adapters',
    overlay: mark('@lens-image/adapter-cloudinary'),
    image: HERO_IMAGES[8]?.src,
    imageAlt: HERO_IMAGES[8]?.alt,
  },
  {
    id: 'custom',
    title: 'Or forty lines of your own.',
    description:
      'The contract is a name and an upload function. Implement exists and remove to unlock storage-aware caching and deletion. Retries, concurrency limiting and error wrapping are handled for you.',
    action: 'Write an adapter',
    href: '/docs/adapters',
    overlay: mark('StorageAdapter'),
    image: HERO_IMAGES[0]?.src,
    imageAlt: HERO_IMAGES[0]?.alt,
  },
  {
    id: 'none',
    title: 'Or no storage at all.',
    description:
      'Leave the adapter out and Lens runs in process-only mode: no URLs are invented, and the encoded bytes come back on each variant for you to do as you like with.',
    action: 'See the API',
    href: '/docs/api',
    overlay: mark('process-only'),
    image: HERO_IMAGES[6]?.src,
    imageAlt: HERO_IMAGES[6]?.alt,
  },
];

export default function HomePage() {
  return (
    <>
      <Hero />
      <Quickstart />
      <Features />
      <Degradation />
      <Adapters />
      <FinalCta />
    </>
  );
}

/**
 * The hero: a corridor of images rushing the viewer, with the copy over it.
 *
 * The images are not decoration bought from a stock site and dropped in. They
 * were put through Lens by `scripts/build-hero-images.mjs`, and the figure in
 * the caption is what that run measured: so a hero for an image-optimization
 * library is itself evidence rather than an illustration.
 *
 * Legibility over moving pictures is the whole problem here, and it is solved
 * by geometry before it is solved by a scrim: the corridor's cards are tiny at
 * the vanishing point and only grow as they sweep *outward*, so the middle of
 * the frame, where every word sits, is the quietest part of it. The scrim
 * below only has to finish the job.
 */
function Hero() {
  return (
    <section className="relative" aria-label="Intro">
      <ImageStreamHero
        images={HERO_IMAGES}
        speed={26}
        axis={52}
        className="h-[660px] w-full sm:h-[760px]"
      >
        {/*
          Three stacked washes, each doing one job:
          1. a pool behind the copy column;
          2. a top fade so the corridor does not collide with the fixed header;
          3. a bottom fade that lands on the page background, so the section
             ends rather than being cut off.

          The pool is deliberately narrow, 36% of the width, so it dies well
          inside the rails. The cards are only interesting once they are large,
          and they are only large out at the edges; a wash wide enough to reach
          them buys legibility the geometry was already providing and pays for
          it with the one part of the effect worth looking at.
        */}
        {/*
          Two pools, because the ratio between the copy and the frame inverts
          with width. On a wide screen the text occupies the middle third and
          the cards are out at the edges, so a narrow pool separates them. On a
          phone the text is nearly full-bleed while the corridor, sized in
          `cqw`, shrinks with the container, so the two land on top of each
          other and the pool has to cover almost everything.
        */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 sm:hidden"
          style={{
            background: [
              'radial-gradient(86% 42% at 50% 44%, rgb(8 9 10 / 0.95) 0%, rgb(8 9 10 / 0.88) 60%, rgb(8 9 10 / 0.35) 100%)',
              'linear-gradient(to bottom, rgb(8 9 10 / 0.85) 0%, rgb(8 9 10 / 0) 16%)',
              'linear-gradient(to top, var(--bg) 0%, rgb(8 9 10 / 0.6) 12%, rgb(8 9 10 / 0) 30%)',
            ].join(','),
          }}
        />

        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 hidden sm:block"
          style={{
            background: [
              'radial-gradient(36% 46% at 50% 44%, rgb(8 9 10 / 0.94) 0%, rgb(8 9 10 / 0.78) 55%, rgb(8 9 10 / 0) 100%)',
              'linear-gradient(to bottom, rgb(8 9 10 / 0.8) 0%, rgb(8 9 10 / 0) 18%)',
              'linear-gradient(to top, var(--bg) 0%, rgb(8 9 10 / 0.55) 12%, rgb(8 9 10 / 0) 34%)',
            ].join(','),
          }}
        />

        <div className="relative mx-auto flex h-full max-w-shell flex-col items-center justify-center px-4 text-center sm:px-6">
          <Link
            href="/docs#about-that-zero-dependencies-claim"
            className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 py-1 pl-1 pr-3 text-xs text-muted backdrop-blur-sm transition-colors hover:border-line-strong hover:text-foreground"
          >
            <span className="rounded-full bg-raised px-2 py-0.5 font-mono text-2xs text-secondary">
              v{VERSION}
            </span>
            Zero dependencies, and we mean it literally
            <ArrowRight className="h-3 w-3" />
          </Link>

          {/*
            The pool behind the copy does the work, but a corridor is by nature
            unpredictable. A pale frame can drift under a line at any moment.
            A soft shadow costs nothing and removes that failure mode entirely.
          */}
          <h1
            className="mt-6 max-w-2xl text-4xl font-semibold text-foreground sm:text-5xl"
            style={{ textShadow: '0 1px 24px rgb(8 9 10 / 0.9), 0 1px 3px rgb(8 9 10 / 0.7)' }}
          >
            Image optimization you can actually audit
          </h1>

          <p
            className="mt-4 max-w-xl text-lg text-secondary"
            style={{ textShadow: '0 1px 16px rgb(8 9 10 / 0.95), 0 1px 2px rgb(8 9 10 / 0.8)' }}
          >
            Resize, compress and convert images, then hand them to whatever storage you
            already use. A processing core with no dependencies, and everything heavy
            behind an interface you control.
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
            <Link href="/docs/getting-started" className="btn btn-primary">
              Get started
            </Link>
            <Link href="/playground" className="btn btn-secondary">
              Open the playground
            </Link>
          </div>

          <div className="mt-8 w-full max-w-md">
            <CommandLine command={INSTALL} />
          </div>

          <p className="mt-6 text-xs text-subtle">
            The {HERO_STATS.count} images flying past were optimized by Lens, {' '}
            <span className="text-muted">
              {(HERO_STATS.sourceBytes / 1024 / 1024).toFixed(1)} MB down to{' '}
              {Math.round(HERO_STATS.outputBytes / 1024)} KB, {HERO_STATS.savingsPercent}%
              smaller.
            </span>
          </p>
        </div>
      </ImageStreamHero>
    </section>
  );
}

function Quickstart() {
  return (
    <section className="mx-auto max-w-shell px-4 py-16 sm:px-6" aria-label="Quick start">
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-14">
        <div>
          <p className="label">Quick start</p>
          <h2 className="mt-1.5 text-2xl font-semibold">
            Six responsive files in eight lines
          </h2>
          <p className="mt-3 text-muted">
            One call produces every format at every size, uploads them, and hands back the
            URLs grouped for a <code className="font-mono text-sm text-foreground">srcset</code>.
            Swap the adapter to change where they land; nothing above it moves.
          </p>
          <ul className="mt-5 flex flex-col gap-2.5 text-sm text-muted">
            {[
              'Keys are content-addressed, so immutable caching is safe by construction.',
              'Formats are independent, one failing never takes the others down.',
              'Never upscales, and never trusts a file extension over the actual bytes.',
            ].map((line) => (
              <li key={line} className="flex gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-[9px] h-1 w-1 flex-none rounded-full bg-subtle"
                />
                {line}
              </li>
            ))}
          </ul>
          <Link
            href="/docs/getting-started"
            className="group mt-6 inline-flex items-center gap-1.5 text-sm text-accent-bright"
          >
            Read the walkthrough
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <CodeBlock code={QUICKSTART} language="ts" filename="upload.ts" />
      </div>
    </section>
  );
}

function Features() {
  return (
    <section
      className="mx-auto max-w-shell px-4 py-16 sm:px-6"
      aria-label="What makes it different"
    >
      <p className="label">Design</p>
      <h2 className="mt-1.5 max-w-lg text-2xl font-semibold">
        Small on purpose, and honest about the parts that are not
      </h2>

      <div className="mt-8 grid gap-2 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <Link
            key={feature.title}
            href={feature.href}
            className="group flex flex-col gap-2 rounded-lg border border-line bg-surface p-5 transition-colors hover:border-line-strong hover:bg-raised"
          >
            <feature.icon className="h-4 w-4 text-accent" />
            <h3 className="flex items-center gap-1.5 text-base font-medium text-foreground">
              {feature.title}
              <ArrowRight className="h-3.5 w-3.5 text-subtle transition-transform group-hover:translate-x-0.5" />
            </h3>
            <p className="text-sm text-muted">{feature.body}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Degradation() {
  return (
    <section className="mx-auto max-w-shell px-4 py-16 sm:px-6" aria-label="Error handling">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-14">
        <CodeBlock code={DEGRADE} language="ts" />

        <div>
          <p className="label">Failure</p>
          <h2 className="mt-1.5 text-2xl font-semibold">A missing codec is not a 500</h2>
          <p className="mt-3 text-muted">
            Prebuilt sharp binaries do not all ship AV1. On the platforms where AVIF is
            unavailable, the AVIF output is skipped and recorded as a warning. The WebP
            and JPEG your page actually needs still resolve.
          </p>
          <p className="mt-3 text-muted">
            Only a total failure throws, and when it does it is a{' '}
            <code className="font-mono text-sm text-foreground">LensError</code> with a
            stable code and a suggested HTTP status, so a too-large upload is a 422 rather
            than a mystery.
          </p>
          <Link
            href="/docs/pipeline"
            className="group mt-6 inline-flex items-center gap-1.5 text-sm text-accent-bright"
          >
            How the pipeline handles failure
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Adapters() {
  return (
    <section className="mx-auto max-w-shell px-4 py-16 sm:px-6" aria-label="Storage">
      <p className="label">Storage</p>
      <h2 className="mt-1.5 max-w-lg text-2xl font-semibold">
        One interface, one required method
      </h2>
      <p className="mt-3 max-w-xl text-muted">
        Processing and storage are separate concerns, so they are separate packages. Pick a
        backend, or write one. The call above it never changes.
      </p>

      {/*
        The carousel needs room to be a carousel. Its open panel is a 16:9 block,
        so once the container drops under about 600px that block alone is wider
        than the row, `--sq-room` goes negative and the three squeezed columns
        collapse to zero width, which is not just ugly but leaves three tab stops
        that cannot be tapped. Below `sm` the same five entries render as a list,
        which is the better phone layout anyway.
      */}
      <div className="mt-8 hidden sm:block">
        <SqueezeCarousel
          slides={ADAPTER_SLIDES}
          label="Storage backends"
          height="clamp(180px, 30cqi, 340px)"
          accent="var(--accent)"
          accentForeground="#04120f"
          // The component ships its own webfont from a third-party CDN.
          // Inheriting keeps the site on the Inter it already serves, and means
          // the browser never requests those files. An @font-face that nothing
          // references is never fetched.
          style={{ fontFamily: 'inherit' }}
        />
      </div>

      <ul className="mt-8 flex flex-col gap-2 sm:hidden">
        {ADAPTER_SLIDES.map((slide) => (
          <li key={slide.id}>
            <Link
              href={slide.href ?? '/docs/adapters'}
              className="group flex gap-3 rounded-lg border border-line bg-surface p-3 transition-colors hover:border-line-strong hover:bg-raised"
            >
              {slide.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={slide.image}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-16 w-16 shrink-0 rounded object-cover"
                />
              ) : null}
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  {slide.title}
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="mt-1 block text-sm text-muted">{slide.description}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="mx-auto max-w-shell px-4 pb-20 pt-4 sm:px-6" aria-label="Get started">
      <div className="flex flex-col items-center gap-5 text-center">
        <h2 className="max-w-md text-2xl font-semibold">
          Stop rewriting the same upload pipeline
        </h2>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Link href="/docs/getting-started" className="btn btn-primary">
            Get started
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="btn btn-secondary"
          >
            View source
          </a>
        </div>
      </div>
    </section>
  );
}
