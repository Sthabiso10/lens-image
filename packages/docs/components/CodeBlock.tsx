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
      className="group relative overflow-hidden rounded-lg border border-line bg-surface"
      data-language={language}
    >
      {filename ? (
        <figcaption className="flex items-center justify-between gap-4 border-b border-line px-3 py-2">
          <span className="font-mono text-xs text-muted">{filename}</span>
        </figcaption>
      ) : null}

      {/*
        The copy control sits over the code rather than in a toolbar. A header
        on every snippet is chrome the page does not need. It is always in the
        tab order, and shows on hover or focus.
      */}
      <div
        className={`absolute right-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 ${
          filename ? 'top-1.5' : 'top-2'
        }`}
      >
        <CopyButton value={code} />
      </div>

      <pre className="overflow-x-auto px-4 py-3.5 text-left text-sm leading-relaxed">
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
 *
 * `text-left` is explicit because this is used inside the centred hero, and a
 * command centred in its own box reads as decoration rather than something you
 * are meant to copy and run.
 */
export function CommandLine({ command }: { command: string }) {
  return (
    <div className="group flex items-center gap-2.5 rounded-lg border border-line bg-surface py-2 pl-3 pr-2 text-left">
      <span aria-hidden="true" className="select-none font-mono text-sm text-subtle">
        $
      </span>
      <code className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-sm text-foreground">
        {command}
      </code>
      <CopyButton value={command} />
    </div>
  );
}
