import Link from 'next/link';
import { ArrowRight } from '@/components/Icons';
import { Reveal } from '@/components/Reveal';
import { SqueezeCarousel, type SqueezeSlide } from '@/components/ui/carousel-squeeze';
import { HERO_IMAGES } from '@/lib/hero-images';
import { SectionHead } from './SectionHead';

/** A wordmark for the corner of the open panel. */
const mark = (text: string) => (
  <span className="text-sm font-medium tracking-tight text-white">{text}</span>
);

/**
 * The storage backends, as carousel panels.
 *
 * The panel imagery is the same set the hero flies past: already optimized by
 * Lens, already on disk, so this section costs no new bytes.
 */
const ADAPTER_SLIDES: SqueezeSlide[] = [
  {
    id: 's3',
    title: 'Amazon S3, and everything that speaks its API.',
    description:
      'Cloudflare R2, MinIO, DigitalOcean Spaces and Backblaze B2 all work through the same adapter, set an endpoint and go. The AWS SDK stays a peer dependency, so you keep your own version.',
    action: 'Read the S3 guide',
    href: '/docs/adapters',
    overlay: mark('@lens-image/adapter-s3'),
    image: HERO_IMAGES[2]?.src,
    imageAlt: HERO_IMAGES[2]?.alt,
  },
  {
    id: 'local',
    title: 'The filesystem, done carefully.',
    description:
      'Atomic writes, so a crash mid-upload leaves the previous file intact rather than a truncated one. Any key that resolves outside the root is refused outright. Zero dependencies.',
    action: 'Read the filesystem guide',
    href: '/docs/adapters',
    overlay: mark('@lens-image/adapter-local'),
    image: HERO_IMAGES[5]?.src,
    imageAlt: HERO_IMAGES[5]?.alt,
  },
  {
    id: 'cloudinary',
    title: 'Cloudinary, without the SDK.',
    description:
      'Signed uploads are an HTTP POST with a SHA-1 signature, which node:crypto and the built-in fetch cover in a couple of hundred lines. Install cost: zero packages.',
    action: 'Read the Cloudinary guide',
    href: '/docs/adapters',
    overlay: mark('@lens-image/adapter-cloudinary'),
    image: HERO_IMAGES[8]?.src,
    imageAlt: HERO_IMAGES[8]?.alt,
  },
  {
    id: 'custom',
    title: 'Or forty lines of your own.',
    description:
      'The contract is a name and an upload function. Implement exists and remove to unlock storage-aware caching and deletion. Retries, concurrency limiting and error wrapping are handled for you.',
    action: 'Write an adapter',
    href: '/docs/adapters',
    overlay: mark('StorageAdapter'),
    image: HERO_IMAGES[0]?.src,
    imageAlt: HERO_IMAGES[0]?.alt,
  },
  {
    id: 'none',
    title: 'Or no storage at all.',
    description:
      'Leave the adapter out and Lens runs in process-only mode: no URLs are invented, and the encoded bytes come back on each variant for you to do as you like with.',
    action: 'See the API',
    href: '/docs/api',
    overlay: mark('process-only'),
    image: HERO_IMAGES[6]?.src,
    imageAlt: HERO_IMAGES[6]?.alt,
  },
];

export function Adapters() {
  return (
    <section className="mx-auto max-w-shell px-4 py-20 sm:px-6 sm:py-28" aria-label="Storage">
      <SectionHead
        kicker="STORAGE"
        title="One interface,"
        quiet="one required method."
        lead="Processing and storage are separate concerns, so they are separate packages. Pick a backend, or write one. The call above it never changes."
      />

      {/*
        The carousel needs room to be a carousel. Its open panel is a 16:9 block,
        so once the container drops under about 600px that block alone is wider
        than the row, `--sq-room` goes negative and the three squeezed columns
        collapse to zero width, which is not just ugly but leaves three tab stops
        that cannot be tapped. Below `md` (768px, where the container is still
        only about 700px wide and the squeezed columns are cramped) the same five
        entries render as a list, which is the better phone layout anyway. The
        carousel's images are lazy, so the hidden copy costs a phone nothing.
      */}
      <Reveal delay={120} className="mt-12 hidden md:block">
        <SqueezeCarousel
          slides={ADAPTER_SLIDES}
          label="Storage backends"
          height="clamp(180px, 30cqi, 340px)"
        />
      </Reveal>

      <ul className="mt-10 flex flex-col gap-2 md:hidden">
        {ADAPTER_SLIDES.map((slide) => (
          <li key={slide.id}>
            <Link
              href={slide.href ?? '/docs/adapters'}
              className="group flex gap-3 rounded-lg border border-line bg-surface p-3 transition-colors hover:border-line-strong hover:bg-raised"
            >
              {slide.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={slide.image}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-16 w-16 shrink-0 rounded object-cover"
                />
              ) : null}
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  {slide.title}
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="mt-1 block text-sm text-muted">{slide.description}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
