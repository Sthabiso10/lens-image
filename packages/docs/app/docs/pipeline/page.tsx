import type { Metadata } from 'next';
import { CodeBlock } from '@/components/CodeBlock';
import { Callout, PageHeader, Prose } from '@/components/Prose';

export const metadata: Metadata = { title: 'The pipeline' };

const VALIDATE = `validate: {
  maxBytes: 25 * 1024 * 1024,     // default
  maxPixels: 100_000_000,         // default. The decompression-bomb guard
  allowedFormats: ['jpeg', 'png', 'webp', 'avif'],
  minWidth: 200,
}`;

const PLAN = `formats: ['avif', 'webp', 'jpg'],
sizes: [{ width: 1200 }, { width: 600 }, { width: 300 }],
thumbnail: true,

// → 3 formats x 3 sizes + 1 thumbnail = 10 planned variants`;

const DEGRADE = `const result = await optimizer.optimize({ source, formats: ['avif', 'webp'] });

result.formats.avif;   // undefined
result.formats.webp;   // still here
result.warnings;
// [{
//   code: 'format_unsupported',
//   format: 'avif',
//   message: 'The "sharp" engine cannot encode avif (common with prebuilt sharp
//             binaries that ship without AV1); falling back to jpeg if nothing
//             else succeeds.',
// }]`;

const KEYS = `key: '{hash}/{name}-{label}.{ext}'          // the default
key: '{format}/{width}x{height}.{ext}'      // 'webp/1200x800.webp'
key: (ctx) => \`users/\${userId}/\${ctx.hash}.\${ctx.ext}\``;

const CACHE = `new ImageOptimizer({ adapter, cache: 'storage' });`;

const ERRORS = `import { LensError } from '@lens-image/core';

try {
  await optimizer.optimize({ source, validate: { maxBytes: 5_000_000 } });
} catch (error) {
  if (LensError.is(error, 'VALIDATION_FAILED')) {
    return Response.json({ error: error.message }, { status: error.status });  // 422
  }
  if (LensError.is(error, 'UPLOAD_FAILED')) {
    logger.error({ adapter: error.details.adapter, key: error.details.key });
  }
  throw error;
}`;

const STAGES = [
  {
    n: '01',
    title: 'Read',
    body: 'A path, Buffer, URL, stream or { data, filename } becomes bytes plus a name. Streams are drained with the size limit applied as they go, so an oversized upload never fully lands in memory.',
  },
  {
    n: '02',
    title: 'Sniff',
    body: 'Format and dimensions are read from the file header in pure TypeScript. Not from the file extension, which a caller controls and an attacker can lie about.',
  },
  {
    n: '03',
    title: 'Validate',
    body: 'Size, pixel count, dimensions and format allowlist. All before a decoder ever sees the bytes.',
  },
  {
    n: '04',
    title: 'Plan',
    body: 'Formats x sizes, plus the thumbnail, expanded into a flat work list. Unsupported formats are dropped here with a warning rather than failing mid-run.',
  },
  {
    n: '05',
    title: 'Encode and store',
    body: 'Bounded concurrency, four at a time by default. Each variant is encoded, keyed, then uploaded with retries.',
  },
  {
    n: '06',
    title: 'Assemble',
    body: 'Variants grouped by format, srcsets built, savings computed, warnings collected.',
  },
];

export default function PipelinePage() {
  return (
    <>
      <PageHeader
        section="Concepts"
        title="The pipeline"
        lead="What happens between handing Lens an image and getting URLs back, and where each option takes effect."
      />

      <Prose>
        <p>
          Every <code>optimize()</code> call runs the same six stages. Knowing which stage
          an option belongs to is most of what you need to reason about the result.
        </p>

        <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line">
          {STAGES.map((stage) => (
            <div key={stage.n} className="flex gap-4 bg-surface p-4">
              <span className="font-mono text-xs text-subtle tabular-nums">{stage.n}</span>
              <div>
                <p className="text-sm font-medium text-foreground">{stage.title}</p>
                <p className="mt-1 text-sm text-muted">{stage.body}</p>
              </div>
            </div>
          ))}
        </div>

        <h2>Validation comes first, deliberately</h2>
        <p>
          The guard that matters most is <code>maxPixels</code>. A 40,000 × 40,000 PNG of
          flat colour compresses to a few hundred kilobytes and expands to roughly six
          gigabytes of RGBA in memory. A byte-size limit does not catch it; a pixel limit
          does.
        </p>
        <CodeBlock code={VALIDATE} language="ts" />
        <p>
          This is why Lens ships its own header parser rather than asking the codec. The
          check has to happen <em>before</em> the decoder allocates, and it has to work
          whether or not sharp is installed.
        </p>

        <Callout title="The same check runs in the browser">
          <code>@lens-image/core/browser</code> exports the sniffer and the validator with no{' '}
          <code>node:</code> imports, so you can reject a file from the first 4&nbsp;KB of
          it before the upload starts, with the identical error message the server would
          produce.
        </Callout>

        <h2>Planning</h2>
        <p>
          Formats and sizes multiply. Three formats at three widths is nine encodes, plus
          one more if you asked for a thumbnail.
        </p>
        <CodeBlock code={PLAN} language="ts" />
        <p>
          Order matters. It is preserved into <code>result.formats</code> and therefore
          into the <code>&lt;source&gt;</code> order of a <code>&lt;picture&gt;</code>,
          which is what makes progressive enhancement work: put the most modern format
          first and the most compatible last.
        </p>

        <h3>Quality is per-format</h3>
        <p>
          The scales are not comparable. AVIF at 80 is wastefully large for the same
          perceived result, so its default is 60 while JPEG&apos;s is 82 and WebP&apos;s is
          80. An explicit <code>quality</code> always wins over the defaults.
        </p>

        <h3>Never upscaling</h3>
        <p>
          A requested width larger than the source is clamped, so asking for{' '}
          <code>{'{ width: 4000 }'}</code> on a 2000px image gives you a 2000px file rather
          than a blurry 4000px one. Opt out per size with{' '}
          <code>withoutEnlargement: false</code>.
        </p>

        <h2>Graceful degradation</h2>
        <p>
          Formats are independent. A failure in one is a warning, not an exception
          because the alternative is a 500 on an upload that could have succeeded in two
          formats out of three.
        </p>
        <CodeBlock code={DEGRADE} language="ts" />
        <p>This is not hypothetical. Prebuilt sharp binaries do not all ship AV1.</p>
        <p>
          If <em>every</em> requested format fails, Lens retries the whole size ladder in{' '}
          <code>fallbackFormat</code> (JPEG by default). Only if that also fails does it
          throw <code>ALL_FORMATS_FAILED</code>. Set <code>fallbackFormat: null</code> to
          turn the safety net off.
        </p>

        <h2>Keys</h2>
        <p>
          The default template is <code>{'{hash}/{name}-{label}.{ext}'}</code>, content
          addressed, so identical bytes always produce an identical key and{' '}
          <code>Cache-Control: immutable</code> is safe by construction.
        </p>
        <CodeBlock code={KEYS} language="ts" />
        <p>
          An unknown token throws rather than interpolating <code>undefined</code> into a
          filename. Two sizes that resolve to the same label within one format also throw,
          because they would overwrite each other and you would be one file short without
          noticing.
        </p>

        <h2>Retries</h2>
        <p>
          Adapter writes are retried with exponential backoff and <em>full jitter</em>
          the delay is random between zero and the ceiling, not the ceiling itself. Fixed
          backoff makes every worker that failed on the same throttle retry at the same
          instant, reproducing the pile-up that caused it.
        </p>
        <p>
          Transient failures and 5xx are retried; 4xx never is, because a 403 from a bad
          IAM policy will still be a 403 in 800 milliseconds. Encoding is not retried at
          all. It is deterministic, so a second attempt burns CPU to reach the same error.
        </p>

        <h2>Caching</h2>
        <p>
          The expensive part is the encode, and the output is a pure function of (source
          bytes, options). So the cache key is a hash of both, and a hit skips encoding{' '}
          <em>and</em> uploading.
        </p>
        <CodeBlock code={CACHE} language="ts" />
        <table>
          <thead>
            <tr>
              <th>Mode</th>
              <th>Behaviour</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>false</code>
              </td>
              <td>Default. Always reprocess.</td>
            </tr>
            <tr>
              <td>
                <code>&apos;memory&apos;</code>
              </td>
              <td>Process-lifetime LRU. Fast, but a fresh deploy starts cold.</td>
            </tr>
            <tr>
              <td>
                <code>&apos;storage&apos;</code>
              </td>
              <td>
                Memory, plus <code>adapter.exists()</code> so a warm bucket short-circuits
                a cold process, and a stale hit is discarded if the object was deleted.
              </td>
            </tr>
            <tr>
              <td>
                <code>CacheStore</code>
              </td>
              <td>Your own Redis or SQLite, shared across instances.</td>
            </tr>
          </tbody>
        </table>
        <Callout title="Process-only results are never cached">
          Without an adapter, variants carry their encoded bytes. A 500-entry LRU holding
          multi-megabyte buffers is a memory leak wearing a performance feature&apos;s
          clothes, so those results are deliberately not stored.
        </Callout>

        <h2>Errors</h2>
        <p>
          Every failure is a <code>LensError</code> with a stable <code>code</code> and a
          suggested HTTP <code>status</code>, so route handlers do not have to map them.
        </p>
        <CodeBlock code={ERRORS} language="ts" />
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Status</th>
              <th>Means</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['INVALID_SOURCE', '400', 'source was not a shape Lens understands'],
              ['SOURCE_UNREADABLE', '400', 'The file could not be read'],
              ['UNSUPPORTED_INPUT', '415', 'Bytes are not a recognisable image'],
              ['VALIDATION_FAILED', '422', 'Failed a size, dimension or format rule'],
              ['INVALID_OPTIONS', '400', 'Contradictory or out-of-range options'],
              ['ENGINE_UNAVAILABLE', '500', 'No codec, usually sharp is not installed'],
              ['ENCODE_FAILED', '500', 'The codec threw'],
              ['ALL_FORMATS_FAILED', '500', 'Nothing could be produced, fallback included'],
              ['UPLOAD_FAILED', '502', 'Storage failed after retries'],
              ['ADAPTER_REQUIRED', '500', 'The operation needs an adapter'],
              ['ADAPTER_UNSUPPORTED', '501', 'The adapter lacks an optional method'],
              ['ADAPTER_MISCONFIGURED', '500', 'Bad adapter construction options'],
              ['ABORTED', '499', 'Your AbortSignal fired'],
            ].map(([code, status, means]) => (
              <tr key={code}>
                <td>
                  <code>{code}</code>
                </td>
                <td className="font-mono tabular-nums">{status}</td>
                <td>{means}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Safety defaults</h2>
        <p>On unless you turn them off, because getting them wrong is expensive:</p>
        <ul>
          <li>
            <strong>Decompression-bomb guard</strong> at 100 megapixels, checked from the
            header.
          </li>
          <li>
            <strong>Format sniffing, not extensions.</strong> A <code>.jpg</code> that is
            actually an SVG is detected as SVG.
          </li>
          <li>
            <strong>Path-traversal refusal</strong> in the filesystem adapter.
          </li>
          <li>
            <strong>Remote sources off.</strong> Fetching user-supplied URLs is an SSRF
            surface; opt in with <code>allowRemote</code>.
          </li>
          <li>
            <strong>Metadata stripped.</strong> EXIF carries GPS coordinates. Opt back in
            with <code>preserveMetadata</code>.
          </li>
          <li>
            <strong>EXIF orientation applied</strong> before resizing, so portrait phone
            photos are not resized against the wrong axis.
          </li>
        </ul>
      </Prose>
    </>
  );
}
