import type { Metadata } from 'next';
import Link from 'next/link';
import { CodeBlock } from '@/components/CodeBlock';
import { ArrowRight } from '@/components/Icons';
import { Callout, PageHeader, Prose } from '@/components/Prose';
import { NAV_ORDER } from '@/lib/nav';

export const metadata: Metadata = { title: 'Introduction' };

const PACKAGES = [
  {
    name: '@lens-image/core',
    role: 'The engine',
    deps: '0 dependencies',
    body: 'Validation, planning, encoding, key templating, retries, caching, and the upload handler. No React, no SDKs.',
  },
  {
    name: '@lens-image/adapter-s3',
    role: 'Storage',
    deps: 'AWS SDK is a peer',
    body: 'S3, and anything that speaks its API: R2, MinIO, Spaces, B2.',
  },
  {
    name: '@lens-image/adapter-local',
    role: 'Storage',
    deps: '0 dependencies',
    body: 'The filesystem, with atomic writes and path-traversal refusal.',
  },
  {
    name: '@lens-image/adapter-cloudinary',
    role: 'Storage',
    deps: '0 dependencies',
    body: 'Signed uploads over plain HTTP. The official SDK is not required.',
  },
  {
    name: '@lens-image/react',
    role: 'The UI layer',
    deps: 'React is a peer',
    body: 'Headless upload hooks with real progress. No components, no CSS.',
  },
];

const ENGINE = `interface ImageEngine {
  readonly name: string;
  supports(format: ImageFormat): boolean | Promise<boolean>;
  probe(input: Uint8Array): Promise<ImageMetadata>;
  transform(input: Uint8Array, op: TransformOp): Promise<EncodedImage>;
}`;

// The introduction links to everything after it, so drop the page itself.
const NEXT_PAGES = NAV_ORDER.filter((item) => item.href !== '/docs');

export default function DocsIndexPage() {
  return (
    <>
      <PageHeader
        section="Documentation"
        title="Introduction"
        lead="Lens resizes, compresses and converts images, then hands them to storage you choose. Start with getting started; the pipeline page is the one worth reading properly."
      />

      <Prose>
        <p>
          Every app that accepts an image eventually grows the same three hundred lines: a
          resize loop, a format matrix, a naming scheme, an S3 client, a retry, and a
          nagging suspicion that none of it validates the input properly. Lens is that
          stack written once and tested, with the parts you are likely to disagree with
          behind interfaces.
        </p>

        <h2>What it is not</h2>
        <p>
          It is Node-first. There is no client-side processing, no video, no watermarking
          and no batch-processing UI. It also does not try to be a CDN or an image server
          it produces files and puts them where you tell it, and something else serves
          them.
        </p>

        <h2>The packages</h2>
        <p>
          Separate installs on purpose. A script that only compresses takes the core alone;
          everything else is opt-in.
        </p>

        <div className="grid gap-2">
          {PACKAGES.map((pkg) => (
            <div key={pkg.name} className="rounded-lg border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2.5">
                <code className="font-mono text-sm text-foreground">{pkg.name}</code>
                <span className="rounded border border-line px-1.5 py-0.5 text-xs text-muted">
                  {pkg.role}
                </span>
                <span className="ml-auto font-mono text-2xs text-subtle">{pkg.deps}</span>
              </div>
              <p className="mt-2 text-sm text-muted">{pkg.body}</p>
            </div>
          ))}
        </div>

        <h2 id="about-that-zero-dependencies-claim">
          About that &ldquo;zero dependencies&rdquo; claim
        </h2>
        <p>
          Worth being precise, because this is the sort of claim that deserves it.
        </p>
        <p>
          <strong>
            <code>@lens-image/core</code> has zero entries in <code>dependencies</code>.
          </strong>{' '}
          Installing it adds one package to your lockfile and downloads no native binaries.
          That is enforced by a check in CI, not just promised in a README.
        </p>
        <p>
          <strong>Actual pixel work needs sharp</strong>, which is a native module. Lens
          treats the codec as a pluggable engine and declares sharp as an{' '}
          <em>optional peer dependency</em>, imported dynamically the first time you
          encode something.
        </p>

        <CodeBlock code={ENGINE} language="ts" />

        <p>So, concretely:</p>
        <ul>
          <li>
            <strong>You install sharp yourself.</strong> Its native binary and platform
            matrix live in <em>your</em> lockfile, visible, rather than arriving as a
            transitive surprise.
          </li>
          <li>
            <strong>You can skip it.</strong> Validating, content-hashing and storing
            originals works with the built-in passthrough engine and no codec at all.
          </li>
          <li>
            <strong>You can replace it.</strong> Three methods. Point them at squoosh, a
            WASM codec, or an ImageMagick shell-out.
          </li>
          <li>
            <strong>If you forget it</strong>, you get one clear error naming the install
            command, not mysteriously unprocessed images.
          </li>
        </ul>

        <Callout title="The honest version">
          The claim is &ldquo;the core is dependency-free and the heavy thing is your
          explicit choice&rdquo;, not &ldquo;image processing happens by magic&rdquo;.
        </Callout>

        <h2>Where to go next</h2>

        <div className="grid gap-2 sm:grid-cols-2">
          {NEXT_PAGES.map((page) => (
            <Link
              key={page.href}
              href={page.href}
              className="group flex flex-col gap-1 rounded-lg border border-line bg-surface p-4 no-underline transition-colors hover:border-line-strong hover:bg-raised"
            >
              <span className="flex items-center gap-1.5 text-base font-medium text-foreground">
                {page.label}
                <ArrowRight className="h-3.5 w-3.5 text-subtle transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="text-sm text-muted">{page.summary}</span>
            </Link>
          ))}
        </div>
      </Prose>
    </>
  );
}
