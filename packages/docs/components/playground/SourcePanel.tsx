'use client';

import { useRef, useState } from 'react';
import { formatBytes } from '@lens-image/core/browser';
import { Upload } from '../Icons';
import { SAMPLE_IMAGES } from '@/lib/sample-images';
import { Panel } from './Panel';
import type { Source } from './config';

/**
 * The SOURCE panel: pick a bundled sample, or bring your own.
 *
 * The samples are laid out as gallery tiles: a picture, then a
 * two-line mono caption. The second line is the file's real format and byte
 * count, read from the generated `SAMPLE_IMAGES` table, so the caption is
 * information rather than decoration. (Every bundled sample is a JPEG, which is
 * why the format is a literal here rather than a field.)
 */
export function SourcePanel({
  source,
  onSample,
  onFile,
}: {
  source: Source | null;
  onSample: (src: string, name: string, sample: string) => void;
  onFile: (file: File) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <Panel title="Pick an image" tag="Source">
      <div className="flex flex-col gap-3.5">
        <ul className="grid grid-cols-3 gap-2">
          {SAMPLE_IMAGES.map((sample) => {
            const active = source?.sample === sample.name;
            return (
              <li key={sample.name} className="min-w-0">
                <button
                  type="button"
                  onClick={() =>
                    onSample(sample.src, `${sample.name.toLowerCase()}.jpg`, sample.name)
                  }
                  aria-pressed={active}
                  className="group block w-full rounded-lg text-left transition-transform duration-200 active:scale-[0.97]"
                >
                  <span
                    className={`relative block aspect-[4/3] overflow-hidden rounded-lg border transition-[border-color,box-shadow] duration-300 ${
                      active
                        ? 'border-accent shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_22%,transparent)]'
                        : 'border-line group-hover:border-line-strong'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={sample.src}
                      alt={sample.alt}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-500 ease-out-expo group-hover:scale-105"
                    />
                  </span>
                  <span className="mt-1.5 block font-mono text-[10.5px] leading-4">
                    <span className={`block ${active ? 'text-foreground' : 'text-secondary'}`}>
                      {sample.name}
                    </span>
                    <span className="block whitespace-nowrap text-muted">
                      JPEG · {formatBytes(sample.bytes)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div
          onDragEnter={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) onFile(file);
          }}
          className={`flex items-center gap-3 rounded-lg border border-dashed p-3 transition-colors ${
            dragging ? 'border-accent bg-accent/5' : 'border-line-strong bg-background'
          }`}
        >
          <Upload
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 transition-transform ${dragging ? 'scale-125 text-accent-bright' : 'text-muted'}`}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-secondary">Or drop your own</p>
            <p className="text-2xs text-muted">Never uploaded. Encoded in this tab.</p>
          </div>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="btn-secondary btn-sm"
          >
            Choose file
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            tabIndex={-1}
            aria-hidden="true"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
              e.target.value = '';
            }}
          />
        </div>

        {/* What is loaded right now, from the sniffed header and the file. */}
        {source ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[10.5px] leading-4">
            <dt className="text-muted">FILE</dt>
            <dd className="truncate text-secondary" title={source.name}>
              {source.name}
            </dd>
            <dt className="text-muted">INFO</dt>
            <dd className="text-secondary">
              {source.meta.format.toUpperCase()} · {source.meta.width}×{source.meta.height} ·{' '}
              {formatBytes(source.bytes)}
            </dd>
          </dl>
        ) : null}
      </div>
    </Panel>
  );
}
