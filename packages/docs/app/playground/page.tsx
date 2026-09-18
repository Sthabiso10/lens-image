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
    <div className="mx-auto max-w-shell px-4 py-10 sm:px-6 lg:py-14">
      <header className="mb-8 max-w-prose">
        <p className="label">Try it</p>
        <h1 className="mt-1.5 text-3xl font-semibold text-foreground">Playground</h1>
        <p className="mt-3 text-base text-muted">
          Pick a photo or drop your own, then drag the quality slider and watch the file
          size move. Compare the result against the original, and see every file Lens
          would write.
        </p>

        <div className="mt-4 flex flex-col gap-2 text-sm text-muted">
          <p>
            <span className="font-medium text-foreground">The sizes are real.</span> Your
            browser has a WebP and JPEG encoder built in, and this uses it. The bytes are
            measured, not estimated. It is not sharp, though, so treat the numbers as the
            right shape rather than the exact output of your server.
          </p>
          <p>
            <span className="font-medium text-foreground">The keys are exact.</span> Labels,
            storage keys and the srcset come from{' '}
            <Link
              href="/docs/api"
              className="text-accent-bright underline decoration-accent-bright/35 underline-offset-[3px]"
            >
              <code className="font-mono">@lens-image/core/browser</code>
            </Link>{' '}
. The same functions the server calls.
          </p>
          <p>
            <span className="font-medium text-foreground">Nothing leaves this tab.</span>{' '}
            Images are decoded and encoded locally and thrown away when you close it.
          </p>
        </div>

        <hr className="mt-6 border-line" />
      </header>

      <Playground />
    </div>
  );
}
