import { useId, type CSSProperties } from 'react';
import styles from './playground.module.css';

/**
 * A slider in the studio's style: label on top, then a thin track with an
 * accent fill and a round thumb, and the value in mono on the right.
 *
 * It is a real `<input type="range">` underneath, so the keyboard model, the
 * touch behaviour and the screen-reader semantics are the browser's own. The
 * value is also written out as text beside it, because a thumb position alone
 * does not tell anyone the number.
 */
export function RangeField({
  label,
  value,
  min,
  max,
  disabled,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  hint?: React.ReactNode;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const fill = ((value - min) / (max - min)) * 100;

  return (
    <div>
      <label htmlFor={id} className="label mb-1 block">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
          className={styles.range}
          style={{ '--fill': `${fill}%` } as CSSProperties}
        />
        <output
          htmlFor={id}
          className="w-8 shrink-0 text-right font-mono text-xs tabular-nums text-foreground"
        >
          {value}
        </output>
      </div>
      {hint ? <p className="mt-1 text-2xs text-muted">{hint}</p> : null}
    </div>
  );
}
