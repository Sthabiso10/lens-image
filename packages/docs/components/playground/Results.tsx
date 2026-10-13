'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { formatBytes } from '@lens-image/core/browser';
import { CodeBlock } from '../CodeBlock';
import { CopyButton } from '../CopyButton';
import type { EncodedVariant } from '@/lib/encode';
import type { plan } from '@/lib/plan';
import { Panel } from './Panel';
import { FORMAT_NAME, type Source } from './config';
import styles from './playground.module.css';

/**
 * Counts to a target over ~500ms.
 *
 * The savings figure is the punchline of the whole page, and a number that
 * lands by counting reads as something that was *measured* rather than a
 * constant that was always there. Honours `prefers-reduced-motion`, where it
 * simply snaps.
 */
function useCountUp(target: number, enabled = true): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!enabled || reduced) {
      from.current = target;
      setValue(target);
      return;
    }

    const start = performance.now();
    const origin = from.current;
    let frame = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 500);
      // easeOutCubic, fast at first, so the number is legible almost at once.
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(origin + (target - origin) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = target;
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, enabled]);

  return value;
}

/** "412.3 KiB" into its number and its unit, so the unit can be set smaller. */
function splitBytes(bytes: number): { amount: string; unit: string } {
  const text = formatBytes(bytes);
  const space = text.indexOf(' ');
  return space === -1
    ? { amount: text, unit: '' }
    : { amount: text.slice(0, space), unit: text.slice(space + 1) };
}

/**
 * The RESULT panel: the headline numbers, a tick-bar comparison, the stats, and
 * the ladder of files.
 *
 * Every figure comes from the encode that just ran. "Saved" is the original's
 * bytes minus the largest output's, so it is a measurement of this image in
 * this browser, not a claim about what the server would produce.
 */
export function Results({
  source,
  encoded,
  focus,
  onFocus,
}: {
  source: Source | null;
  encoded: readonly EncodedVariant[];
  focus: number;
  onFocus: (index: number) => void;
}) {
  const largest = encoded[0];
  const totalBytes = encoded.reduce((sum, v) => sum + v.size, 0);

  const saved = source && largest ? Math.max(0, source.bytes - largest.size) : 0;
  const percent = source && largest ? Math.max(0, 1 - largest.size / source.bytes) * 100 : 0;

  const savedShown = useCountUp(saved, Boolean(largest));
  const percentShown = useCountUp(percent, Boolean(largest));

  return (
    <Panel title="Result" tag="Savings">
      {!source || !largest ? (
        <p className="py-6 text-center text-sm text-muted">
          Numbers appear here once the first encode finishes.
        </p>
      ) : (
        <ResultBody
          source={source}
          largest={largest}
          encoded={encoded}
          totalBytes={totalBytes}
          savedShown={savedShown}
          percentShown={percentShown}
          focus={focus}
          onFocus={onFocus}
        />
      )}
    </Panel>
  );
}

function ResultBody({
  source,
  largest,
  encoded,
  totalBytes,
  savedShown,
  percentShown,
  focus,
  onFocus,
}: {
  source: Source;
  largest: EncodedVariant;
  encoded: readonly EncodedVariant[];
  totalBytes: number;
  savedShown: number;
  percentShown: number;
  focus: number;
  onFocus: (index: number) => void;
}) {
  const { amount, unit } = splitBytes(savedShown);
  const big = percentShown >= 80;
  const larger = largest.size > source.bytes;

  // Both bars are scaled to the bigger of the two, so a PNG that came out
  // larger than its JPEG shows as a longer bar rather than being clipped.
  const scale = Math.max(source.bytes, largest.size, 1);
  const originalWidth = (source.bytes / scale) * 100;
  const lensWidth = (largest.size / scale) * 100;

  return (
    <div className="flex flex-col gap-6">
      {/* The ROI numbers: big, tabular, and counted up to. */}
      <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
        <div>
          <p className="display flex items-baseline gap-1.5 text-4xl tabular-nums text-foreground sm:text-5xl">
            {amount}
            <span className="font-sans text-lg font-normal tracking-normal text-muted">{unit}</span>
          </p>
          <p className="label mt-1">saved on the largest file</p>
        </div>
        <div>
          <p
            className={`display text-4xl tabular-nums transition-colors sm:text-5xl ${
              big ? 'text-signal' : 'text-foreground'
            }`}
          >
            {percentShown.toFixed(0)}
            <span className="font-sans text-lg font-normal tracking-normal text-muted">%</span>
          </p>
          <p className="label mt-1">smaller than the original</p>
        </div>
      </div>

      {larger ? (
        <p className="text-xs text-muted">
          This output is larger than the original, so nothing was saved. Try a lossy format or
          a lower quality.
        </p>
      ) : null}

      {/*
        The same two numbers as lengths. Each bar is a run of thin vertical
        ticks; the grey one is the original, the teal one is what is left of it,
        and it slides as the quality slider moves.
      */}
      <div className="flex flex-col gap-3">
        <TickRow
          name="ORIGINAL"
          value={formatBytes(source.bytes)}
          width={originalWidth}
          tick="var(--fg-muted)"
        />
        <TickRow
          name={`LENS · ${FORMAT_NAME[largest.format].toUpperCase()}`}
          value={formatBytes(largest.size)}
          width={lensWidth}
          tick="var(--accent-bright)"
        />
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-4 sm:grid-cols-4">
        <Stat label="original" value={formatBytes(source.bytes)} />
        <Stat label="largest output" value={formatBytes(largest.size)} />
        <Stat
          label={`all ${encoded.length} file${encoded.length === 1 ? '' : 's'}`}
          value={formatBytes(totalBytes)}
        />
        <Stat label="encode time" value={`${largest.durationMs} ms`} />
      </dl>

      <Ladder encoded={encoded} focus={focus} onFocus={onFocus} sourceBytes={source.bytes} />
    </div>
  );
}

function TickRow({
  name,
  value,
  width,
  tick,
}: {
  name: string;
  value: string;
  width: number;
  tick: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 font-mono text-[10.5px] leading-4">
        <span className="tracking-[0.14em] text-muted">{name}</span>
        <span className="tabular-nums text-secondary">{value}</span>
      </div>
      {/* Decoration: the figures above carry the same information as text. */}
      <div aria-hidden="true" className={styles.ticks}>
        <div
          className={styles.tickFill}
          style={{ width: `${width}%`, '--tick': tick } as CSSProperties}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm tabular-nums text-secondary">{value}</dd>
    </div>
  );
}

/**
 * The responsive ladder, drawn to scale.
 *
 * A table of widths tells you the numbers; bars whose length is the actual
 * width show you the *shape* of what you asked for, which is the thing people
 * get wrong when they pick sizes.
 */
function Ladder({
  encoded,
  focus,
  onFocus,
  sourceBytes,
}: {
  encoded: readonly EncodedVariant[];
  focus: number;
  onFocus: (index: number) => void;
  sourceBytes: number;
}) {
  const widest = Math.max(...encoded.map((v) => v.width));

  return (
    <div>
      <p className="label mb-2">Every file it would write, hover to preview</p>
      <div className="flex flex-col gap-1.5">
        {encoded.map((variant, index) => {
          const share = sourceBytes > 0 ? variant.size / sourceBytes : 0;
          return (
            <button
              // The index is a backstop: widths are de-duplicated upstream, but a
              // repeated key would silently drop a row if that ever regressed.
              key={`${index}-${variant.width}-${variant.format}`}
              type="button"
              aria-pressed={index === focus}
              onMouseEnter={() => onFocus(index)}
              onFocus={() => onFocus(index)}
              onClick={() => onFocus(index)}
              style={{ animationDelay: `${index * 60}ms` }}
              className={`group flex animate-rise items-center gap-2.5 rounded-md border px-3 py-2 text-left transition-colors ${
                index === focus
                  ? 'border-accent/40 bg-accent/5'
                  : 'border-line bg-background hover:border-line-strong'
              }`}
            >
              <span className="w-20 shrink-0 font-mono text-xs tabular-nums text-secondary sm:w-24">
                {variant.width}×{variant.height}
              </span>

              {/* Bar length is the real pixel width, so the ladder is to scale. */}
              <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
                <span
                  className="absolute inset-y-0 left-0 origin-left animate-grow-x rounded-full bg-accent/70 transition-[width] duration-500 ease-out-expo"
                  style={{
                    width: `${(variant.width / widest) * 100}%`,
                    animationDelay: `${index * 60 + 120}ms`,
                  }}
                />
              </span>

              <span className="w-20 shrink-0 text-right font-mono text-xs tabular-nums text-foreground">
                {formatBytes(variant.size)}
              </span>
              <span className="hidden w-12 shrink-0 text-right font-mono text-2xs tabular-nums text-muted sm:block">
                {share > 0 ? `${Math.round(share * 100)}%` : ''}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Storage keys and srcset, computed by the real library, not approximated. */
export function Keys({ planned }: { planned: NonNullable<ReturnType<typeof plan>> }) {
  const srcsets = Object.entries(planned.srcsets).filter(([, v]) => v.length > 0);

  return (
    <Panel title="Storage keys and srcset" tag="Keys">
      <div className="flex flex-col gap-4">
        <ul className="flex flex-col gap-1">
          {planned.variants.map((variant, index) => (
            <li
              key={`${index}-${variant.key}`}
              style={{ animationDelay: `${index * 40}ms` }}
              className="animate-fade-in rounded-md border border-line bg-background px-3 py-1.5 font-mono text-xs text-secondary"
            >
              <span className="break-all">{variant.key}</span>
            </li>
          ))}
        </ul>

        {srcsets.map(([format, srcset]) => (
          <div key={format}>
            <p className="label mb-1.5">srcset</p>
            <div className="group flex items-start gap-2 rounded-lg border border-line bg-background p-3">
              <code className="min-w-0 flex-1 break-all font-mono text-xs text-secondary">
                {srcset}
              </code>
              <div className="shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <CopyButton value={srcset} />
              </div>
            </div>
          </div>
        ))}

        <p className="text-2xs text-muted">
          These come from <code className="font-mono">@lens-image/core/browser</code>, the same{' '}
          <code className="font-mono">buildKey</code> and{' '}
          <code className="font-mono">defaultLabel</code> the server calls. Exact, not
          approximated.
        </p>
      </div>
    </Panel>
  );
}

/** The CODE panel: the `optimize()` call that produces what is on screen. */
export function Snippet({ code }: { code: string }) {
  return (
    <Panel title="The call that produces this" tag="Code" flush>
      {/* The panel is the frame; the code block's own border would double it. */}
      <div className="[&_figure]:rounded-none [&_figure]:border-0 [&_figure]:bg-transparent">
        <CodeBlock code={code} language="ts" />
      </div>
    </Panel>
  );
}
