import Link from 'next/link';
import { CodeBlock } from '@/components/CodeBlock';
import { ArrowRight } from '@/components/Icons';
import { Reveal } from '@/components/Reveal';
import { SectionHead } from './SectionHead';

const DEGRADE = `const result = await optimizer.optimize({
  source,
  formats: ['avif', 'webp', 'jpg'],
});

// AVIF unavailable on this platform? You still get WebP and JPEG.
result.warnings;
// [{ code: 'format_unsupported', format: 'avif', message: '…' }]`;

/** What the snippet above returns on a platform whose sharp has no AV1. */
const OUTCOME = [
  { format: 'avif', state: 'skipped', ok: false },
  { format: 'webp', state: 'ready', ok: true },
  { format: 'jpg', state: 'ready', ok: true },
];

/**
 * The degradation story, laid out like an embed section: copy on the left, the
 * call to action on the right, then the code and what it returns side by side.
 *
 * The result card is illustrative of the snippet beside it, not captured
 * output. It only shows what the docs state: the unsupported format is dropped
 * with a `format_unsupported` warning, the rest still resolve, and only a total
 * failure throws.
 */
export function Resilience() {
  return (
    <section className="mx-auto max-w-shell px-4 py-20 sm:px-6 sm:py-28" aria-label="Error handling">
      <SectionHead
        kicker="RESILIENCE"
        title="A missing codec"
        quiet="is not a 500."
        lead="Prebuilt sharp binaries do not all ship AV1. Where AVIF is unavailable it is skipped and recorded as a warning, and the WebP and JPEG your page needs still resolve."
      >
        <Link href="/docs/pipeline" className="btn-secondary self-start lg:self-auto">
          Read the pipeline
          <ArrowRight className="btn-arrow h-3.5 w-3.5" />
        </Link>
      </SectionHead>

      <div className="mt-12 grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Reveal delay={80}>
          <CodeBlock code={DEGRADE} language="ts" filename="degrade.ts" />
        </Reveal>

        <Reveal delay={160} className="h-full">
          <div className="frame flex h-full flex-col gap-6 p-6 sm:p-8">
            <div>
              <p className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">
                result.formats
              </p>
              <ul className="mt-3 flex flex-col divide-y divide-line rounded-lg border border-line">
                {OUTCOME.map((row) => (
                  <li key={row.format} className="flex items-center justify-between px-3 py-2.5">
                    <span className="font-mono text-sm text-foreground">{row.format}</span>
                    <span
                      className={`inline-flex items-center gap-2 text-sm ${
                        row.ok ? 'text-signal' : 'text-warn'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`h-1.5 w-1.5 rounded-full ${row.ok ? 'bg-signal' : 'bg-warn'}`}
                      />
                      {row.state}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">
                result.warnings
              </p>
              <p className="mt-3 rounded-lg border border-line bg-background/60 p-3 font-mono text-xs leading-relaxed text-secondary">
                <span className="text-warn">format_unsupported</span> · avif
              </p>
            </div>

            <p className="text-sm text-muted">
              Only a total failure throws, and then it is a{' '}
              <code className="font-mono text-foreground">LensError</code> with a stable code
              and a suggested HTTP status.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
