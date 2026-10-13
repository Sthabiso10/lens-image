'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LensError, validateImage } from '@lens-image/core/browser';
import {
  detectFormats,
  encodeAll,
  loadBitmap,
  revoke,
  type BrowserFormat,
  type EncodedVariant,
} from '@/lib/encode';
import { SAMPLE_IMAGES } from '@/lib/sample-images';
import { plan, readHeader, uniqueWidths, type PlanInput } from '@/lib/plan';
import { CompressionPanel, FormatPanel, OutputPanel } from './playground/ControlPanels';
import { Preview } from './playground/Preview';
import { Keys, Results, Snippet } from './playground/Results';
import { SourcePanel } from './playground/SourcePanel';
import { useStatusLog } from './playground/Status';
import {
  FORMAT_NAME,
  KEY_TEMPLATES,
  MAX_BYTES,
  POLICY,
  WIDTH_PRESETS,
  type Source,
} from './playground/config';

/** One shared empty list, so "nothing encoded yet" keeps a stable identity. */
const NONE: readonly EncodedVariant[] = [];

/**
 * A live compression studio.
 *
 * Two halves, and they are honest about being different things:
 *
 * - The **encoding** is real, but it is the *browser's* encoder via
 *   `canvas.toBlob`, not sharp. The bytes are measured; they are not the bytes
 *   your server would produce.
 * - The **planning** (labels, storage keys, the srcset) runs the actual
 *   `@lens-image/core/browser` functions the server runs, so those are exact.
 *
 * ### Where the pieces live
 *
 * This file owns the state and the two effects that matter (loading a source,
 * and re-encoding when a control moves). Everything visual is under
 * `components/playground/`: a rail of control panels on the left, a preview and
 * the results on the right. Nothing in this tab talks to a server: the one
 * `fetch` is the same-origin request for a bundled sample, and every other byte
 * is decoded, encoded and measured locally.
 *
 * Below `lg` the layout is one column in DOM order: controls, then preview,
 * then results.
 */
export function Playground() {
  const [source, setSource] = useState<Source | null>(null);
  const [available, setAvailable] = useState<BrowserFormat[]>([]);
  const [format, setFormat] = useState<BrowserFormat>('webp');
  const [quality, setQuality] = useState(72);
  const [presetIndex, setPresetIndex] = useState(0);
  const [keyTemplate, setKeyTemplate] = useState(KEY_TEMPLATES[0]!);
  const [prefix, setPrefix] = useState('');

  /**
   * The newest finished encode, tagged with the source it was made from.
   *
   * Loading a new source does not clear this: the encode for it is still to
   * come, and for that gap the old variants would sit next to the new source,
   * so the preview, the labels and the savings would each mix two images. The
   * tag lets the render below ignore a set that belongs to a different source
   * without any effect having to remember to wipe it first.
   */
  const [encodedSet, setEncodedSet] = useState<{
    sourceUrl: string | null;
    variants: EncodedVariant[];
  }>({ sourceUrl: null, variants: [] });
  /** True once detection has found that this browser can encode nothing. */
  const [noEncoder, setNoEncoder] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState(0);

  const { lines: statusLines, restart, append, beginEncode, patch } = useStatusLog();

  /** The encoded set whose object URLs are currently alive. */
  const live = useRef<EncodedVariant[]>([]);
  const run = useRef(0);
  /**
   * Bumped by every load, and once more on unmount. A load compares the value
   * it started with after each `await` and bows out if it has been overtaken,
   * so the last click wins rather than the slowest.
   */
  const loadToken = useRef(0);

  const preset = WIDTH_PRESETS[presetIndex]!;

  /* --- loading a source ------------------------------------------------- */

  const adopt = useCallback(
    async (file: File | string, name?: string, sample: string | null = null) => {
      const token = ++loadToken.current;
      const superseded = () => token !== loadToken.current;

      setError(null);
      // Each stage patches the line it wrote, never "the newest line", so an
      // overtaken load cannot scribble on the log of the one that replaced it.
      let line = restart('Reading header…', 'source');
      try {
        const blob = typeof file === 'string' ? await (await fetch(file)).blob() : file;
        if (superseded()) return;
        const asFile =
          blob instanceof File ? blob : new File([blob], name ?? 'sample.jpg', { type: blob.type });

        // Read the header and apply the library's limits *before* decoding.
        // A small PNG can declare 40,000 x 40,000 pixels and expand to gigabytes
        // once decoded, which would crash this tab. The header costs 4 KB to read
        // and says so up front, which is exactly what the server does too.
        const { meta, hash } = await readHeader(asFile);
        if (superseded()) return;
        if (POLICY) validateImage(meta, POLICY, asFile.name);
        patch(
          line,
          `Header read, ${meta.format.toUpperCase()} ${meta.width}×${meta.height}`,
          'done',
        );

        line = append('Decoding…', 'source');
        const bitmap = await loadBitmap(blob);
        // The one resource a late load is holding at this point. Its object URL
        // is created below, in the same synchronous run that publishes it, so
        // there is never one to revoke here.
        if (superseded()) {
          bitmap.close?.();
          return;
        }
        patch(line, 'Decoded', 'done');

        setSource({
          name: name ?? asFile.name,
          bytes: blob.size,
          url: URL.createObjectURL(blob),
          bitmap,
          meta,
          hash,
          owned: true,
          sample,
        });
        setFocus(0);
      } catch (cause) {
        if (superseded()) return;
        const message =
          // A LensError is the library explaining a rule the file broke; show it
          // as written. Anything else is the browser failing to read the file.
          LensError.is(cause)
            ? cause.message
            : cause instanceof Error
              ? `Could not read that image, ${cause.message}`
              : 'Could not read that image.';
        setError(message);
        patch(line, 'Could not load that image', 'error');
      }
    },
    [restart, append, patch],
  );

  // Load the first sample so the page is never an empty form.
  useEffect(() => {
    const detected = detectFormats();
    setAvailable(detected);
    // The default is WebP, which a browser may not be able to encode. Move to
    // the first format it can, or the page would sit there doing nothing.
    setFormat((current) => (detected.includes(current) ? current : (detected[0] ?? current)));
    setNoEncoder(detected.length === 0);

    const first = SAMPLE_IMAGES[0];
    if (first) void adopt(first.src, `${first.name.toLowerCase()}.jpg`, first.name);
  }, [adopt]);

  // A load still in flight when the page goes away must not publish anything.
  useEffect(
    () => () => {
      loadToken.current++;
    },
    [],
  );

  // Object URLs and bitmaps are both manual-release resources. This releases
  // the *source's* when it is replaced and when the page unmounts, along with
  // the encoded set that was made from it.
  //
  // Keyed on `source`, which only changes when a load completes, so unlike a
  // cleanup keyed on `encoded` it is not fighting StrictMode's mount/unmount/
  // remount (see the hand-off below). It runs after the commit that swaps the
  // source, so the old image is already off screen when its bitmap is closed,
  // and the abort in the encode effect's cleanup has already fired.
  useEffect(() => {
    if (!source) return;
    return () => {
      source.bitmap.close?.();
      URL.revokeObjectURL(source.url);
      revoke(live.current);
      live.current = [];
    };
  }, [source]);

  /* --- encoding ---------------------------------------------------------- */

  useEffect(() => {
    if (!source || noEncoder) return;
    if (available.length > 0 && !available.includes(format)) return;

    const id = ++run.current;
    const controller = new AbortController();
    const name = FORMAT_NAME[format];

    // Debounced, because the quality slider fires on every pixel of travel and
    // each change is four full canvas encodes.
    const timer = setTimeout(async () => {
      setBusy(true);
      const started = performance.now();
      const line = beginEncode(`Encoding ${name}…`);
      try {
        // Clamped to the source and de-duplicated first: against a 1000px
        // image, 1600w and 1200w would both come out 1000 wide, and the real
        // library refuses two sizes with the same label.
        const widths = uniqueWidths(preset.widths, source.bitmap.width);
        const next = await encodeAll(
          source.bitmap,
          widths.map((width) => ({ width, format, quality })),
          controller.signal,
          // The status line names the variant the encoder is on right now,
          // reported by the encoder itself as each one starts.
          (index, total, job) => {
            if (id !== run.current || total < 2) return;
            patch(line, `Encoding ${name} · ${index + 1} of ${total} (${job.width ?? '?'}w)…`);
          },
        );

        // A slower earlier run must not overwrite a newer one. The same goes
        // for one that outlived its source: its widths and bytes describe an
        // image that is no longer on screen.
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
        setEncodedSet({ sourceUrl: source.url, variants: next });
        revoke(previous);
        setError(null);
        patch(
          line,
          `Done in ${Math.round(performance.now() - started)} ms · ${next.length} file${
            next.length === 1 ? '' : 's'
          }`,
          'final',
        );
      } catch (cause) {
        if (id === run.current) {
          const message =
            cause instanceof Error ? cause.message : `This browser cannot encode ${format}.`;
          setError(message);
          patch(line, `Failed: ${message}`, 'error');
        }
      } finally {
        if (id === run.current) setBusy(false);
      }
    }, 160);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [source, format, quality, preset, available, noEncoder, beginEncode, patch]);

  /* --- derived ----------------------------------------------------------- */

  // Only a set made from the source on screen is shown; see `encodedSet`.
  const encoded = source && encodedSet.sourceUrl === source.url ? encodedSet.variants : NONE;
  const largest = encoded[0];
  const shown = encoded[Math.min(focus, Math.max(encoded.length - 1, 0))] ?? largest;

  const planInput: PlanInput = useMemo(
    () => ({
      formats: [format === 'jpeg' ? 'jpg' : format],
      widths: preset.widths,
      quality,
      keyTemplate,
      prefix,
      thumbnail: false,
      maxBytes: MAX_BYTES,
    }),
    [format, preset, quality, keyTemplate, prefix],
  );

  const planned = useMemo(
    () => (source ? plan(planInput, source.meta, source.name, source.hash) : null),
    [planInput, source],
  );

  const snippet = useMemo(() => {
    // The widths that would really be produced, not the ones asked for: the
    // library never upscales, so the preset's larger sizes collapse to the
    // source's width and would otherwise appear here as sizes it rejects.
    const widths = source ? uniqueWidths(preset.widths, source.meta.width) : preset.widths;
    const sizes =
      preset.widths.length > 0
        ? `  sizes: [${widths.map((w) => `{ width: ${w} }`).join(', ')}],\n`
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

  const shownError = noEncoder
    ? 'This browser cannot encode WebP, AVIF, JPEG or PNG, so the playground has nothing to measure. Try a current Chrome, Edge, Firefox or Safari.'
    : error;

  /* --- render ------------------------------------------------------------ */

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[23rem_minmax(0,1fr)] lg:items-start">
      {/* ---- controls rail --------------------------------------------- */}
      <div className="flex min-w-0 flex-col gap-4">
        <SourcePanel
          source={source}
          onSample={(src, name, sample) => void adopt(src, name, sample)}
          onFile={(file) => void adopt(file)}
        />
        <FormatPanel format={format} available={available} onChange={setFormat} />
        <CompressionPanel
          format={format}
          quality={quality}
          onQuality={setQuality}
          presetIndex={presetIndex}
          onPreset={(index) => {
            setPresetIndex(index);
            setFocus(0);
          }}
        />
        <OutputPanel
          keyTemplate={keyTemplate}
          onKeyTemplate={setKeyTemplate}
          prefix={prefix}
          onPrefix={setPrefix}
        />
      </div>

      {/* ---- preview and results --------------------------------------- */}
      <div className="flex min-w-0 flex-col gap-4">
        {shownError ? (
          <div
            role="alert"
            className="rounded-xl border border-danger/40 bg-danger/5 p-4 text-sm text-secondary"
          >
            {shownError}
          </div>
        ) : null}

        <Preview source={source} variant={shown} busy={busy} status={statusLines} />

        <Results source={source} encoded={encoded} focus={focus} onFocus={setFocus} />

        {planned && planned.variants.length > 0 ? <Keys planned={planned} /> : null}

        <Snippet code={snippet} />
      </div>
    </div>
  );
}
