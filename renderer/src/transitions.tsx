// whip-pan and light-leak adapt video-shotcraft's transition/shot-transitions
// (whip-brake) and transition/transition-hidden-cut (light-leak-burn) demos
// (Apache License 2.0 — see renderer/NOTICE). Changed: split into the two
// halves either side of a hard cut, since Sunbee's clips don't overlap.
import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { ClipTransition, RenderManifestClip } from "../../shared/types";
import { EASE, clamp01, mix, ramp } from "./motion";

/** How much of a clip each half of a transition may take, at most. */
const EDGE = { fade: 12, whipOut: 8, whipIn: 18, leakOut: 27, leakIn: 43 };

function edgeFrames(want: number, duration: number): number {
  return Math.max(0, Math.min(want, Math.floor(duration / 3)));
}

interface EdgeLook {
  opacity: number;
  transform: string;
  filter: string;
  /** Light-leak strength, 0–1. */
  leak: number;
  /** Where the leak sits along its diagonal sweep, 0 (top-right) → 1 (bottom-left). */
  leakTravel: number;
}

function edgeLook(transition: ClipTransition, side: "in" | "out", frame: number, duration: number, direction: number): EdgeLook {
  const look: EdgeLook = { opacity: 1, transform: "", filter: "", leak: 0, leakTravel: 0 };
  if (transition === "fade") {
    const n = edgeFrames(EDGE.fade, duration);
    if (n > 0) look.opacity = side === "in" ? ramp(frame, 0, n, EASE.out) : 1 - ramp(frame, duration - n, n, EASE.smooth);
  } else if (transition === "whipPan") {
    // Out: accelerate off-frame (ease-in). In: arrive fast and brake with a long tail.
    const n = edgeFrames(side === "in" ? EDGE.whipIn : EDGE.whipOut, duration);
    if (n > 0) {
      const t = side === "in" ? 1 - ramp(frame, 0, n, EASE.snappy) : ramp(frame, duration - n, n, EASE.exit);
      if (t > 0.001) {
        const x = (side === "in" ? 1 : -1) * direction * 110 * t;
        look.transform = `translateX(${x.toFixed(2)}%) scaleX(${(1 + 0.08 * t).toFixed(4)})`;
        look.filter = `blur(${(t * 22).toFixed(2)}px)`;
      }
    }
  } else if (transition === "lightLeak") {
    // Out: the leak climbs (ease-in) to burn the frame at the cut. In: it recedes (ease-out) over the new picture.
    const n = edgeFrames(side === "in" ? EDGE.leakIn : EDGE.leakOut, duration);
    if (n > 0) {
      const strength =
        side === "out" ? Math.pow(clamp01((frame - (duration - n)) / n), 2) : 1 - ramp(frame, 0, n, EASE.out);
      look.leak = strength;
      look.leakTravel = side === "out" ? mix(0, 0.5, clamp01((frame - (duration - n)) / n)) : mix(0.5, 1, clamp01(frame / n));
      if (strength > 0.01) {
        look.filter = `brightness(${(1 + 0.6 * strength).toFixed(3)}) contrast(${(1 - 0.3 * strength).toFixed(3)}) saturate(${(1 - 0.3 * strength).toFixed(3)})`;
      }
    }
  }
  return look;
}

function LightLeak({ strength, travel }: { strength: number; travel: number }) {
  if (strength <= 0.01) return null;
  const x = mix(88, 12, travel);
  const y = mix(12, 88, travel);
  const a = strength;
  const core = Math.pow(strength, 3);
  const style: CSSProperties = {
    mixBlendMode: "screen",
    background:
      `radial-gradient(ellipse 70% 40% at ${x}% ${y}%, rgba(255,243,220,${core.toFixed(3)}) 0%, rgba(255,179,71,${(a * 0.85).toFixed(3)}) 28%, rgba(255,90,31,${(a * 0.55).toFixed(3)}) 55%, rgba(140,40,15,0) 80%), ` +
      `linear-gradient(225deg, rgba(255,150,60,${(a * 0.35).toFixed(3)}) 0%, rgba(255,150,60,0) 40%)`,
  };
  return <AbsoluteFill style={style} />;
}

/** Wraps a clip with the transition halves at its edges. */
export function TransitionEdges({ clip, children }: { clip: RenderManifestClip; children: ReactNode }) {
  const frame = useCurrentFrame();
  const d = clip.durationInFrames;
  // Alternate the whip direction so a run of whips doesn't always travel the same way.
  const direction = clip.sceneIndex % 2 === 0 ? 1 : -1;
  const lookIn = edgeLook(clip.transitionIn, "in", frame, d, -direction);
  const lookOut = edgeLook(clip.transitionOut, "out", frame, d, direction);
  const transform = [lookIn.transform, lookOut.transform].filter(Boolean).join(" ");
  const filter = [lookIn.filter, lookOut.filter].filter(Boolean).join(" ");
  const leak = lookOut.leak > lookIn.leak ? lookOut : lookIn;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000", overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          opacity: Math.min(lookIn.opacity, lookOut.opacity),
          transform: transform || undefined,
          filter: filter || undefined,
        }}
      >
        {children}
      </AbsoluteFill>
      <LightLeak strength={leak.leak} travel={leak.leakTravel} />
    </AbsoluteFill>
  );
}
