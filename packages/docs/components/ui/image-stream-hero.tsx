"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/* ── the corridor ────────────────────────────────────────────────
 * Two rails of cards ride from far behind the screen toward the
 * viewer. Perspective alone does the work that looks like two
 * animations: as a card's z grows it gets bigger *and* its screen x
 * sweeps outward from the vanishing point, because the projection
 * scales position and size by the same factor.
 *
 * Three things shape it, and each one fixes a specific artefact:
 *
 * 1. Depth is authored as *apparent size*, geometrically: each card
 *    is a constant ratio bigger than the one behind it, all the way
 *    out. Spacing a straight z-range evenly instead makes the near
 *    cards tear apart from each other as the projection blows up.
 * 2. The rails open hard in the first stretch and then hold
 *    (`fan` > 1). That opening cancels the (still slow) growth back
 *    there, so the ribbon leaves the centre as a flat band, bends
 *    once, and only then runs out on the diagonal. Parallel rails
 *    project to a straight cone with no bend at all.
 * 3. Neither end of the loop is ever on screen. A card dies with its
 *    inner edge past 50cqw, clear of the container's edge. And it is
 *    born *across* the axis: `railBirth` is negative, so the newest
 *    card starts on the far side and sweeps back through the centre.
 *    That plugs the throat: the axis stays covered at every instant,
 *    and a newborn lands behind cards that already cover it, so it
 *    needs no fade in. Birthing on its own side instead leaves a hole
 *    at dead centre that blinks open once every cycle.
 *
 * Every length is in `cqw`, a percentage of the container's width, 
 * so the whole corridor keeps its proportions at any size. The
 * defaults were fitted numerically against a reference recording's
 * card-height and edge-position profile, not eyeballed.
 * ─────────────────────────────────────────────────────────────── */

/**
 * Geometry of the corridor. Every length is `cqw`, a percentage of the
 * container's width, so the shape is resolution-independent.
 *
 * These interact: the ribbon only stays solid while consecutive cards
 * overlap, which needs `exitHeight / birthHeight` spread over enough
 * `cards`. Raising `exitHeight`, dropping `cards`, or pulling `railExit`
 * in all push toward a visible tear near the frame edge.
 */
export type CorridorPath = {
  /** Strength of the projection. Lower is a wider-angle, more dramatic rush. @default 30 */
  perspective?: number;
  /** Card width in world units. @default 18 */
  cardWidth?: number;
  /** Card height in world units. @default 25 */
  cardHeight?: number;
  /** Corner radius applied to each card. @default 0.4 */
  cardRadius?: number;
  /** On-screen card height at the waist, where a card is born. @default 2.6 */
  birthHeight?: number;
  /** On-screen card height as a card leaves the frame. @default 46 */
  exitHeight?: number;
  /**
   * Lateral offset at birth. Negative starts the card across the axis so the
   * centre never opens up: see note 3 above. @default -11
   */
  railBirth?: number;
  /** Lateral offset once the rails have finished opening. @default 44 */
  railExit?: number;
  /** How front-loaded the opening is. >1 opens early then holds. @default 3.3 */
  fan?: number;
  /** Y-rotation at birth, degrees. @default 6 */
  turnBirth?: number;
  /** Y-rotation at exit, degrees. @default 28 */
  turnExit?: number;
  /** Keyframe stops used to trace the curve. Raise only if motion looks faceted. @default 24 */
  stops?: number;
};

const PATH: Required<CorridorPath> = {
  perspective: 30,
  cardWidth: 18,
  cardHeight: 25,
  cardRadius: 0.4,
  birthHeight: 2.6,
  exitHeight: 46,
  railBirth: -11,
  railExit: 44,
  fan: 3.3,
  turnBirth: 6,
  turnExit: 28,
  stops: 24,
};

/** Sample the path once so the CSS keyframes trace the real curve. */
function keyframes(dir: 1 | -1, name: string, p: Required<CorridorPath>) {
  const steps: string[] = [];
  for (let s = 0; s <= p.stops; s++) {
    const u = s / p.stops;
    // Geometric in apparent size, so consecutive cards keep a constant size
    // ratio and the ribbon stays solid at both ends.
    const scale =
      (p.birthHeight / p.cardHeight) *
      Math.pow(p.exitHeight / p.birthHeight, u);
    const z = p.perspective * (1 - 1 / scale);
    const rail =
      p.railExit - (p.railExit - p.railBirth) * Math.pow(1 - u, p.fan);
    const turn = p.turnBirth + (p.turnExit - p.turnBirth) * u;
    steps.push(
      `${(u * 100).toFixed(2)}%{transform:translate3d(${(dir * rail).toFixed(
        2,
      )}cqw,0,${z.toFixed(2)}cqw) rotateY(${(-dir * turn).toFixed(2)}deg)}`,
    );
  }
  return `@keyframes ${name}{${steps.join("")}}`;
}

/**
 * Atmospheric depth: a black veil over each card that thins as it nears.
 *
 * Without it every card is equally bright from the vanishing point to the
 * frame edge, which reads as flat sprites being scaled up. Dimming the far
 * end sells the distance, and it keeps the busy throat of the corridor quiet
 * behind the headline. It is an opacity animation on its own layer, so it
 * stays on the compositor with the transforms instead of a per-frame filter.
 */
function fog(name: string) {
  return `@keyframes ${name}{0%{opacity:.82}35%{opacity:.38}70%{opacity:.08}100%{opacity:0}}`;
}

export type StreamImage = {
  src: string;
  /** Only used if you drop the decorative treatment; the corridor is aria-hidden. */
  alt?: string;
};

export type ImageStreamHeroProps = {
  /**
   * Images cycled onto the rails. Both rails run the same sequence, so the
   * corridor reads as one mirrored stream. Fewer than `cards` simply repeat.
   */
  images: StreamImage[];
  /**
   * Cards on each rail at once. More cards means a denser corridor, not a
   * faster one: spacing is derived from this and `speed`. Drop it far below
   * the default and consecutive cards grow too fast to stay overlapped near
   * the exit, which tears a gap in the ribbon.
   * @default 9
   */
  cards?: number;
  /**
   * Seconds for one card to travel the whole corridor.
   * @default 18
   */
  speed?: number;
  /**
   * Vertical placement of the corridor's axis, as a percentage of height.
   * @default 55
   */
  axis?: number;
  /**
   * Classes for the layer that holds the corridor, under the children. The
   * hook for anything that should move the corridor as a whole, like a scroll
   * effect, without fighting the transforms the component sets itself.
   */
  stageClassName?: string;
  /** Override any part of the corridor geometry. Merged over the defaults. */
  path?: CorridorPath;
  /** Content rendered above the corridor. */
  children?: React.ReactNode;
  className?: string;
};

export function ImageStreamHero({
  images,
  cards = 9,
  speed = 18,
  axis = 55,
  path,
  stageClassName,
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & ImageStreamHeroProps) {
  const id = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const right = `ish-r-${id}`;
  const left = `ish-l-${id}`;
  const card = `ish-c-${id}`;
  const veil = `ish-f-${id}`;
  const haze = `ish-fog-${id}`;

  const p = React.useMemo(() => ({ ...PATH, ...path }), [path]);
  // A custom property, so a page can move the axis per breakpoint with a class
  // (`[--ish-axis:78%] sm:[--ish-axis:52%]`) instead of a re-render.
  const axisAt = `var(--ish-axis, ${axis}%)`;

  const root = React.useRef<HTMLDivElement>(null);
  const stage = React.useRef<HTMLDivElement>(null);
  const [offscreen, setOffscreen] = React.useState(false);

  // Eighteen cards on a 3D path are not free. Once the hero has scrolled out
  // of view nobody is watching, so the whole corridor holds still until it is
  // back. Cards and their veils pause together, so they stay in step.
  React.useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) =>
      setOffscreen(!entry?.isIntersecting),
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // The corridor leans a few degrees toward the pointer, so the frame reads
  // as a space you are standing in rather than a video playing behind the
  // copy. Eased toward the target every frame, never snapped, and only for a
  // real mouse: on touch there is no hover to follow.
  React.useEffect(() => {
    const el = root.current;
    const target = stage.current;
    if (!el || !target) return;
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduced) return;

    let goalX = 0;
    let goalY = 0;
    let x = 0;
    let y = 0;
    let frame = 0;

    const tick = () => {
      x += (goalX - x) * 0.06;
      y += (goalY - y) * 0.06;
      target.style.transform = `rotateX(${(-y * 3).toFixed(3)}deg) rotateY(${(x * 5).toFixed(3)}deg)`;
      frame =
        Math.abs(goalX - x) > 0.0005 || Math.abs(goalY - y) > 0.0005
          ? requestAnimationFrame(tick)
          : 0;
    };

    const onMove = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      goalX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      goalY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const onLeave = () => {
      goalX = 0;
      goalY = 0;
      if (!frame) frame = requestAnimationFrame(tick);
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(frame);
    };
  }, []);

  const css = React.useMemo(
    () =>
      `${keyframes(1, right, p)}${keyframes(-1, left, p)}${fog(haze)}` +
      `[data-offscreen] .${card},[data-offscreen] .${veil}{animation-play-state:paused}` +
      // Pausing rather than disabling keeps the corridor whole: every card is
      // already dropped mid-flight by its negative delay, so it freezes as a
      // finished still instead of collapsing onto the axis.
      `@media(prefers-reduced-motion:reduce){.${card},.${veil}{animation-play-state:paused}}`,
    [right, left, card, veil, haze, p],
  );

  return (
    <div
      ref={root}
      className={cn("relative overflow-hidden", className)}
      data-offscreen={offscreen ? "" : undefined}
      {...props}
      style={{ containerType: "inline-size", ...props.style }}
    >
      <style>{css}</style>

      {/*
        The arrival: the corridor pulls in from a little further back and out
        of the dark, so the first frame is a camera settling rather than a
        wall of pictures that was simply there.
      */}
      <div
        aria-hidden
        className={cn("pointer-events-none absolute inset-0", stageClassName)}
        style={{ transformOrigin: `50% ${axisAt}` }}
      >
        <div
          className="absolute inset-0"
          style={{
            transformOrigin: `50% ${axisAt}`,
            animation: "ish-arrive 2.4s var(--ease-out-expo, ease-out) both",
          }}
        >
          <style>{`@keyframes ish-arrive{from{opacity:0;transform:scale(.82)}to{opacity:1;transform:none}}`}</style>
          <div
            className="absolute inset-0"
            style={{
              perspective: `${p.perspective}cqw`,
              perspectiveOrigin: `50% ${axisAt}`,
            }}
          >
            <div
              ref={stage}
              className="absolute inset-0"
              style={{
                transformStyle: "preserve-3d",
                transformOrigin: `50% ${axisAt}`,
                willChange: "transform",
              }}
            >
              {[right, left].map((name) =>
                Array.from({ length: cards }, (_, i) => {
                  // Both rails walk the same sequence, so the left side mirrors
                  // the right at every depth.
                  const img = images[i % Math.max(images.length, 1)];
                  // Negative delay drops each card mid-flight, so the corridor
                  // is already full on the first frame.
                  const delay = `${-(i * speed) / cards}s`;
                  return (
                    <div
                      key={`${name}-${i}`}
                      className={cn(card, "absolute overflow-hidden bg-surface")}
                      style={{
                        left: "50%",
                        top: axisAt,
                        width: `${p.cardWidth}cqw`,
                        height: `${p.cardHeight}cqw`,
                        marginLeft: `${-p.cardWidth / 2}cqw`,
                        marginTop: `${-p.cardHeight / 2}cqw`,
                        borderRadius: `${p.cardRadius}cqw`,
                        animation: `${name} ${speed}s linear infinite`,
                        animationDelay: delay,
                        backfaceVisibility: "hidden",
                      }}
                    >
                      {img ? (
                        <img
                          src={img.src}
                          alt={img.alt ?? ""}
                          decoding="async"
                          className="h-full w-full object-cover"
                          draggable={false}
                        />
                      ) : null}
                      {/* A hairline catching the light, so neighbours separate. */}
                      <span
                        className="absolute inset-0 ring-1 ring-inset ring-white/10"
                        style={{ borderRadius: "inherit" }}
                      />
                      <span
                        className={cn(veil, "absolute inset-0 bg-background")}
                        style={{
                          animation: `${haze} ${speed}s linear infinite`,
                          animationDelay: delay,
                        }}
                      />
                    </div>
                  );
                }),
              )}
            </div>
          </div>
        </div>
      </div>

      {children}
    </div>
  );
}

export default ImageStreamHero;
