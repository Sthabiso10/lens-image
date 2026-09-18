import type { Metadata } from 'next';
import { CodeBlock, CommandLine } from '@/components/CodeBlock';
import { Callout, PageHeader, Prose, Step, Steps } from '@/components/Prose';

export const metadata: Metadata = { title: 'Getting started' };

const FIRST = `import { ImageOptimizer } from '@lens-image/core';
import { LocalAdapter } from '@lens-image/adapter-local';

const optimizer = new ImageOptimizer({
  adapter: new LocalAdapter({
    root: './public/uploads',   // where files land
    baseUrl: '/uploads',        // how the browser reaches them
  }),
  quality: 80,
});

const result = await optimizer.optimize({
  source: './photo.jpg',
  formats: ['webp', 'jpg'],
  sizes: [{ width: 1200 }, { width: 600 }, { width: 300 }],
});`;

const RESULT = `result.formats.webp.urls['600w'];  // '/uploads/a1b2c3d4e5/photo-600w.webp'
result.formats.webp.srcset;        // the whole ladder, sorted ascending
result.formats.webp.largest;       // widest variant, for a plain src
result.savings;                    // 0.82, i.e. 82% smaller than the original
result.warnings;                   // anything that degraded
result.durationMs;`;

const PICTURE = `import { toPicture } from '@lens-image/core';

const pic = toPicture(result, {
  alt: 'Cabin at dusk',
  sizes: '(max-width: 768px) 100vw, 50vw',
});

<picture>
  {pic.sources.map((s) => <source key={s.type} {...s} />)}
  <img src={pic.src} width={pic.width} height={pic.height} alt={pic.alt} loading="lazy" />
</picture>`;

const S3 = `import { S3Adapter } from '@lens-image/adapter-s3';

const optimizer = new ImageOptimizer({
  adapter: new S3Adapter({
    bucket: 'my-images',
    region: 'us-east-1',
    publicUrl: 'https://cdn.example.com',   // your CloudFront distribution
  }),
});`;

const HANDLER = `import { ImageOptimizer, createUploadHandler } from '@lens-image/core';
import { S3Adapter } from '@lens-image/adapter-s3';

const optimizer = new ImageOptimizer({
  adapter: new S3Adapter({ bucket: 'uploads', region: 'us-east-1' }),
});

export const POST = createUploadHandler({
  optimizer,
  maxFiles: 5,
  async authorize(request) {
    const session = await auth(request);
    return session ? undefined : Response.json({ error: 'Unauthorized' }, { status: 401 });
  },
  options: {
    formats: ['webp', 'jpg'],
    sizes: [{ width: 1200 }, { width: 600 }],
    thumbnail: true,
  },
});`;

const HOOK = `'use client';

import { useImageUpload } from '@lens-image/react';

export function Uploader() {
  const { upload, items, progress, isUploading, error } = useImageUpload({
    endpoint: '/api/upload',
    maxBytes: 10 * 1024 * 1024,
    accept: ['image/*'],
  });

  return (
    <>
      <input type="file" multiple disabled={isUploading}
        onChange={(e) => upload(e.target.files)} />

      {isUploading && <progress value={progress} max={100} />}
      {error && <p role="alert">{error.message}</p>}

      {items.map((item) => (
        <img key={item.id} src={item.result?.thumbnail?.url ?? item.previewUrl} alt="" />
      ))}
    </>
  );
}`;

const NO_ADAPTER = `const optimizer = new ImageOptimizer();   // no adapter

const { variants } = await optimizer.optimize({ source: bytes, formats: ['webp'] });
await writeFile('out.webp', variants[0].data);`;

export default function GettingStartedPage() {
  return (
    <>
      <PageHeader
        section="Start here"
        title="Getting started"
        lead="Install, optimize one image, then wire up a real upload endpoint. About ten minutes."
      />

      <Prose>
        <Steps>
          <Step title="Install">
            <p>
              The core plus a codec. <code>sharp</code> is a separate install because it
              is a native module, see{' '}
              <a href="/docs#about-that-zero-dependencies-claim">why</a>.
            </p>
            <CommandLine command="npm install @lens-image/core sharp" />
            <p>Then pick where the output goes:</p>
            <CommandLine command="npm install @lens-image/adapter-local" />
            <Callout title="Node 18.17 or newer">
              Lens uses <code>fetch</code>, <code>File</code> and <code>FormData</code> as
              globals, and <code>AbortSignal.timeout</code>.
            </Callout>
          </Step>

          <Step title="Optimize an image">
            <p>
              One call produces every format at every size and uploads each one. Formats
              are independent: if one fails, the rest still resolve.
            </p>
            <CodeBlock code={FIRST} language="ts" filename="optimize.ts" />
            <p>
              That writes six files (three widths in WebP and three in JPEG) under{' '}
              <code>./public/uploads</code>.
            </p>
          </Step>

          <Step title="Read the result">
            <p>
              Variants are grouped by format, keyed by size label, with a{' '}
              <code>srcset</code> already assembled.
            </p>
            <CodeBlock code={RESULT} language="ts" />
            <Callout title="jpg or jpeg?">
              <code>jpg</code> is accepted everywhere as an input alias and normalised to{' '}
              <code>jpeg</code>, so results are always keyed <code>formats.jpeg</code>.
              File extensions still come out as <code>.jpg</code>.
            </Callout>
          </Step>

          <Step title="Render it">
            <p>
              Source order follows your <code>formats</code> array, so{' '}
              <code>[&apos;avif&apos;, &apos;webp&apos;, &apos;jpg&apos;]</code> produces
              exactly the progressive-enhancement ladder you would write by hand.
            </p>
            <CodeBlock code={PICTURE} language="tsx" />
          </Step>

          <Step title="Move to real storage">
            <p>
              Change the adapter. Nothing above it moves. The call, the options and the
              result shape are identical.
            </p>
            <CodeBlock code={S3} language="ts" />
            <Callout tone="warn" title="Set publicUrl when a CDN fronts the bucket">
              Without it, URLs point at the S3 origin and every request bypasses your
              cache.
            </Callout>
          </Step>

          <Step title="Accept uploads">
            <p>
              <code>createUploadHandler</code> is a <code>Request → Response</code>{' '}
              function built only on web standards, so it drops into Next.js, Remix, Hono,
              Bun or Deno unmodified.
            </p>
            <CodeBlock code={HANDLER} language="ts" filename="app/api/upload/route.ts" />
            <p>
              Errors map to their status automatically: a too-large file is a 422 with a
              readable message, not a 500.
            </p>
          </Step>

          <Step title="Wire up the client">
            <p>
              <code>@lens-image/react</code> is state only, no components and no CSS, so it
              composes with whatever you are already styling with.
            </p>
            <CodeBlock code={HOOK} language="tsx" filename="components/Uploader.tsx" />
            <p>
              Progress comes from <code>XMLHttpRequest.upload.onprogress</code> and is
              weighted by file size, so a 40&nbsp;KB icon finishing does not push a bar
              tracking a 12&nbsp;MB photo to 50%.
            </p>
          </Step>
        </Steps>

        <h2>Without storage</h2>
        <p>
          Omit the adapter and Lens runs in process-only mode: no URLs are invented, and
          the encoded bytes come back on each variant.
        </p>
        <CodeBlock code={NO_ADAPTER} language="ts" />

        <h2>Next</h2>
        <p>
          The <a href="/docs/pipeline">pipeline page</a> explains how formats, quality,
          validation and caching interact, worth reading before you tune anything. The{' '}
          <a href="/docs/adapters">adapters page</a> covers writing your own.
        </p>
      </Prose>
    </>
  );
}
