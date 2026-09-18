import { DocsPager } from '@/components/DocsPager';
import { DocsSidebar } from '@/components/DocsSidebar';
import { TableOfContents } from '@/components/TableOfContents';

/**
 * Three-column documentation shell: page tree, content, section list.
 *
 * The rail is two elements on purpose. The outer column carries the surface and
 * the divider and is a plain flex child, so it stretches to the full height of
 * the docs section and stops exactly where the footer begins. A sticky element
 * cannot do that, because at the end of the page it stays pinned at viewport
 * height and its background ends up hanging in mid-air above the footer. The
 * inner element is the part that actually sticks.
 *
 * The content column is capped at `max-w-prose` because long technical prose
 * stops being readable somewhere around 80 characters. The right rail appears
 * only at `xl`. Below that there is not enough width for three columns without
 * squeezing the one that matters.
 */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-shell">
      <aside className="hidden w-60 shrink-0 border-r border-line bg-surface lg:block">
        <div className="sticky top-12 max-h-[calc(100vh-3rem)] overflow-y-auto px-3 py-6">
          <DocsSidebar />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 justify-center gap-10 px-4 py-10 sm:px-8 lg:py-14">
        <div className="min-w-0 max-w-prose flex-1">
          {children}
          <DocsPager />
        </div>

        <aside className="hidden w-48 shrink-0 xl:block">
          <div className="sticky top-20">
            <TableOfContents />
          </div>
        </aside>
      </div>
    </div>
  );
}
