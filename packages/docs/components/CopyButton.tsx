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
      className="grid h-7 w-7 place-items-center rounded-md border border-line bg-raised text-muted transition-colors hover:border-line-strong hover:text-foreground"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-signal" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}
