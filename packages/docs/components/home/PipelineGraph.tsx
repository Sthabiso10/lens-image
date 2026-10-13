import type { CSSProperties, ReactNode } from 'react';
import { Reveal } from '@/components/Reveal';
import styles from './home.module.css';
import { SectionHead } from './SectionHead';

/**
 * The node graph.
 *
 * Purely presentational, so the whole canvas is `aria-hidden` and the same
 * information is given to assistive tech as an ordered list instead. The
 * panels are simplified: the real pipeline has six stages (see the docs), and
 * this shows the five a reader makes decisions about.
 *
 * Geometry is authored once, in a 1000 x 400 coordinate space, and read twice:
 * the panels take their `left`/`width` as a percentage of 1000 and their `top`
 * and `height` in pixels, and the wires are drawn into an SVG with the same
 * viewBox. The canvas is exactly 400px tall, so one vertical unit is one pixel
 * and a wire's end always lands on its panel's port; only the horizontal axis
 * stretches, which the wires (curves with a fixed vertical profile) tolerate
 * and the panels (sized in %) simply follow.
 *
 * The absolute layout starts at `xl` (1280px), not `lg`: a panel is 16% of the
 * canvas, and at 1024px that is under 160px, too narrow for its text. From
 * `xl` a panel gets about 180px; below it the stacked column is used.
 */
type NodeSpec = {
  id: string;
  title: string;
  tag: string;
  /** Left edge and width, in 1000ths of the canvas width. */
  x: number;
  w: number;
  /**
   * Top edge and height in px. Each height is its content plus a little slack
   * (the tallest body, Encode, needs about 180), so a font that renders a pixel
   * taller never clips; `Panel` also clips its body as a backstop. Wires aim at
   * `y + h / 2`, so changing a height moves its wire with it.
   */
  y: number;
  h: number;
  body: ReactNode;
};

const Mono = ({ children }: { children: ReactNode }) => (
  <span className="font-mono text-xs text-secondary">{children}</span>
);

/** A slider drawn as a track, a fill and a knob. Not interactive. */
function Slider({ label, value, percent }: { label: string; value: string; percent: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-[3.25rem] flex-none font-mono text-2xs text-muted">{label}</span>
      <span className="relative h-1 flex-1 rounded-full bg-line-strong">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-accent"
          style={{ width: `${percent}%` }}
        />
        <span
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
          style={{ left: `${percent}%` }}
        />
      </span>
      <span className="w-8 flex-none text-right font-mono text-2xs tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

/** A format toggle: label on the left, a switch on the right. */
function Toggle({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <Mono>{label}</Mono>
      <span
        className={`flex h-3.5 w-6 items-center rounded-full px-0.5 ${
          on ? 'justify-end bg-accent' : 'justify-start bg-line-strong'
        }`}
      >
        <span className="h-2.5 w-2.5 rounded-full bg-foreground" />
      </span>
    </div>
  );
}

const NODES: NodeSpec[] = [
  {
    id: 'source',
    title: 'Source',
    tag: 'SOURCE',
    x: 12,
    w: 160,
    y: 70,
    h: 114,
    body: (
      <div className="flex flex-col gap-1.5">
        <Mono>photo.jpg · 4.2 MB</Mono>
        <span className="text-2xs text-muted">path, Buffer or URL</span>
      </div>
    ),
  },
  {
    id: 'validate',
    title: 'Validate',
    tag: 'GUARD',
    x: 216,
    w: 160,
    y: 250,
    h: 128,
    body: (
      <ul className="flex flex-col gap-1">
        {['sniff the bytes', 'max 100M pixels', 'max 25 MB'].map((line) => (
          <li key={line} className="flex items-center gap-2">
            <span className="h-1 w-1 flex-none rounded-full bg-muted" />
            <Mono>{line}</Mono>
          </li>
        ))}
      </ul>
    ),
  },
  {
    id: 'encode',
    title: 'Encode',
    tag: 'ENGINE',
    x: 420,
    w: 160,
    y: 36,
    h: 198,
    body: (
      <div className="flex flex-col gap-3">
        <Mono>sharp</Mono>
        <Slider label="quality" value="80" percent={80} />
        <Slider label="width" value="1200" percent={50} />
        <span className="text-2xs text-muted">EXIF stripped, no upscale</span>
      </div>
    ),
  },
  {
    id: 'formats',
    title: 'Formats',
    tag: 'OUTPUT',
    x: 624,
    w: 160,
    y: 236,
    h: 144,
    body: (
      <div className="flex flex-col gap-2">
        <Toggle label="avif" on />
        <Toggle label="webp" on />
        <Toggle label="jpg" on />
      </div>
    ),
  },
  {
    id: 'adapter',
    title: 'Adapter',
    tag: 'STORE',
    x: 828,
    w: 160,
    y: 70,
    h: 118,
    body: (
      <div className="flex flex-col gap-1.5">
        <Mono>S3Adapter</Mono>
        <span className="font-mono text-2xs text-muted">bucket: my-images</span>
      </div>
    ),
  },
];

/** What the screen-reader gets instead of the canvas. */
const STEP_DESCRIPTIONS = [
  'Source: a file path, Buffer, URL or stream becomes bytes.',
  'Validate: the format is sniffed from the bytes, and size and pixel limits are checked before any decoder runs.',
  'Encode: the engine, sharp by default, resizes and encodes each variant, with metadata stripped and no upscaling.',
  'Formats: each requested format, such as AVIF, WebP and JPEG, is produced independently.',
  'Adapter: every variant is stored through your storage adapter, for example S3.',
];

const CANVAS = { width: 1000, height: 400 };

/** A wire from a panel's right-hand port to the next panel's left-hand one. */
function wirePath(from: NodeSpec, to: NodeSpec) {
  const ox = from.x + from.w;
  const oy = from.y + from.h / 2;
  const ix = to.x;
  const iy = to.y + to.h / 2;
  const handle = (ix - ox) * 0.7;
  return `M ${ox} ${oy} C ${ox + handle} ${oy}, ${ix - handle} ${iy}, ${ix} ${iy}`;
}

function Port({ side, filled }: { side: 'left' | 'right' | 'top' | 'bottom'; filled?: boolean }) {
  const position = {
    left: '-left-[5px] top-1/2 -translate-y-1/2',
    right: '-right-[5px] top-1/2 -translate-y-1/2',
    top: '-top-[5px] left-1/2 -translate-x-1/2',
    bottom: '-bottom-[5px] left-1/2 -translate-x-1/2',
  }[side];

  return (
    <span
      className={`absolute h-2.5 w-2.5 rounded-full border ${position} ${
        filled ? 'border-accent bg-accent' : 'border-subtle bg-background'
      }`}
    />
  );
}

function Panel({
  node,
  index,
  ports,
  className,
  style,
}: {
  node: NodeSpec;
  index: number;
  ports: 'sides' | 'vertical';
  className?: string;
  style?: CSSProperties;
}) {
  const first = index === 0;
  const last = index === NODES.length - 1;
  const [before, after] = ports === 'sides' ? (['left', 'right'] as const) : (['top', 'bottom'] as const);

  return (
    <div
      className={`rounded-lg border border-line-strong bg-raised p-3 shadow-panel ${className ?? ''}`}
      style={style}
    >
      {first ? null : <Port side={before} />}
      {last ? null : <Port side={after} filled />}
      {/*
        The backstop clips the contents, not the panel: the ports poke 5px
        outside the panel's edge and must not be cut off.
      */}
      <div className="h-full overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-foreground">{node.title}</span>
          <span className="kicker !px-1 !py-px !text-[9.5px]">{node.tag}</span>
        </div>
        <div className="mt-2.5">{node.body}</div>
      </div>
    </div>
  );
}

export function PipelineGraph() {
  return (
    <section className="mx-auto max-w-shell px-4 py-20 sm:px-6 sm:py-28" aria-label="Pipeline">
      <SectionHead
        kicker="FLOW"
        title="Wire it up as a pipeline."
        lead="Every image goes through the same stages: read, sniff, validate, plan, encode, store. Swap the engine or the adapter and nothing else moves."
      />

      {/* Read this instead of the canvas. */}
      <ol className="sr-only">
        {STEP_DESCRIPTIONS.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>

      <Reveal delay={120} className="mt-12">
        <div
          aria-hidden="true"
          className="dot-grid relative overflow-hidden rounded-2xl border border-line bg-surface"
        >
          {/* Wide: absolutely positioned panels joined by dashed beziers. */}
          <div className="relative hidden xl:block" style={{ height: CANVAS.height }}>
            <svg
              className="absolute inset-0 h-full w-full"
              viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`}
              preserveAspectRatio="none"
              fill="none"
            >
              {NODES.slice(0, -1).map((node, i) => {
                const next = NODES[i + 1];
                return next ? (
                  <path
                    key={node.id}
                    d={wirePath(node, next)}
                    className={styles.wire}
                    stroke="var(--accent-bright)"
                    strokeOpacity={0.7}
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null;
              })}
            </svg>
            {NODES.map((node, i) => (
              <Panel
                key={node.id}
                node={node}
                index={i}
                ports="sides"
                className="absolute"
                style={{
                  left: `${node.x / 10}%`,
                  width: `${node.w / 10}%`,
                  top: node.y,
                  height: node.h,
                }}
              />
            ))}
          </div>

          {/* Narrow: a column, joined by short straight wires. */}
          <div className="flex flex-col items-center p-5 xl:hidden">
            {NODES.map((node, i) => (
              <div key={node.id} className="flex w-full max-w-xs flex-col items-center">
                {i === 0 ? null : (
                  <span className="h-7 w-px border-l border-dashed border-accent-bright/70" />
                )}
                <Panel node={node} index={i} ports="vertical" className="relative w-full" />
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
