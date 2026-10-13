'use client';

import { useId } from 'react';
import type { BrowserFormat } from '@/lib/encode';
import { Field, Panel } from './Panel';
import { RangeField } from './RangeField';
import { FORMATS, KEY_TEMPLATES, WIDTH_PRESETS } from './config';

/**
 * An item in a `segmented` track. `aria-pressed` carries the on/off state for
 * assistive tech, and it is also what the stylesheet reads to draw the active
 * (cream) pill. A disabled chip is dimmed by the stylesheet; the strike-through
 * is added here because it means "your browser cannot do this", which is
 * specific to the format chips.
 */
function Chip({
  on,
  disabled,
  mono,
  title,
  onClick,
  children,
}: {
  on: boolean;
  disabled?: boolean;
  mono?: boolean;
  title?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={on}
      title={title}
      onClick={onClick}
      className={`segmented-item ${mono ? 'font-mono' : ''} ${disabled ? 'line-through' : ''}`}
    >
      {children}
    </button>
  );
}

/** FORMAT: which encoder to run. Formats this browser cannot encode are disabled. */
export function FormatPanel({
  format,
  available,
  onChange,
}: {
  format: BrowserFormat;
  available: readonly BrowserFormat[];
  onChange: (format: BrowserFormat) => void;
}) {
  return (
    <Panel title="Format" tag="Encoder">
      <div role="group" aria-label="Output format" className="segmented flex-wrap">
        {FORMATS.map((entry) => {
          // Until detection has run, nothing is disabled.
          const supported = available.length === 0 || available.includes(entry.id);
          return (
            <Chip
              key={entry.id}
              mono
              on={format === entry.id}
              disabled={!supported}
              title={supported ? undefined : 'Your browser cannot encode this format'}
              onClick={() => onChange(entry.id)}
            >
              {entry.label}
            </Chip>
          );
        })}
      </div>
    </Panel>
  );
}

/** QUALITY / SIZE: the two things that change the bytes. */
export function CompressionPanel({
  format,
  quality,
  onQuality,
  presetIndex,
  onPreset,
}: {
  format: BrowserFormat;
  quality: number;
  onQuality: (quality: number) => void;
  presetIndex: number;
  onPreset: (index: number) => void;
}) {
  const preset = WIDTH_PRESETS[presetIndex]!;

  return (
    <Panel title="Quality and size" tag="Effect">
      <div className="flex flex-col gap-4">
        <RangeField
          label="Quality"
          min={10}
          max={100}
          value={quality}
          disabled={format === 'png'}
          onChange={onQuality}
          hint={
            format === 'png'
              ? 'PNG is lossless, quality does nothing.'
              : 'Drag it and watch the bytes move.'
          }
        />

        <Field
          label="Sizes"
          hint={
            preset.widths.length > 0
              ? `${preset.widths.join(' · ')} px wide`
              : 'The original width, one file.'
          }
        >
          <div role="group" aria-label="Width preset" className="segmented flex-wrap">
            {WIDTH_PRESETS.map((entry, index) => (
              <Chip key={entry.label} on={index === presetIndex} onClick={() => onPreset(index)}>
                {entry.label}
              </Chip>
            ))}
          </div>
        </Field>
      </div>
    </Panel>
  );
}

const INPUT_CLASS =
  'h-10 w-full rounded-lg border border-line-strong bg-background px-3 font-mono text-xs text-foreground transition-colors duration-150 placeholder:text-muted focus-visible:border-accent-bright';

/** OUTPUT: how the files would be named in storage. */
export function OutputPanel({
  keyTemplate,
  onKeyTemplate,
  prefix,
  onPrefix,
}: {
  keyTemplate: string;
  onKeyTemplate: (template: string) => void;
  prefix: string;
  onPrefix: (prefix: string) => void;
}) {
  const templateId = useId();
  const prefixId = useId();

  return (
    <Panel title="Naming" tag="Output">
      <div className="flex flex-col gap-3.5">
        <Field label="Key template" htmlFor={templateId}>
          <select
            id={templateId}
            value={keyTemplate}
            onChange={(e) => onKeyTemplate(e.target.value)}
            className={INPUT_CLASS}
          >
            {KEY_TEMPLATES.map((template) => (
              <option key={template} value={template}>
                {template}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Prefix" htmlFor={prefixId}>
          <input
            id={prefixId}
            type="text"
            value={prefix}
            placeholder="products"
            onChange={(e) => onPrefix(e.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
      </div>
    </Panel>
  );
}
