'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatBytes } from '@lens-image/core/browser';
import type { ImageMetadata } from '@lens-image/core/browser';
import { CodeBlock } from './CodeBlock';
import { CopyButton } from './CopyButton';
import { Upload } from './Icons';
import {
  CompareSlider,
  CompareSliderAfter,
  CompareSliderBefore,
  CompareSliderHandle,
  CompareSliderLabel,
} from './ui/compare-slider';
import {
  detectFormats,
  encodeAll,
  loadBitmap,
  revoke,
  type BrowserFormat,
  type EncodedVariant,
} from '@/lib/encode';
import { SAMPLE_IMAGES } from '@/lib/sample-images';
import { plan, readHeader, type PlanInput } from '@/lib/plan';

const FORMATS: { id: BrowserFormat; label: string }[] = [
  { id: 'avif', label: 'avif' },
  { id: 'webp', label: 'webp' },
  { id: 'jpeg', label: 'jpg' },
  { id: 'png', label: 'png' },
];

const WIDTH_PRESETS = [
  { label: 'Responsive', widths: [1600, 1200, 800, 400] },
  { label: 'Article', widths: [1200, 600] },
  { label: 'Avatar', widths: [256, 96, 48] },
  { label: 'Original', widths: [] },
];

const KEY_TEMPLATES = [
  '{hash}/{name}-{label}.{ext}',
  '{format}/{name}-{width}w.{ext}',
  '{name}/{label}.{ext}',
];

/** What the playground is currently working on. */
interface Source {
  readonly name: string;
  readonly bytes: number;
  readonly url: string;
  readonly bitmap: ImageBitmap;
  readonly meta: ImageMetadata;
  readonly hash: string;
  /** True when we created the object URL and therefore owe a revoke. */
  readonly owned: boolean;
}

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

/**
 * A live compression playground.
 *
 * Two halves, and they are honest about being different things:
 *
 * - The **encoding** is real, but it is the *browser's* encoder via
 *   `canvas.toBlob`, not sharp. The bytes are measured; they are not the bytes
 *   your server would produce.
 * - The **planning** (labels, storage keys, the srcset) runs the actual
 *   `@lens-image/core/browser` functions the server runs, so those are exact.
 */
export function Playground() {
  const [source, setSource] = useState<Source | null>(null);
  const [available, setAvailable] = useState<BrowserFormat[]>([]);
  const [format, setFormat] = useState<BrowserFormat>('webp');
  const [quality, setQuality] = useState(72);
  const [presetIndex, setPresetIndex] = useState(0);
  const [keyTemplate, setKeyTemplate] = useState(KEY_TEMPLATES[0]!);
  const [prefix, setPrefix] = useState('');

  const [encoded, setEncoded] = useState<EncodedVariant[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState(0);
  const [dragging, setDragging] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);
  const ownedUrls = useRef<string[]>([]);
  /** The encoded set whose object URLs are currently alive. */
  const live = useRef<EncodedVariant[]>([]);
  const run = useRef(0);

  const preset = WIDTH_PRESETS[presetIndex]!;

  /* --- loading a source ------------------------------------------------- */

  const adopt = useCallback(async (file: File | string, name?: string) => {
    setError(null);
    try {
      const blob = typeof file === 'string' ? await (await fetch(file)).blob() : file;
      const bitmap = await loadBitmap(blob);
      const asFile =
        blob instanceof File ? blob : new File([blob], name ?? 'sample.jpg', { type: blob.type });

      const { meta, hash } = await readHeader(asFile);
      const url = URL.createObjectURL(blob);
      ownedUrls.current.push(url);

      setSource((previous) => {
        previous?.bitmap.close?.();
        return {
          name: name ?? asFile.name,
          bytes: blob.size,
          url,
          bitmap,
          meta,
          hash,
          owned: true,
        };
      });
      setFocus(0);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Could not read that image, ${cause.message}`
          : 'Could not read that image.',
      );
    }
  }, []);

  // Load the first sample so the page is never an empty form.
  useEffect(() => {
    setAvailable(detectFormats());
    const first = SAMPLE_IMAGES[0];
    if (first) void adopt(first.src, `${first.name.toLowerCase()}.jpg`);
  }, [adopt]);

  // Object URLs and bitmaps are both manual-release resources.
  useEffect(
    () => () => {
      for (const url of ownedUrls.current) URL.revokeObjectURL(url);
      ownedUrls.current = [];
    },
    [],
  );

  /* --- encoding ---------------------------------------------------------- */

  useEffect(() => {
    if (!source) return;
    if (available.length > 0 && !available.includes(format)) return;

    const id = ++run.current;
    const controller = new AbortController();

    // Debounced, because the quality slider fires on every pixel of travel and
    // each change is four full canvas encodes.
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const widths = preset.widths.length > 0 ? preset.widths : [source.bitmap.width];
        const next = await encodeAll(
          source.bitmap,
          widths.map((width) => ({ width, format, quality })),
          controller.signal,
        );

        // A slower earlier run must not overwrite a newer one.
        if (id !== run.current) {
          revoke(next);
          return;
        }
        // Swap, then release the set that was just replaced.
        //
        // Not in the state updater (StrictMode runs those twice) and not in an
        // effect cleanup keyed on `encoded` (StrictMode mounts, unmounts and
        // remounts every effect, so that cleanup fires while the URLs are
        // still on screen and the "after" pane goes blank). An explicit
        // hand-off here is the only version that survives both.
        const previous = live.current;
        live.current = next;
        setEncoded(next);
        revoke(previous);
        setError(null);
      } catch (cause) {
        if (id === run.current) {
          setError(
            cause instanceof Error ? cause.message : `This browser cannot encode ${format}.`,
          );
        }
      } finally {
        if (id === run.current) setBusy(false);
      }
    }, 160);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [source, format, quality, preset, available]);

  // Unmount only; replacements are released at the hand-off above.
  useEffect(() => () => revoke(live.current), []);

  /* --- derived ----------------------------------------------------------- */

  const largest = encoded[0];
  const shown = encoded[Math.min(focus, Math.max(encoded.length - 1, 0))] ?? largest;

  const totalBytes = encoded.reduce((sum, v) => sum + v.size, 0);
  const savings =
    source && largest ? Math.max(0, 1 - largest.size / source.bytes) : 0;
  const savingsShown = useCountUp(savings * 100, Boolean(largest));

  const planInput: PlanInput = useMemo(
    () => ({
      formats: [format === 'jpeg' ? 'jpg' : format],
      widths: preset.widths,
      quality,
      keyTemplate,
      prefix,
      thumbnail: false,
      maxBytes: 25 * 1024 * 1024,
    }),
    [format, preset, quality, keyTemplate, prefix],
  );

  const planned = useMemo(
    () =>
      source ? plan(planInput, source.meta, source.name, source.hash) : null,
    [planInput, source],
  );

  const snippet = useMemo(() => {
    const sizes =
      preset.widths.length > 0
        ? `  sizes: [${preset.widths.map((w) => `{ width: ${w} }`).join(', ')}],\n`
        : '';
    return (
      `await optimizer.optimize({\n` +
      `  source: './${source?.name ?? 'photo.jpg'}',\n` +
      `  formats: ['${format === 'jpeg' ? 'jpg' : format}'],\n` +
      `  quality: ${quality},\n` +
      sizes +
      (prefix ? `  prefix: '${prefix}',\n` : '') +
      (keyTemplate !== KEY_TEMPLATES[0] ? `  key: '${keyTemplate}',\n` : '') +
      `});`
    );
  }, [source, format, quality, preset, prefix, keyTemplate]);

  /* --- render ------------------------------------------------------------ */

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* ---- controls --------------------------------------------------- */}
      <div className="flex w-full shrink-0 flex-col gap-5 lg:w-64">
        <div>
          <p className="label mb-1.5">Try one</p>
          <div className="grid grid-cols-3 gap-1.5">
            {SAMPLE_IMAGES.map((sample) => {
              const active = source?.name.startsWith(sample.name.toLowerCase());
              return (
                <button
                  key={sample.name}
                  type="button"
                  onClick={() => void adopt(sample.src, `${sample.name.toLowerCase()}.jpg`)}
                  aria-pressed={active}
                  className={`group relative aspect-[4/3] overflow-hidden rounded-md border transition-colors ${
                    active ? 'border-accent' : 'border-line hover:border-line-strong'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={sample.src}
                    alt={sample.alt}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1 pt-4 text-left text-2xs text-white">
                    {formatBytes(sample.bytes)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div
          onDragEnter={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) void adopt(file);
          }}
          className={`flex flex-col items-center gap-2 rounded-lg border border-dashed p-4 text-center transition-colors ${
            dragging ? 'border-accent bg-accent/5' : 'border-line bg-surface'
          }`}
        >
          <Upload
            className={`h-4 w-4 transition-transform ${dragging ? 'scale-125 text-accent' : 'text-subtle'}`}
          />
          <p className="text-sm text-muted">Or drop your own</p>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="btn btn-secondary"
          >
            Choose a file
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void adopt(file);
              e.target.value = '';
            }}
          />
          <p className="text-2xs text-subtle">
            Never uploaded. Encoded in this tab and thrown away.
          </p>
        </div>

        <Field label="Format">
          <div className="flex flex-wrap gap-1.5">
            {FORMATS.map((entry) => {
              const supported = available.length === 0 || available.includes(entry.id);
              const on = format === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  disabled={!supported}
                  aria-pressed={on}
                  onClick={() => setFormat(entry.id)}
                  title={supported ? undefined : 'Your browser cannot encode this format'}
                  className={`rounded-md border px-2.5 py-1 font-mono text-xs transition-colors ${
                    on
                      ? 'border-accent/40 bg-accent/10 text-accent-bright'
                      : supported
                        ? 'border-line bg-surface text-muted hover:text-foreground'
                        : 'cursor-not-allowed border-line/60 bg-surface text-subtle/50 line-through'
                  }`}
                >
                  {entry.label}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label={`Quality, ${quality}`}>
          <input
            type="range"
            min={10}
            max={100}
            value={quality}
            disabled={format === 'png'}
            onChange={(e) => setQuality(Number(e.target.value))}
            className="w-full accent-[var(--accent)] disabled:opacity-40"
          />
          <p className="mt-1.5 text-2xs text-subtle">
            {format === 'png' ? 'PNG is lossless, quality does nothing.' : 'Drag it and watch the bytes move.'}
          </p>
        </Field>

        <Field label="Sizes">
          <div className="flex flex-wrap gap-1.5">
            {WIDTH_PRESETS.map((entry, index) => (
              <button
                key={entry.label}
                type="button"
                aria-pressed={index === presetIndex}
                onClick={() => {
                  setPresetIndex(index);
                  setFocus(0);
                }}
                className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                  index === presetIndex
                    ? 'border-accent/40 bg-accent/10 text-accent-bright'
                    : 'border-line bg-surface text-muted hover:text-foreground'
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Key template">
          <select
            value={keyTemplate}
            onChange={(e) => setKeyTemplate(e.target.value)}
            className="w-full rounded-md border border-line bg-surface px-2 py-1.5 font-mono text-xs text-foreground"
          >
            {KEY_TEMPLATES.map((template) => (
              <option key={template} value={template}>
                {template}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Prefix">
          <input
            type="text"
            value={prefix}
            placeholder="products"
            onChange={(e) => setPrefix(e.target.value)}
            className="w-full rounded-md border border-line bg-surface px-2 py-1.5 font-mono text-xs text-foreground placeholder:text-subtle"
          />
        </Field>
      </div>

      {/* ---- output ------------------------------------------------------ */}
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        {error ? (
          <div className="rounded-lg border border-danger/40 bg-danger/5 p-4 text-sm text-muted">
            {error}
          </div>
        ) : null}

        <Comparison source={source} variant={shown} busy={busy} />

        <Savings
          source={source}
          largest={largest}
          percent={savingsShown}
          totalBytes={totalBytes}
          count={encoded.length}
        />

        <Ladder
          encoded={encoded}
          focus={focus}
          onFocus={setFocus}
          sourceBytes={source?.bytes ?? 0}
        />

        {planned && planned.variants.length > 0 ? <Keys planned={planned} /> : null}

        <div>
          <p className="label mb-2">The call that produces this</p>
          <CodeBlock code={snippet} language="ts" />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="label mb-1.5">{label}</p>
      {children}
    </div>
  );
}

/**
 * The before/after viewer.
 *
 * The frame is a fixed height and the images are `object-cover` inside it. It
 * used to take its aspect ratio from the source, so switching from a landscape
 * sample to a portrait one nearly doubled the height and shoved the rest of the
 * page down. Every source now lands in exactly the same box.
 */
function Comparison({
  source,
  variant,
  busy,
}: {
  source: Source | null;
  variant: EncodedVariant | undefined;
  busy: boolean;
}) {
  const [divider, setDivider] = useState(52);
  const [dragging, setDragging] = useState(false);

  if (!source) {
    return (
      <div className="grid h-[clamp(300px,44vh,520px)] place-items-center rounded-lg border border-line bg-surface text-sm text-muted">
        Loading a sample...
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <p className="label">Drag to compare, double-click to centre</p>

        <span
          className={`font-mono text-2xs text-accent-bright transition-opacity ${
            busy ? 'opacity-100' : 'opacity-0'
          }`}
          aria-live="polite"
        >
          encoding...
        </span>
      </div>

      <CompareSlider
        value={divider}
        onValueChange={setDivider}
        className="h-[clamp(300px,44vh,520px)] rounded-lg border border-line bg-surface"
        onPointerDown={() => setDragging(true)}
        onPointerUp={() => setDragging(false)}
        onPointerLeave={() => setDragging(false)}
        onDoubleClick={() => setDivider(50)}
      >
        {/* Right of the divider: the untouched source. */}
        <CompareSliderBefore>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={source.url} alt="" className="h-full w-full object-cover" />
          <CompareSliderLabel side="after">
            original, {formatBytes(source.bytes)}
          </CompareSliderLabel>
        </CompareSliderBefore>

        {/* Left of the divider: what the encoder just produced. */}
        <CompareSliderAfter>
          {variant ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={variant.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-raised" />
          )}
          {variant ? (
            <CompareSliderLabel side="before" className="border-accent/40 text-accent-bright">
              {variant.format} q{variant.quality}, {formatBytes(variant.size)}
            </CompareSliderLabel>
          ) : null}
        </CompareSliderAfter>

        <CompareSliderHandle>
          <div
            className={`absolute left-1/2 h-full w-0.5 -translate-x-1/2 bg-white transition-shadow ${
              dragging ? 'shadow-[0_0_14px_2px_rgb(255_255_255/0.45)]' : ''
            }`}
          />
          <div
            className={`z-30 grid size-10 place-items-center rounded-full border border-white/25 bg-black/70 text-white backdrop-blur-sm transition-transform ${
              dragging ? 'scale-110' : ''
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              width={15}
              height={15}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 6 3 12l6 6M15 6l6 6-6 6" />
            </svg>
          </div>

          {/* Live read-out, so the drag reports something. */}
          <span
            className={`pointer-events-none absolute top-[calc(50%+2rem)] rounded bg-black/70 px-1.5 py-0.5 font-mono text-2xs tabular-nums text-white transition-opacity ${
              dragging ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {Math.round(divider)}%
          </span>
        </CompareSliderHandle>
      </CompareSlider>

      <p className="mt-2 text-2xs text-subtle">
        Encoded by <strong className="font-medium text-muted">your browser</strong>, not by
        sharp, so the shape of the curve is the same but the exact bytes are not. Arrow
        keys nudge the divider; hold shift for bigger steps.
      </p>
    </div>
  );
}


/** The headline number. */
function Savings({
  source,
  largest,
  percent,
  totalBytes,
  count,
}: {
  source: Source | null;
  largest: EncodedVariant | undefined;
  percent: number;
  totalBytes: number;
  count: number;
}) {
  if (!source || !largest) return null;

  const big = percent >= 80;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-line bg-surface p-4">
      <div>
        <p
          className={`font-mono text-3xl tabular-nums transition-colors ${
            big ? 'text-signal' : 'text-foreground'
          }`}
        >
          {percent.toFixed(0)}
          <span className="text-xl text-muted">%</span>
        </p>
        <p className="label mt-0.5">smaller</p>
      </div>

      <div className="h-10 w-px bg-line" aria-hidden />

      <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <Stat label="original" value={formatBytes(source.bytes)} />
        <Stat label="largest output" value={formatBytes(largest.size)} />
        <Stat label={`all ${count} file${count === 1 ? '' : 's'}`} value={formatBytes(totalBytes)} />
        <Stat label="encode time" value={`${largest.durationMs}ms`} />
      </dl>
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
  if (encoded.length === 0) return null;
  const widest = Math.max(...encoded.map((v) => v.width));

  return (
    <div>
      <p className="label mb-2">Every file it would write, hover to preview</p>
      <div className="flex flex-col gap-1.5">
        {encoded.map((variant, index) => {
          const share = sourceBytes > 0 ? variant.size / sourceBytes : 0;
          return (
            <button
              key={`${variant.width}-${variant.format}`}
              type="button"
              onMouseEnter={() => onFocus(index)}
              onFocus={() => onFocus(index)}
              onClick={() => onFocus(index)}
              className={`group flex items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors ${
                index === focus
                  ? 'border-accent/40 bg-accent/5'
                  : 'border-line bg-surface hover:border-line-strong'
              }`}
            >
              <span className="w-24 shrink-0 font-mono text-xs tabular-nums text-secondary">
                {variant.width}×{variant.height}
              </span>

              {/* Bar length is the real pixel width, so the ladder is to scale. */}
              <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-accent/70 transition-[width] duration-300"
                  style={{ width: `${(variant.width / widest) * 100}%` }}
                />
              </span>

              <span className="w-20 shrink-0 text-right font-mono text-xs tabular-nums text-foreground">
                {formatBytes(variant.size)}
              </span>
              <span className="w-12 shrink-0 text-right font-mono text-2xs tabular-nums text-subtle">
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
function Keys({ planned }: { planned: NonNullable<ReturnType<typeof plan>> }) {
  const srcsets = Object.entries(planned.srcsets).filter(([, v]) => v.length > 0);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="label mb-2">Storage keys</p>
        <ul className="flex flex-col gap-1">
          {planned.variants.map((variant) => (
            <li
              key={variant.key}
              className="rounded-md border border-line bg-surface px-3 py-1.5 font-mono text-xs text-muted"
            >
              <span className="break-all">{variant.key}</span>
            </li>
          ))}
        </ul>
      </div>

      {srcsets.map(([format, srcset]) => (
        <div key={format}>
          <p className="label mb-2">srcset</p>
          <div className="group flex items-start gap-2 rounded-lg border border-line bg-surface p-3">
            <code className="min-w-0 flex-1 break-all font-mono text-xs text-muted">
              {srcset}
            </code>
            <div className="shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <CopyButton value={srcset} />
            </div>
          </div>
        </div>
      ))}

      <p className="text-2xs text-subtle">
        These come from <code className="font-mono">@lens-image/core/browser</code>, the
        same <code className="font-mono">buildKey</code> and{' '}
        <code className="font-mono">defaultLabel</code> the server calls. Exact, not
        approximated.
      </p>
    </div>
  );
}
