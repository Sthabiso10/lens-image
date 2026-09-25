'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from './Icons';

/**
 * Copy-to-clipboard with a two-second confirmation.
 *
 * `navigator.clipboard` is undefined on insecure origins and inside some
 * embedded webviews, so the failure path is silent rather than a thrown
 * promise in the console.
 */
export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Clipboard unavailable. The code is selectable either way. */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? 'Copied' : label}
      className={`grid h-7 w-7 place-items-center rounded-md border bg-raised text-muted transition-[color,border-color,transform] duration-200 hover:text-foreground active:scale-90 ${
        copied ? 'border-signal/40' : 'border-line hover:border-line-strong'
      }`}
    >
      {/*
        Keyed, so each swap remounts and plays the pop from the start. The copy
        icon only pops on its way back, not on every page load.
      */}
      {copied ? (
        <Check key="check" className="h-3.5 w-3.5 animate-pop text-signal" />
      ) : (
        <Copy key="copy" className={`h-3.5 w-3.5 ${timer.current ? 'animate-pop' : ''}`} />
      )}
    </button>
  );
}
