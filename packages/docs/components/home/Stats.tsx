import { Reveal } from '@/components/Reveal';
import { HERO_STATS } from '@/lib/hero-images';
import { CountUp } from './CountUp';
import { SectionHead } from './SectionHead';
import { TickBar } from './TickBar';

/**
 * Every figure on this page comes from somewhere checkable:
 *
 * - the savings, and the before/after sizes, are `HERO_STATS`: what
 *   `scripts/build-hero-images.mjs` measured when it ran the hero photographs
 *   through Lens. That file records totals only, with no per-format breakdown,
 *   so the comparison below is original against optimized and does not
 *   pretend to a finer split than was measured;
 * - "0 runtime dependencies" is `dependencies` in `@lens-image/core`'s
 *   package.json, which CI enforces;
 * - "3 storage adapters" is S3, filesystem and Cloudinary: the adapter
 *   packages that ship today.
 */
const sourceMb = (HERO_STATS.sourceBytes / 1024 / 1024).toFixed(1);
const outputKb = Math.round(HERO_STATS.outputBytes / 1024);
const outputPercent = (HERO_STATS.outputBytes / HERO_STATS.sourceBytes) * 100;

const COLUMNS = [
  {
    figure: <CountUp to={HERO_STATS.savingsPercent} suffix="%" />,
    label: 'Fewer bytes',
    detail: `Measured across the ${HERO_STATS.count} photographs in the hero: ${sourceMb} MB down to ${outputKb} KB.`,
  },
  {
    // Counting up to zero would be a joke at the reader's expense, so it is static.
    figure: <span className="tabular-nums">0</span>,
    label: 'Runtime dependencies',
    detail: 'In @lens-image/core. Installing it adds one package to your lockfile, and CI enforces it.',
  },
  {
    figure: <CountUp to={3} />,
    label: 'Storage adapters',
    detail: 'S3, filesystem and Cloudinary ship today. Or forty lines of your own.',
  },
];

export function Stats() {
  return (
    <section className="mx-auto max-w-shell px-4 py-20 sm:px-6 sm:py-28" aria-label="Results">
      <SectionHead kicker="RESULTS" title="A lighter web," quiet="by default." align="center" />

      <Reveal delay={100} className="mt-14">
        <div className="grid divide-y divide-line border-y border-line md:grid-cols-3 md:divide-x md:divide-y-0">
          {COLUMNS.map((column) => (
            <div key={column.label} className="px-2 py-10 text-center md:px-8">
              <p className="display text-6xl text-foreground sm:text-7xl">{column.figure}</p>
              <p className="mt-4 text-sm font-medium text-foreground">{column.label}</p>
              <p className="mx-auto mt-2 max-w-[17rem] text-sm text-muted">{column.detail}</p>
            </div>
          ))}
        </div>
      </Reveal>

      {/* The bar race: same hero set, before and after. */}
      <Reveal delay={140} className="mt-14">
        <div className="frame p-5 sm:p-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">
              The {HERO_STATS.count} hero photographs, total size
            </p>
            <p className="text-sm text-muted">Optimized by Lens with LocalAdapter</p>
          </div>

          <div className="mt-6 flex flex-col gap-5">
            <div>
              <div className="mb-2 flex items-baseline justify-between text-sm">
                <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
                  Original
                </span>
                <span className="tabular-nums text-foreground">{sourceMb} MB</span>
              </div>
              <TickBar percent={100} tone="muted" />
            </div>
            <div>
              <div className="mb-2 flex items-baseline justify-between text-sm">
                <span className="font-mono text-xs uppercase tracking-[0.14em] text-accent-bright">
                  After Lens
                </span>
                <span className="tabular-nums text-foreground">{outputKb} KB</span>
              </div>
              <TickBar percent={outputPercent} tone="accent" />
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
