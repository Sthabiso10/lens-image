import Link from 'next/link';
import { CommandLine } from '@/components/CodeBlock';
import { ArrowRight } from '@/components/Icons';
import { ImageStreamHero } from '@/components/ui/image-stream-hero';
import { HERO_IMAGES, HERO_STATS } from '@/lib/hero-images';
import { VERSION } from '@/lib/nav';
import { CategoryStack } from './hero/CategoryStack';
import { LiveRun } from './hero/LiveRun';
import { ScrollCue } from './hero/ScrollCue';
import { SplitHeadline } from './hero/SplitHeadline';

const INSTALL = 'npm install @lens-image/core sharp';

/**
 * The hero: a framed card holding a corridor of images rushing the viewer,
 * with the copy pinned to its bottom-left corner.
 *
 * The images are not decoration bought from a stock site and dropped in. They
 * were put through Lens by `scripts/build-hero-images.mjs`, and the figure on
 * the live-run card is what that run measured: so a hero for an
 * image-optimization library is itself evidence rather than an illustration.
 *
 * Legibility over moving pictures is the whole problem here. The corridor's
 * cards are tiny at the vanishing point and only grow as they sweep *outward*,
 * so the corridor's axis is lifted into the upper half of the frame, where the
 * cards are still small, and the copy sits underneath it. The scrims below
 * only have to finish the job: they are laid out for a bottom-left text block
 * rather than the old centred one, which is where the big near cards pass.
 *
 * Around that, three quiet pieces of motion keep the frame from feeling like a
 * single loop: a column of format and backend pills up the right edge, the
 * live-run card bottom-right, and a scroll cue at the bottom centre. They are
 * all small, all pure CSS, and the right-edge column and the cue only exist at
 * `md` and up, where the frame is wide enough to hold them clear of the copy.
 */
export function Hero() {
  return (
    <section className="px-2 pb-2" aria-label="Intro">
      {/* The frame supplies the border, radius, surface and corner dots. */}
      <div className="frame">
        <ImageStreamHero
          images={HERO_IMAGES}
          speed={26}
          axis={38}
          stageClassName="hero-exit-stage"
          className="h-[max(640px,calc(100svh-4.5rem))] w-full [--ish-axis:32%] sm:[--ish-axis:38%]"
        >
          {/*
            Two washes, each doing one job:
            1. a rise from the bottom edge that pools behind the copy block and
               lands exactly on the frame's own surface colour, so the card
               ends instead of being cut off;
            2. a side wash from the left, because the text is left-aligned and
               the left rail's near cards are the brightest thing it meets.

            They are built from `--surface` with alpha rather than a literal
            black so they stay flush with the frame whatever the theme does.
          */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background: [
                'linear-gradient(to top, var(--surface) 0%, color-mix(in srgb, var(--surface) 94%, transparent) 30%, color-mix(in srgb, var(--surface) 70%, transparent) 50%, transparent 76%)',
                'linear-gradient(to right, color-mix(in srgb, var(--surface) 75%, transparent) 0%, transparent 62%)',
                'linear-gradient(to bottom, color-mix(in srgb, var(--surface) 70%, transparent) 0%, transparent 18%)',
              ].join(','),
            }}
          />

          {/*
            Right edge, md and up. Pinned near the top so it stays well clear of
            the copy block and of the live-run card, which both live below it.
          */}
          <CategoryStack className="hero-exit-copy pointer-events-none absolute right-5 top-16 hidden md:block lg:right-8 lg:top-20" />

          <div className="hero-exit-copy absolute inset-x-0 bottom-0 flex flex-col gap-8 p-5 sm:p-8 lg:flex-row lg:items-end lg:justify-between lg:p-12">
            <div className="flex max-w-3xl flex-col items-start">
              <Link
                href="/docs/pipeline#graceful-degradation"
                className="pill animate-rise pl-1.5! backdrop-blur-sm"
              >
                <span className="rounded-full bg-overlay px-2 py-0.5 font-mono text-2xs text-foreground">
                  v{VERSION}
                </span>
                Graceful AVIF fallback built in
                <ArrowRight className="btn-arrow h-3 w-3" />
              </Link>

              {/*
                The scrim does most of the work, but a corridor is by nature
                unpredictable: a pale frame can drift under a line at any
                moment. A soft shadow costs nothing and removes that failure
                mode entirely.
              */}
              <SplitHeadline
                className="display mt-5 text-[2.125rem] leading-[1.02] tracking-[-0.04em] text-foreground sm:text-6xl sm:leading-[1] lg:text-7xl"
                style={{ textShadow: '0 1px 24px rgb(10 10 10 / 0.9), 0 1px 3px rgb(10 10 10 / 0.7)' }}
                lines={[
                  { text: 'Images, optimized.' },
                  { text: 'Stored anywhere.', className: 'text-muted' },
                ]}
              />

              <p
                className="mt-5 max-w-xl animate-rise text-base text-secondary sm:text-lg"
                style={{
                  textShadow: '0 1px 16px rgb(10 10 10 / 0.95), 0 1px 2px rgb(10 10 10 / 0.8)',
                  animationDelay: '420ms',
                }}
              >
                Resize, compress and convert, then hand the result to whatever storage you
                already use. A core with no dependencies, and everything heavy behind an
                interface you control.
              </p>

              <div
                className="mt-7 flex w-full animate-rise flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center"
                style={{ animationDelay: '520ms' }}
              >
                <Link href="/docs/getting-started" className="btn-light">
                  Get started
                  <span className="btn-nub">
                    <ArrowRight className="btn-arrow h-3 w-3" />
                  </span>
                </Link>
                <div className="w-full sm:w-auto sm:min-w-[22rem]">
                  <CommandLine command={INSTALL} />
                </div>
              </div>
            </div>

            {/*
              The measured figure, as a card: it plays the pipeline that produced
              the images first, then holds the result.
            */}
            <LiveRun {...HERO_STATS} />
          </div>

          <ScrollCue />
        </ImageStreamHero>
      </div>
    </section>
  );
}
