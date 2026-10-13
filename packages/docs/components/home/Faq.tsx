import Link from 'next/link';
import { Reveal } from '@/components/Reveal';
import { SectionHead } from './SectionHead';

/**
 * Each answer was checked against the repo rather than written from memory:
 * the README and `packages/core/README.md`, `packages/core/package.json`
 * (`dependencies` is absent; `sharp` is an optional peer), and the docs'
 * pipeline, API and adapters pages. If one of those changes, change the answer.
 */
const QUESTIONS: { q: string; a: React.ReactNode }[] = [
  {
    q: 'Does the core really have zero dependencies?',
    a: (
      <>
        <p>
          Yes, in the literal sense: <code>@lens-image/core</code> has no entries in{' '}
          <code>dependencies</code>, so installing it adds one package to your lockfile and
          downloads no native binaries. A CI check enforces it.
        </p>
        <p>
          The qualifier is that pixel work needs <code>sharp</code>, which Lens declares as an
          optional peer dependency and you install yourself. The adapters depend on the core
          and nothing else; the S3 adapter takes the AWS SDK as a peer.
        </p>
      </>
    ),
  },
  {
    q: 'Do I need sharp?',
    a: (
      <>
        <p>
          To resize and encode, yes, by default: it is imported lazily the first time you
          encode something. If you only validate, hash and store originals, the built-in
          passthrough engine needs no codec at all.
        </p>
        <p>
          The codec is an interface too (<code>ImageEngine</code>, three methods), so you can
          swap sharp out. If it is missing when needed, you get a clear{' '}
          <code>ENGINE_UNAVAILABLE</code> error naming the install command.
        </p>
      </>
    ),
  },
  {
    q: 'Which storage backends are supported?',
    a: (
      <>
        <p>
          Three packages ship today: S3 (plus R2, MinIO, DigitalOcean Spaces and Backblaze B2
          through an endpoint), the local filesystem, and Cloudinary.
        </p>
        <p>
          Anything else is an adapter with one required method, <code>upload()</code>. You can
          also leave the adapter out entirely and get the encoded bytes back to handle
          yourself.{' '}
          <Link href="/docs/adapters">Storage adapters</Link>
        </p>
      </>
    ),
  },
  {
    q: 'Does it run in the browser or at the edge?',
    a: (
      <>
        <p>
          Part of it does. <code>@lens-image/core/browser</code> is a subset with no{' '}
          <code>node:</code> imports (format sniffing, validation, key templating) that
          bundles for a browser, a Worker or an edge runtime, so you can reject a bad file
          from its first 4&nbsp;KB before the upload starts.
        </p>
        <p>
          Encoding is a different matter: the default engine is sharp, a native module, so it
          runs where sharp does. The upload handler is a plain <code>Request</code> to{' '}
          <code>Response</code> function, so it is not tied to one framework.
        </p>
      </>
    ),
  },
  {
    q: 'What happens if AVIF is unavailable?',
    a: (
      <>
        <p>
          Prebuilt sharp binaries do not all ship AV1. When AVIF cannot be encoded, that
          format is skipped and recorded in <code>result.warnings</code> as{' '}
          <code>format_unsupported</code>; the other formats you asked for still come back.
        </p>
        <p>
          If every requested format fails, Lens retries in <code>fallbackFormat</code> (JPEG
          by default), and only a total failure throws. Treat AVIF as best-effort.
        </p>
      </>
    ),
  },
  {
    q: 'Is it safe with untrusted uploads?',
    a: (
      <>
        <p>
          The defaults are built for it: format is sniffed from the bytes rather than trusted
          from the extension, a 100-megapixel guard (checked from the header, before any
          decoder runs) stops decompression bombs, and uploads are capped at 25&nbsp;MB.
          Metadata such as EXIF is stripped, remote URL fetching is off, and the filesystem
          adapter refuses keys that escape its root.
        </p>
        <p>
          Authentication is still yours: the upload handler takes an <code>authorize</code>{' '}
          hook for it. And the library is pre-1.0, so pin an exact version.
        </p>
      </>
    ),
  },
];

/**
 * An accordion on native `<details>`: keyboard, find-in-page and no-JS
 * behaviour for free. The toggle is a small rounded square (24px,
 * hairline, 6px radius) holding a `+`. Only the glyph turns, an eighth of a
 * turn into a `×` when the item opens, via the `open` attribute the browser
 * maintains; the square stays put so the row does not wobble.
 */
export function Faq() {
  return (
    <section className="mx-auto max-w-shell px-4 py-20 sm:px-6 sm:py-28" aria-label="Questions">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <SectionHead
            kicker="FAQ"
            title="Good questions,"
            quiet="answered by humans."
            lead="The straight versions, checked against the source."
          />
        </div>

        <Reveal delay={100}>
          <div className="divide-y divide-line border-y border-line">
            {QUESTIONS.map((item) => (
              <details key={item.q} className="group">
                <summary className="group/q flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left text-base font-medium text-foreground transition-colors hover:text-white [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span
                    aria-hidden="true"
                    className="grid size-6 flex-none place-items-center rounded-md border border-line text-muted transition-colors duration-150 group-hover/q:border-line-strong group-hover/q:text-foreground group-open:border-line-strong group-open:text-foreground"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width={14}
                      height={14}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.75}
                      strokeLinecap="round"
                      className="transition-transform duration-300 ease-out-expo group-open:rotate-45"
                    >
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                </summary>
                <div className="flex max-w-xl flex-col gap-3 pb-6 text-sm text-muted [&_a]:text-accent-bright [&_a]:underline-offset-4 hover:[&_a]:underline [&_code]:font-mono [&_code]:text-[0.92em] [&_code]:text-foreground">
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
