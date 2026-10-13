import type { Metadata } from 'next';
import Link from 'next/link';
import { CodeBlock } from '@/components/CodeBlock';
import { ArrowRight } from '@/components/Icons';
import { Callout, PageHeader, Prose } from '@/components/Prose';
import { NAV_GROUPS, VERSION } from '@/lib/nav';

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
    deps: 'Core + AWS SDK as a peer',
    body: 'S3, and anything that speaks its API: R2, MinIO, Spaces, B2.',
  },
  {
    name: '@lens-image/adapter-local',
    role: 'Storage',
    deps: 'Depends on core only',
    body: 'The filesystem, with atomic writes and path-traversal refusal.',
  },
  {
    name: '@lens-image/adapter-cloudinary',
    role: 'Storage',
    deps: 'Depends on core only',
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

/*
 * The introduction links to everything after it, so the page itself is dropped.
 * Each card keeps the title of the nav group it came from ("Start here",
 * "Reference"), which becomes its kicker, so the grid reads as a map of the
 * docs rather than a flat list.
 */
const NEXT_PAGES = NAV_GROUPS.flatMap((group) =>
  group.items
    .filter((item) => item.href !== '/docs')
    .map((item) => ({ ...item, category: group.title })),
);

export default function DocsIndexPage() {
  return (
    <>
      <PageHeader
        section="Start here"
        title="Introduction"
        eyebrow={
          // Announcement pill. It points at the pipeline page
          // because that is where the AVIF fallback is documented.
          <Link
            href="/docs/pipeline"
            className="pill no-underline"
          >
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-signal" />
            <span>
              <span className="font-mono text-xs tabular-nums text-foreground">v{VERSION}</span>
              <span aria-hidden="true" className="mx-2 text-subtle">
                ·
              </span>
              Graceful AVIF fallback
            </span>
            <ArrowRight className="btn-arrow h-3.5 w-3.5" />
          </Link>
        }
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

        {/*
          One frame with hairline rows, rather than five separate cards: it
          reads as a table of packages, which is what it is. The header strip
          also keeps the frame's corner dots clear of the first row's text.
        */}
        <div className="frame">
          <div className="flex items-center justify-between gap-4 border-b border-line px-8 py-2.5 font-mono text-[10.5px] uppercase leading-4 tracking-[0.14em] text-muted">
            <span>Package</span>
            <span>Dependencies</span>
          </div>
          {PACKAGES.map((pkg) => (
            <div
              key={pkg.name}
              className="border-b border-line px-5 py-4 transition-colors last:border-b-0 hover:bg-raised/60"
            >
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <code className="break-all font-mono text-sm text-foreground">{pkg.name}</code>
                <span className="rounded border border-line px-1.5 py-0.5 text-xs text-muted">
                  {pkg.role}
                </span>
                {/* The claim the whole project rests on gets the signal colour. */}
                <span
                  className={`ml-auto flex items-center gap-1.5 font-mono text-2xs ${
                    pkg.deps.startsWith('0 ') ? 'text-signal' : 'text-muted'
                  }`}
                >
                  {pkg.deps.startsWith('0 ') ? (
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-signal" />
                  ) : null}
                  {pkg.deps}
                </span>
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

        {/*
          "Skill" cards: a framed card with the category as a
          kicker, the page title in the display face, its summary, and an
          arrow that slides on hover. `no-underline!` is needed because the
          prose rules underline every link in the article, and a decoration
          set on the anchor cannot be turned off by its children.
        */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {NEXT_PAGES.map((page) => (
            <Link
              key={page.href}
              href={page.href}
              className="frame group flex flex-col gap-3 px-5 pb-5 pt-9 no-underline! transition-[border-color,background-color] duration-300 ease-out-expo hover:border-line-strong hover:bg-raised"
            >
              <span className="kicker self-start">{page.category}</span>
              <span className="display text-xl text-foreground">{page.label}</span>
              <span className="text-sm text-muted">{page.summary}</span>
              <span aria-hidden="true" className="arrow-chip mt-auto">
                <ArrowRight className="btn-arrow h-3 w-3" />
              </span>
            </Link>
          ))}
        </div>
      </Prose>
    </>
  );
}
