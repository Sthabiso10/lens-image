'use client';

import { useEffect, useRef, useState } from 'react';
import { formatBytes } from '@lens-image/core/browser';
import {
  CompareSlider,
  CompareSliderAfter,
  CompareSliderBefore,
  CompareSliderGrip,
  CompareSliderHandle,
  CompareSliderLabel,
  isSliderKey,
} from '../ui/compare-slider';
import type { EncodedVariant } from '@/lib/encode';
import { Panel } from './Panel';
import { StatusLog, type StatusLine } from './Status';
import { FORMAT_NAME, type Source } from './config';

/** Every source lands in exactly this box, whatever its aspect ratio. */
const STAGE_HEIGHT = 'h-[clamp(300px,50vh,560px)]';

/**
 * The PREVIEW panel: the before/after viewer on a dot-grid canvas, with the
 * status log underneath.
 *
 * The stage is a fixed height and the images are `object-cover` inside it. It
 * used to take its aspect ratio from the source, so switching from a landscape
 * sample to a portrait one nearly doubled the height and shoved the rest of the
 * page down. Every source now lands in exactly the same box.
 */
export function Preview({
  source,
  variant,
  busy,
  status,
}: {
  source: Source | null;
  variant: EncodedVariant | undefined;
  busy: boolean;
  status: readonly StatusLine[];
}) {
  return (
    <Panel title="Preview" tag="Preview" flush>
      <div className="dot-grid bg-background p-3 sm:p-5">
        {source ? (
          <Comparison source={source} variant={variant} busy={busy} />
        ) : (
          <div
            className={`relative grid ${STAGE_HEIGHT} place-items-center overflow-hidden rounded-lg border border-line bg-surface text-sm text-muted`}
          >
            <ScanBar active />
            <span className="animate-pulse">Loading a sample...</span>
          </div>
        )}
      </div>

      <div className="border-t border-line px-3.5 py-2.5">
        <p className="text-2xs text-muted">
          Drag to compare, double-click to centre. Arrow keys nudge the divider; hold shift
          for bigger steps. Encoded by{' '}
          <strong className="font-medium text-secondary">your browser</strong>, not by sharp,
          so the shape of the curve is the same but the exact bytes are not.
        </p>
      </div>

      <StatusLog lines={status} />
    </Panel>
  );
}

function Comparison({
  source,
  variant,
  busy,
}: {
  source: Source;
  variant: EncodedVariant | undefined;
  busy: boolean;
}) {
  const [divider, setDivider] = useState(52);
  const [dragging, setDragging] = useState(false);
  const revealed = useRef<string | null>(null);
  const sweep = useRef(0);

  // A new source arrives fully "original", then the encoded version wipes in
  // from the left and comes to rest where the divider normally sits. It shows
  // what the slider does before anyone has to be told, and it waits for the
  // first encode so there is something on the other side to reveal.
  useEffect(() => {
    if (!variant || revealed.current === source.url) return;
    revealed.current = source.url;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setDivider(52);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1300);
      // easeOutExpo, matching the rest of the site's arrivals.
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setDivider(52 * eased);
      if (t < 1) sweep.current = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(sweep.current);
    setDivider(0);
    sweep.current = requestAnimationFrame(tick);
  }, [source, variant]);

  useEffect(() => () => cancelAnimationFrame(sweep.current), []);

  // Grabbing the handle mid-sweep hands control straight to the pointer, and
  // pressing a key the slider acts on hands it to the keyboard. Tab, Shift and
  // the rest are not steering: tabbing past must not cut the intro short.
  const interrupt = () => cancelAnimationFrame(sweep.current);

  return (
    <CompareSlider
      value={divider}
      onValueChange={setDivider}
      aria-label="Compare the original with the compressed image"
      aria-valuetext={`${Math.round(divider)}% compressed shown, the rest original`}
      className={`${STAGE_HEIGHT} rounded-lg border border-line bg-surface`}
      onPointerDown={() => {
        interrupt();
        setDragging(true);
      }}
      onKeyDown={(event) => {
        if (isSliderKey(event.key)) interrupt();
      }}
      onPointerUp={() => setDragging(false)}
      onPointerLeave={() => setDragging(false)}
      onDoubleClick={() => setDivider(50)}
    >
      <ScanBar active={busy} />

      {/* Right of the divider: the untouched source. */}
      <CompareSliderBefore>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={source.url}
          src={source.url}
          alt=""
          className="h-full w-full animate-fade-in object-cover"
        />
        {/* Drops to the bottom corner on a phone, where the two labels would collide. */}
        <CompareSliderLabel side="after" className="max-sm:bottom-2 max-sm:top-auto">
          ORIGINAL <span className="text-muted">·</span>{' '}
          <span className="tabular-nums">{formatBytes(source.bytes)}</span>
        </CompareSliderLabel>
      </CompareSliderBefore>

      {/* Left of the divider: what the encoder just produced. */}
      <CompareSliderAfter>
        <div className="h-full w-full bg-raised">
          {variant ? <Crossfade src={variant.url} /> : null}
        </div>
        {variant ? (
          <CompareSliderLabel
            side="before"
            className={`border-accent/40 text-accent-bright transition-opacity duration-300 ${
              busy ? 'opacity-60' : 'opacity-100'
            }`}
          >
            LENS <span className="text-muted">·</span> {FORMAT_NAME[variant.format].toUpperCase()}
            {variant.format === 'png' ? '' : ` Q${variant.quality}`}{' '}
            <span className="text-muted">·</span>{' '}
            <span className="tabular-nums">{formatBytes(variant.size)}</span>
          </CompareSliderLabel>
        ) : null}
      </CompareSliderAfter>

      <CompareSliderHandle>
        <div
          className={`absolute left-1/2 h-full w-0.5 -translate-x-1/2 bg-white transition-shadow ${
            dragging ? 'shadow-[0_0_14px_2px_rgb(255_255_255/0.45)]' : ''
          }`}
        />
        <CompareSliderGrip dragging={dragging} />

        {/* Live read-out, so the drag reports something. */}
        <span
          className={`pointer-events-none absolute top-[calc(50%+1.5rem)] rounded bg-black/70 px-1.5 py-0.5 font-mono text-2xs tabular-nums text-white transition-opacity ${
            dragging ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {Math.round(divider)}%
        </span>
      </CompareSliderHandle>
    </CompareSlider>
  );
}

/**
 * Holds the previous encode on screen until the next one has decoded, then
 * fades the new one in over it.
 *
 * Dragging the quality slider replaces this image several times a second.
 * Swapping `src` in place blanks the pane for a frame while the new file
 * decodes, which reads as flicker; this reads as the picture changing.
 */
function Crossfade({ src }: { src: string }) {
  const [layers, setLayers] = useState<{ src: string; ready: boolean }[]>([
    { src, ready: false },
  ]);

  useEffect(() => {
    setLayers((current) =>
      current[current.length - 1]?.src === src
        ? current
        : [...current.filter((l) => l.ready).slice(-1), { src, ready: false }],
    );
  }, [src]);

  // Once the top layer has loaded and had time to fade in, drop what is under
  // it. A timer rather than `transitionend`: a blob that decodes before the
  // first paint never transitions, so that event would never come.
  const settled = layers[layers.length - 1]?.ready && layers.length > 1;
  useEffect(() => {
    if (!settled) return;
    const timer = setTimeout(() => setLayers((current) => current.slice(-1)), 350);
    return () => clearTimeout(timer);
  }, [settled]);

  return (
    <div className="relative h-full w-full">
      {layers.map((layer, index) => {
        const top = index === layers.length - 1;
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={layer.src}
            src={layer.src}
            alt=""
            onLoad={() =>
              setLayers((current) =>
                current.map((l) => (l.src === layer.src ? { ...l, ready: true } : l)),
              )
            }
            className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ease-out"
            style={{ opacity: layer.ready || !top ? 1 : 0 }}
          />
        );
      })}
    </div>
  );
}

/** A thin light crossing the top edge of a frame while work is in flight. */
function ScanBar({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-x-0 top-0 z-40 h-0.5 overflow-hidden transition-opacity duration-300 ${
        active ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="h-full w-1/2 animate-scan bg-gradient-to-r from-transparent via-accent-bright to-transparent" />
    </div>
  );
}
