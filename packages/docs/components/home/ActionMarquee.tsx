'use client';

import { useState } from 'react';
import { Reveal } from '@/components/Reveal';
import { Aperture, Database, Layers, Package, Search, Shield, Upload } from '@/components/Icons';
import styles from './marquee.module.css';
import { SectionHead } from './SectionHead';

type Icon = typeof Search;
type Chip = { icon: Icon; label: string };

/**
 * What Lens does to an image, one verb phrase per chip. Every phrase names
 * something the pipeline really does (see the docs' pipeline page): nothing
 * here is aspirational.
 *
 * Three rows so the ticker has depth. Each row is shifted in length from its
 * neighbours so the chips never line up into columns.
 */
const ROWS: Chip[][] = [
  [
    { icon: Search, label: 'Sniff format from bytes' },
    { icon: Shield, label: 'Reject decompression bombs' },
    { icon: Layers, label: 'Resize to 1200w' },
    { icon: Aperture, label: 'Encode AVIF' },
    { icon: Aperture, label: 'Keep WebP if AVIF fails' },
    { icon: Shield, label: 'Strip EXIF' },
    { icon: Layers, label: 'Apply EXIF orientation' },
    { icon: Package, label: 'Never upscale' },
  ],
  [
    { icon: Upload, label: 'Upload to S3' },
    { icon: Upload, label: 'Upload to R2 or MinIO' },
    { icon: Database, label: 'Write atomically to disk' },
    { icon: Upload, label: 'Sign Cloudinary upload' },
    { icon: Package, label: 'Hash content into the key' },
    { icon: Upload, label: 'Retry with jitter' },
    { icon: Shield, label: 'Refuse path traversal' },
  ],
  [
    { icon: Layers, label: 'Build srcset' },
    { icon: Package, label: 'Emit a thumbnail' },
    { icon: Database, label: 'Skip unchanged (opt-in cache)' },
    { icon: Search, label: 'Collect warnings, not exceptions' },
    { icon: Layers, label: 'Encode four at a time' },
    { icon: Package, label: 'Hand back picture sources' },
    { icon: Search, label: 'Validate in the browser' },
  ],
];

/**
 * Seconds for one full loop. Longer rows go slower so chips move at one speed:
 * a chip is about 7px per character plus its padding, so 0.38s per character
 * works out to roughly 25-30px/s, slow enough to read and fast enough to see.
 */
const durationFor = (row: Chip[]) => row.reduce((total, chip) => total + chip.label.length, 0) * 0.38;

function ChipRow({ chips, reverse }: { chips: Chip[]; reverse?: boolean }) {
  return (
    <div className={styles.marquee}>
      <div
        className={`${styles.track} ${reverse ? styles.reverse : ''}`}
        style={{ ['--marquee-duration' as string]: `${durationFor(chips)}s` }}
      >
        <ul className={styles.group}>
          {chips.map((chip) => (
            <ChipItem key={chip.label} chip={chip} />
          ))}
        </ul>
        {/* The second copy exists only to make the loop seamless. */}
        <ul className={`${styles.group} ${styles.duplicate}`}>
          {chips.map((chip) => (
            <ChipItem key={chip.label} chip={chip} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function ChipItem({ chip }: { chip: Chip }) {
  return (
    <li className="inline-flex h-10 flex-none items-center gap-2.5 whitespace-nowrap rounded-full border border-line bg-surface pl-1.5 pr-4 text-sm text-secondary">
      <span className="grid h-7 w-7 place-items-center rounded-full bg-raised text-accent-bright">
        <chip.icon className="h-3.5 w-3.5" />
      </span>
      {chip.label}
    </li>
  );
}

/**
 * Rows of "action chips" sliding in opposite directions.
 *
 * The motion is pure CSS. It stops on hover and when the Pause button is
 * pressed, and under prefers-reduced-motion the rows stop sliding altogether
 * and wrap into a static cluster (see marquee.module.css), so every chip stays
 * readable.
 *
 * The rows are decorative and, being a loop, would read every step several
 * times to a screen reader, so they are `aria-hidden` and the steps are given
 * once as a plain list instead.
 */
export function ActionMarquee() {
  const [paused, setPaused] = useState(false);

  return (
    <section className="py-20 sm:py-28" aria-label="Pipeline steps">
      <div className="mx-auto max-w-shell px-4 sm:px-6">
        <SectionHead
          kicker="PIPELINE STEPS"
          title="Everything that happens"
          quiet="to an upload, by name."
          align="center"
        />
      </div>

      <ul className="sr-only">
        {ROWS.flat().map((chip) => (
          <li key={chip.label}>{chip.label}</li>
        ))}
      </ul>

      <Reveal className="mt-12">
        <div
          aria-hidden="true"
          data-paused={paused}
          className={`${styles.rows} flex flex-col gap-3`}
        >
          {ROWS.map((row, index) => (
            <ChipRow key={index} chips={row} reverse={index % 2 === 1} />
          ))}
        </div>
      </Reveal>

      {/* The label stays "Pause motion" and `aria-pressed` carries the state. */}
      <div className={`${styles.toggle} mt-6 flex justify-center`}>
        <button
          type="button"
          aria-pressed={paused}
          onClick={() => setPaused((value) => !value)}
          className="btn-secondary btn-sm"
        >
          <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor">
            {paused ? (
              <path d="M3 1.5v9l7.5-4.5z" />
            ) : (
              <path d="M2.5 1.5h2.5v9H2.5zM7 1.5h2.5v9H7z" />
            )}
          </svg>
          Pause motion
        </button>
      </div>
    </section>
  );
}
