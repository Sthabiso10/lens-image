import { CopyButton } from './CopyButton';
import { TOKEN_CLASS, tokenize } from '@/lib/highlight';

export interface CodeBlockProps {
  code: string;
  language?: string;
  /** Shown in the panel header. Without one, the panel has no header at all. */
  filename?: string;
}

export function CodeBlock({ code, language, filename }: CodeBlockProps) {
  const tokens = tokenize(code, language);

  return (
    <figure
      className="group relative overflow-hidden rounded-xl border border-line bg-surface"
      data-language={language}
    >
      {filename ? (
        <figcaption className="flex h-11 items-center justify-between gap-4 border-b border-line bg-raised/50 px-4">
          <span className="flex items-center gap-2 font-mono text-xs text-muted">
            {/* Three quiet dots: a panel, not a window. Decoration only. */}
            <span aria-hidden="true" className="flex gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
              <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
              <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
            </span>
            {filename}
          </span>
          {/* Gives way to the copy button, which appears in the same corner. */}
          {language ? (
            <span className="font-mono text-2xs uppercase tracking-[0.14em] text-muted transition-opacity group-focus-within:opacity-0 group-hover:opacity-0">
              {language}
            </span>
          ) : null}
        </figcaption>
      ) : null}

      {/*
        The copy control sits over the code rather than in a toolbar. A header
        on every snippet is chrome the page does not need. It is always in the
        tab order, and shows on hover or focus.
      */}
      <div
        className={`absolute right-2.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 ${
          filename ? 'top-1.5' : 'top-2.5'
        }`}
      >
        <CopyButton value={code} />
      </div>

      <pre className="overflow-x-auto px-4 py-4 text-left text-sm leading-relaxed">
        <code className="font-mono">
          {tokens.map((token, index) => (
            <span key={index} className={TOKEN_CLASS[token.kind]}>
              {token.value}
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}

/**
 * A single shell command, styled as a prompt line rather than a code panel.
 * Used for install instructions, where a panel would outweigh eight words.
 * It is a full pill (40px tall) so it can sit level with a `btn-light` beside it.
 *
 * `text-left` is explicit because this is used inside the centred hero, and a
 * command centred in its own box reads as decoration rather than something you
 * are meant to copy and run.
 *
 * The command never wraps, so on a phone it can be wider than the pill. It
 * scrolls sideways inside it instead of clipping, with the scrollbar hidden
 * (a 10px bar would not fit a 40px pill) and a soft fade on the right edge
 * under `sm` as the hint that there is more. The copy button sits outside the
 * scrolling text, so it stays in view whatever the length.
 */
export function CommandLine({ command }: { command: string }) {
  return (
    <div className="group flex h-10 items-center gap-2.5 rounded-full border border-line bg-surface pl-4 pr-0.5 text-left">
      <span aria-hidden="true" className="select-none font-mono text-sm text-subtle">
        $
      </span>
      <code
        // A scroll container with no focusable child is not reliably reachable
        // from the keyboard across browsers, so a long command could not be
        // scrolled by anyone without a pointer. The ring is inset because the
        // fade mask on phones clips anything drawn outside the box.
        tabIndex={0}
        role="group"
        aria-label="Shell command, scrolls sideways"
        className="flex-1 overflow-x-auto whitespace-nowrap rounded-sm font-mono text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-bright max-sm:pr-6 [-ms-overflow-style:none] [scrollbar-width:none] max-sm:[mask-image:linear-gradient(to_right,#000_calc(100%-1.5rem),transparent)] sm:text-sm [&::-webkit-scrollbar]:hidden"
      >
        {command}
      </code>
      <CopyButton value={command} />
    </div>
  );
}
