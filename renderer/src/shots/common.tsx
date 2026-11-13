import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Img } from "remotion";
import type { RenderManifestClip } from "../../../shared/types";

export interface ShotProps {
  clip: RenderManifestClip;
  /** The clip's picture, when it has one. */
  src?: string;
}

/** Where camera moves aim on a still with no known subject: centre, a little above (where subjects tend to sit). */
export const FOCUS = { x: 0.5, y: 0.45 };

export function Still({ src, style }: { src: string; style?: CSSProperties }) {
  return <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover", ...style }} />;
}

/** Stand-in behind the text when a clip has no picture. */
export function Backdrop() {
  return <AbsoluteFill style={{ background: "linear-gradient(135deg, #111827 0%, #1e293b 55%, #0f172a 100%)" }} />;
}

export function Picture({ src }: { src?: string }) {
  return src ? <Still src={src} /> : <Backdrop />;
}

/** Edge darkening; `strength` 0–1. */
export function Vignette({ strength, inner = 0.45 }: { strength: number; inner?: number }) {
  if (strength <= 0) return null;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 75% 75% at 50% 48%, rgba(0,0,0,0) ${inner * 100}%, rgba(0,0,0,${strength.toFixed(3)}) 100%)`,
      }}
    />
  );
}

/** Scales its content about the focus point — the "camera" for push-ins and punch-ins on a still. */
export function Camera({ scale, filter, children }: { scale: number; filter?: string; children: ReactNode }) {
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          transform: `scale(${scale.toFixed(5)})`,
          transformOrigin: `${FOCUS.x * 100}% ${FOCUS.y * 100}%`,
          filter,
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
