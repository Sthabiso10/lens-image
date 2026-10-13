'use client';

import { useCallback, useRef, useState } from 'react';
import styles from './playground.module.css';

/**
 * A short log of what the playground is doing, in the order it does it.
 *
 * It is a streaming status ("Reading... Encoding... Done"), with
 * one hard rule: every line is written by the code that performs that stage, at
 * the moment it starts or finishes. Nothing here is on a timer, so the log
 * cannot claim a step that has not happened. "Done in 312 ms" is the measured
 * wall time of the encode, not a number made up to fit the animation.
 */
export type StatusTone =
  /** In flight. Shown with a pulsing dot. */
  | 'active'
  /** A stage that finished, with more to come. */
  | 'done'
  /** The last stage, settled on the real result. */
  | 'final'
  | 'error';

export interface StatusLine {
  readonly id: number;
  readonly text: string;
  readonly tone: StatusTone;
  /**
   * Which half of the pipeline wrote it. Loading a source and encoding it are
   * one story the first time (read, decode, encode), but a quality drag only
   * re-runs the encode, and should not append to a stale load.
   */
  readonly phase: 'source' | 'encode';
}

const MAX_LINES = 3;

export function useStatusLog() {
  const [lines, setLines] = useState<StatusLine[]>([]);
  const next = useRef(0);

  /**
   * Starts a new log. Every writer below returns the id of the line it made;
   * hold on to it and pass it to {@link patch}, which is how a slow async run
   * edits only its own line.
   */
  const restart = useCallback((text: string, phase: StatusLine['phase']): number => {
    const id = next.current++;
    setLines([{ id, text, tone: 'active', phase }]);
    return id;
  }, []);

  /** Adds a stage after the current ones, closing whatever was in flight. */
  const append = useCallback((text: string, phase: StatusLine['phase']): number => {
    const id = next.current++;
    setLines((previous) =>
      [
        ...previous.map((line) =>
          line.tone === 'active' ? { ...line, tone: 'done' as const } : line,
        ),
        { id, text, tone: 'active' as const, phase },
      ].slice(-MAX_LINES),
    );
    return id;
  }, []);

  /**
   * Begins the encode stage. Continues the log if a source was just loaded
   * (so the first run reads read, decode, encode); otherwise starts afresh, so
   * dragging the quality slider does not stack up a page of finished encodes.
   */
  const beginEncode = useCallback((text: string): number => {
    const id = next.current++;
    setLines((previous) => {
      const last = previous[previous.length - 1];
      if (last?.phase !== 'source' || last.tone === 'error') {
        return [{ id, text, tone: 'active', phase: 'encode' }];
      }
      return [
        ...previous.map((line) =>
          line.tone === 'active' ? { ...line, tone: 'done' as const } : line,
        ),
        { id, text, tone: 'active' as const, phase: 'encode' as const },
      ].slice(-MAX_LINES);
    });
    return id;
  }, []);

  /**
   * Rewrites one line in place, for progress and for settling it.
   *
   * It targets the line by the id its writer was given, not "whatever is
   * newest". Loads and encodes overlap (a sample click while an encode is still
   * running, two clicks in a row), and a slow run finishing late must not
   * overwrite the line a newer run is showing, nor settle it and make the
   * screen-reader region announce the wrong result. If that line has since been
   * pushed out of the log or the log restarted, the run was superseded and this
   * does nothing.
   */
  const patch = useCallback((id: number, text: string, tone?: StatusTone) => {
    setLines((previous) => {
      const index = previous.findIndex((line) => line.id === id);
      if (index === -1) return previous;
      const line = previous[index]!;
      const next = [...previous];
      next[index] = { ...line, text, tone: tone ?? line.tone };
      return next;
    });
  }, []);

  return { lines, restart, append, beginEncode, patch };
}

/**
 * Renders the log. Only the newest line can be pulsing; earlier ones are quiet
 * ticks. A fixed height keeps the panel from jumping as lines come and go.
 *
 * Screen readers get a separate live region that speaks only when the log
 * *settles* (done or failed), not on every progress tick, which during a slider
 * drag would be a stream of chatter.
 */
export function StatusLog({ lines }: { lines: readonly StatusLine[] }) {
  const last = lines[lines.length - 1];
  const announce = last && (last.tone === 'final' || last.tone === 'error') ? last.text : '';

  return (
    <div className="min-h-[3.75rem] border-t border-line px-3.5 py-2.5">
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>
      <ol aria-hidden="true" className="flex flex-col font-mono text-[11px] leading-5">
        {lines.map((line) => (
          <li key={line.id} className={`${styles.statusLine} flex items-center gap-2`}>
            {line.tone === 'active' ? (
              <span className={`${styles.pulse} size-1.5 shrink-0 rounded-full bg-accent-bright`} />
            ) : line.tone === 'error' ? (
              <span className="size-1.5 shrink-0 rounded-full bg-danger" />
            ) : (
              <svg
                viewBox="0 0 12 12"
                width={10}
                height={10}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`shrink-0 ${line.tone === 'final' ? 'text-signal' : 'text-muted'}`}
              >
                <path d="m2.5 6.5 2.3 2.3 4.7-5" />
              </svg>
            )}
            <span
              className={
                line.tone === 'final'
                  ? 'text-foreground'
                  : line.tone === 'error'
                    ? 'text-danger'
                    : line.tone === 'active'
                      ? 'text-secondary'
                      : 'text-muted'
              }
            >
              {line.text}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
