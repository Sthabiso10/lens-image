import type { Metadata } from 'next';
import Link from 'next/link';
import { Playground } from '@/components/Playground';

export const metadata: Metadata = {
  title: 'Playground',
  description:
    'Compress an image in your browser, drag to compare it against the original, and see the keys and srcset Lens would write. Nothing is uploaded.',
};

export default function PlaygroundPage() {
  return (
    <div className="mx-auto max-w-[96rem] px-4 pb-16 pt-8 sm:px-6 lg:pt-12">
      <header className="mb-8 flex animate-rise flex-col gap-6 lg:mb-10 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="kicker">Playground</p>
          <h1 className="display mt-4 text-4xl sm:text-5xl lg:text-6xl">
            Squeeze an image.
            <br />
            <span className="text-muted">Watch the bytes move.</span>
          </h1>
          <p className="mt-4 text-base text-muted">
            Pick a photo or drop your own, then compare the result against the original and
            see every file Lens would write.
          </p>
        </div>

        {/*
          True, and checkable: the page's only network request is for a bundled
          sample on this origin. Dropped files are read, decoded and encoded in
          the tab through the canvas API and are never sent anywhere.
        */}
        <p className="pill shrink-0 self-start lg:self-auto">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-signal" />
          Runs in your browser · nothing uploaded
        </p>
      </header>

      <Playground />

      <div className="mt-10 grid gap-6 border-t border-line pt-6 text-sm text-muted md:grid-cols-3">
        <p>
          <span className="font-medium text-secondary">The sizes are real.</span> Your browser
          has an encoder built in, and this uses it. The bytes are measured, not estimated. It
          is not sharp, though, so treat the numbers as the right shape rather than the exact
          output of your server.
        </p>
        <p>
          <span className="font-medium text-secondary">The keys are exact.</span> Labels,
          storage keys and the srcset come from{' '}
          <Link
            href="/docs/api"
            className="text-accent-bright underline decoration-accent-bright/35 underline-offset-[3px]"
          >
            <code className="font-mono">@lens-image/core/browser</code>
          </Link>
          , the same functions the server calls.
        </p>
        <p>
          <span className="font-medium text-secondary">Nothing leaves this tab.</span> Images
          are decoded and encoded locally and thrown away when you close it.
        </p>
      </div>
    </div>
  );
}
