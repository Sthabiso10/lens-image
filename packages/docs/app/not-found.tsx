import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-shell flex-col items-center gap-4 px-4 py-32 text-center">
      <p className="font-mono text-sm text-subtle">404</p>
      <h1 className="text-2xl font-semibold text-foreground">That page does not exist</h1>
      <p className="max-w-sm text-muted">
        It may have been renamed. The documentation index lists everything.
      </p>
      <Link href="/docs" className="btn btn-secondary mt-2">
        Go to the docs
      </Link>
    </div>
  );
}
