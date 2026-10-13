import Link from 'next/link';
import { ArrowRight, GitHub } from '@/components/Icons';
import { Reveal } from '@/components/Reveal';
import { GITHUB_URL } from '@/lib/nav';

/**
 * The closing card: the same frame as the hero, so the page ends the way it
 * began. A faint dot grid stands in for the corridor.
 */
export function FinalCta() {
  return (
    <section className="px-2 pb-2 pt-10 sm:pt-16" aria-label="Get started">
      <Reveal>
        <div className="frame dot-grid">
          <div className="flex flex-col items-center gap-8 px-5 py-20 text-center sm:px-8 sm:py-28">
            <h2 className="display max-w-3xl text-4xl text-foreground sm:text-6xl">
              Stop rewriting
              <br />
              <span className="text-muted">the same upload pipeline.</span>
            </h2>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link href="/docs/getting-started" className="btn-light">
                Get started
                <span className="btn-nub">
                  <ArrowRight className="btn-arrow h-3 w-3" />
                </span>
              </Link>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="btn-secondary"
              >
                <GitHub className="h-4 w-4" />
                View source
              </a>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
