import type { CSSProperties } from 'react';
import styles from '../home.module.css';

export interface HeadlineLine {
  text: string;
  /** Applied to the line's words, e.g. a quieter colour for the second line. */
  className?: string;
}

/**
 * The hero headline, arriving one word at a time.
 *
 * It is still one `h1` to everything that is not looking at it. The visible
 * words are split into inline-blocks so each can rise on its own delay, and
 * that split copy is `aria-hidden`; a visually hidden span carries the whole
 * sentence in one piece, so a screen reader announces a single heading rather
 * than a run of fragments and a search engine reads the real string.
 *
 * It is plain CSS, so the server renders the final markup and there is no
 * state to hydrate. Under reduced motion the stylesheet drops the animation and
 * the words are simply there.
 */
export function SplitHeadline({
  lines,
  className,
  style,
  delay = 90,
  stagger = 60,
}: {
  lines: HeadlineLine[];
  className?: string;
  style?: CSSProperties;
  /** Milliseconds before the first word starts. */
  delay?: number;
  /** Milliseconds between one word's start and the next. */
  stagger?: number;
}) {
  let index = 0;

  return (
    <h1
      className={className}
      style={
        {
          ...style,
          '--word-delay': `${delay}ms`,
          '--word-stagger': `${stagger}ms`,
        } as CSSProperties
      }
    >
      <span className="sr-only">{lines.map((line) => line.text).join(' ')}</span>
      <span aria-hidden>
        {lines.map((line) => (
          <span key={line.text} className="block">
            {line.text.split(' ').map((word, i) => (
              <span key={i}>
                {i > 0 ? ' ' : null}
                <span
                  className={`${styles.word}${line.className ? ` ${line.className}` : ''}`}
                  style={{ '--i': index++ } as CSSProperties}
                >
                  {word}
                </span>
              </span>
            ))}
          </span>
        ))}
      </span>
    </h1>
  );
}
