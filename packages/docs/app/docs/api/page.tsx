import type { Metadata } from 'next';
import { CodeBlock } from '@/components/CodeBlock';
import { Callout, PageHeader, Prose } from '@/components/Prose';

export const metadata: Metadata = { title: 'API reference' };

const CONSTRUCT = `const optimizer = new ImageOptimizer({
  adapter,
  engine,
  quality: 80,
  formats: ['webp'],
  sizes: [{ width: 1200 }],
  fallbackFormat: 'jpeg',
  key: '{hash}/{name}-{label}.{ext}',
  prefix: '',
  preserveMetadata: false,
  autoOrient: true,
  concurrency: 4,
  validate: { maxBytes: 25 * 1024 * 1024 },
  retry: { attempts: 3 },
  cache: false,
  cacheControl: 'public, max-age=31536000, immutable',
  allowRemote: false,
  onWarning: (warning) => logger.warn(warning),
});`;

const OPTIMIZE = `await optimizer.optimize({
  source: './photo.jpg',
  filename: 'hero.jpg',
  formats: ['avif', 'webp', 'jpg'],
  sizes: [{ width: 1200 }, { width: 600, fit: 'contain' }],
  thumbnail: { width: 128, format: 'webp' },
  metadata: { uploadedBy: 'user-42' },
  keepData: false,
  signal: controller.signal,
  force: false,
});`;

const RESULT_TYPE = `interface OptimizeResult {
  id: string;             // stable per (source, options), also the cache key
  runId: string;          // unique per call, for log correlation
  source: ImageMetadata & { filename: string; checksum: string };
  formats: { webp?: FormatResult; jpeg?: FormatResult; /* … */ };
  variants: Variant[];    // flat, in plan order
  thumbnail?: Variant;
  warnings: LensWarning[];
  totalSize: number;
  savings: number;        // 0-1, against the largest single output
  durationMs: number;
  cached: boolean;
  engine: string;
  adapter: string | null;
}`;

const FORMAT_RESULT = `interface FormatResult {
  format: ImageFormat;
  urls: Record<string, string>;   // { '600w': 'https://…', '1200w': 'https://…' }
  variants: Variant[];
  size: number;                   // total bytes across this format
  srcset: string;
  largest: Variant;
  smallest: Variant;
}`;

const ENGINES = `import { createSharpEngine, createPassthroughEngine, detectEngine } from '@lens-image/core';

new ImageOptimizer({
  engine: createSharpEngine({
    threads: 1,      // Lens already parallelises; 4 jobs x 4 libvips threads = 16
    cache: false,    // libvips' global cache leaks in a long-lived server
    pixelLimit: 100_000_000,
  }),
});`;

const BROWSER = `import { sniff, resolveValidation, validateImage, LensError } from '@lens-image/core/browser';

const policy = resolveValidation({ maxBytes: 10_000_000, allowedFormats: ['jpeg', 'png'] });
const header = new Uint8Array(await file.slice(0, 4096).arrayBuffer());

try {
  validateImage(sniff(header, file.size), policy, file.name);
} catch (error) {
  if (LensError.is(error)) showToast(error.message);
}`;

const HOOK = `const {
  items,        // every tracked file: status, progress, result, error, previewUrl
  images,       // successful results only
  isUploading,
  progress,     // 0-100, weighted by byte count
  error,        // first error in the queue
  status,       // 'idle' | 'uploading' | 'success' | 'error' | 'cancelled'
  upload,       // (files: FileList | File[] | File) => Promise<UploadedImage[]>
  cancel,
  reset,
  remove,       // (id: string) => void
} = useImageUpload({ endpoint: '/api/upload' });`;

export default function ApiPage() {
  return (
    <>
      <PageHeader
        section="Reference"
        title="API reference"
        lead="Everything exported from @lens-image/core and @lens-image/react."
      />

      <Prose>
        <h2>ImageOptimizer</h2>
        <p>
          Construct one per configuration and reuse it. It memoises engine detection and
          owns the result cache, so a fresh instance per request throws both away.
        </p>
        <CodeBlock code={CONSTRUCT} language="ts" />

        <h3>optimize(options)</h3>
        <p>
          Everything except <code>adapter</code>, <code>engine</code>, <code>cache</code>{' '}
          and <code>allowRemote</code> can be overridden per call.
        </p>
        <CodeBlock code={OPTIMIZE} language="ts" />

        <h3>Other methods</h3>
        <table>
          <thead>
            <tr>
              <th>Method</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>inspect(source)</code>
              </td>
              <td>Metadata only. Nothing is encoded or uploaded.</td>
            </tr>
            <tr>
              <td>
                <code>optimizeMany(sources, opts)</code>
              </td>
              <td>
                Sequential by design, each call already fans out internally, and
                overlapping whole images multiplies peak memory.
              </td>
            </tr>
            <tr>
              <td>
                <code>delete(result)</code>
              </td>
              <td>
                Removes every variant. Needs an adapter implementing <code>remove</code>.
              </td>
            </tr>
            <tr>
              <td>
                <code>dispose()</code>
              </td>
              <td>Releases adapter resources. Safe to call twice.</td>
            </tr>
            <tr>
              <td>
                <code>engine()</code>
              </td>
              <td>Resolves the codec backend, running detection on first use.</td>
            </tr>
          </tbody>
        </table>

        <h2>The result</h2>
        <CodeBlock code={RESULT_TYPE} language="ts" />
        <CodeBlock code={FORMAT_RESULT} language="ts" />
        <Callout title="Why savings uses the largest output">
          Comparing nine variants&apos; total against one input is apples to oranges. The
          headline number uses the largest single output. The one that would actually
          replace the original. It is clamped at zero, so re-encoding that inflates a file
          reports 0% rather than a negative.
        </Callout>

        <h2>Engines</h2>
        <table>
          <thead>
            <tr>
              <th>Factory</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>createSharpEngine(opts)</code>
              </td>
              <td>sharp-backed. Lazy dynamic import, nothing loads until you encode.</td>
            </tr>
            <tr>
              <td>
                <code>createPassthroughEngine()</code>
              </td>
              <td>
                No codec. Validates, hashes, keys and stores originals. Ideal for tests.
              </td>
            </tr>
            <tr>
              <td>
                <code>detectEngine()</code>
              </td>
              <td>sharp if available, otherwise passthrough. The default.</td>
            </tr>
          </tbody>
        </table>
        <CodeBlock code={ENGINES} language="ts" />

        <h2>Upload handler</h2>
        <table>
          <thead>
            <tr>
              <th>Option</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>optimizer</code>
              </td>
              <td>Required.</td>
            </tr>
            <tr>
              <td>
                <code>fieldName</code>
              </td>
              <td>
                Multipart field to read. Default <code>&apos;file&apos;</code>.
              </td>
            </tr>
            <tr>
              <td>
                <code>maxFiles</code>
              </td>
              <td>Default 1. Over the limit is a 413.</td>
            </tr>
            <tr>
              <td>
                <code>authorize(request)</code>
              </td>
              <td>
                Return a <code>Response</code> to short-circuit before any work happens.
              </td>
            </tr>
            <tr>
              <td>
                <code>options</code>
              </td>
              <td>
                Per-request optimize options, or a function of the request. The right place
                to turn a session into a key prefix.
              </td>
            </tr>
            <tr>
              <td>
                <code>serialize(results)</code>
              </td>
              <td>Shape the success payload.</td>
            </tr>
            <tr>
              <td>
                <code>onError(error, request)</code>
              </td>
              <td>
                Observe failures. Unexpected errors return a generic message to the client;
                the real one comes here.
              </td>
            </tr>
          </tbody>
        </table>

        <h2>@lens-image/core/browser</h2>
        <p>
          A subset with no <code>node:</code> imports at all, so it bundles for a browser,
          a Worker or an edge runtime. A CI check walks the import graph and fails if
          anything Node-specific creeps in.
        </p>
        <CodeBlock code={BROWSER} language="ts" />
        <p>
          Note the <code>file.slice(0, 4096)</code>, only the header is read, so
          validating a 40&nbsp;MB file costs four kilobytes.
        </p>

        <h2>HTML helpers</h2>
        <table>
          <thead>
            <tr>
              <th>Function</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>toPicture(result, opts)</code>
              </td>
              <td>
                <code>&lt;picture&gt;</code>-ready sources and an <code>img</code>{' '}
                fallback, with intrinsic dimensions always set.
              </td>
            </tr>
            <tr>
              <td>
                <code>pickVariant(result, w, fmt)</code>
              </td>
              <td>Smallest variant at least that wide, never an upscale.</td>
            </tr>
            <tr>
              <td>
                <code>buildSrcset(variants)</code>
              </td>
              <td>A sorted srcset string from any variant list.</td>
            </tr>
          </tbody>
        </table>

        <h2>@lens-image/react</h2>
        <h3>useImageUpload(options)</h3>
        <CodeBlock code={HOOK} language="ts" />
        <p>
          Options: <code>endpoint</code> (required), <code>fieldName</code>,{' '}
          <code>headers</code>, <code>fields</code>, <code>credentials</code>,{' '}
          <code>batch</code>, <code>maxBytes</code>, <code>accept</code>,{' '}
          <code>maxFiles</code>, <code>preview</code>, <code>parseResponse</code>,{' '}
          <code>onSuccess</code>, <code>onError</code>, <code>onComplete</code>.
        </p>

        <h3>useDropzone(options)</h3>
        <p>
          Returns <code>getRootProps</code>, <code>getInputProps</code>,{' '}
          <code>isDragActive</code> and <code>open</code>. Prop getters, not components
          spread them onto markup you are already styling. The drag state is tracked with
          an enter/leave depth counter so it does not flicker as the cursor crosses child
          elements.
        </p>

        <h3>Helpers</h3>
        <p>
          <code>toPictureProps</code>, <code>pickVariant</code>, <code>validateFile</code>,{' '}
          <code>matchesAccept</code>, <code>formatBytes</code>. All pure, so they are safe
          to run during SSR. The two hooks are client-only.
        </p>

        <h2>Exports for adapter authors</h2>
        <p>
          <code>sniff</code>, <code>mimeTypeFor</code>, <code>extensionFor</code>,{' '}
          <code>buildKey</code>, <code>joinKey</code>, <code>slugify</code>,{' '}
          <code>withRetry</code>, <code>isRetryableError</code>, <code>mapLimit</code>,{' '}
          <code>sha256</code>, <code>shortHash</code>, <code>LensError</code>.
        </p>
      </Prose>
    </>
  );
}
