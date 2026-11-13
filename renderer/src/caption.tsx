import type { CSSProperties } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

export const FONT_FAMILY = '"Be Vietnam Pro", "Noto Sans", "Segoe UI", Roboto, Arial, sans-serif';

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Narration-length captions are long: shrink the type rather than cut text off. */
function lengthScale(text: string): number {
  if (text.length > 160) return 0.75;
  if (text.length > 90) return 0.88;
  return 1;
}

/** On-screen text for a clip. `reveal` slides it up from below instead of a plain fade (the lowerThirdCaption shot). */
export function Caption({
  text,
  style,
  reveal = false,
}: {
  text: string;
  style: "lowerThird" | "title";
  reveal?: boolean;
}) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const base = Math.min(width, height);
  const opacity = interpolate(frame, [0, 8], [0, 1], CLAMP);
  const lift = reveal ? interpolate(frame, [0, 12], [base * 0.06, 0], CLAMP) : 0;

  const textStyle: CSSProperties = {
    fontFamily: FONT_FAMILY,
    color: "#fff",
    lineHeight: 1.3,
    textAlign: "center",
    whiteSpace: "pre-wrap",
    opacity,
    transform: `translateY(${lift}px)`,
  };

  if (style === "title") {
    return (
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: base * 0.08 }}>
        <div
          style={{
            ...textStyle,
            fontSize: base * 0.075 * lengthScale(text),
            fontWeight: 800,
            textShadow: "0 4px 24px rgba(0,0,0,0.6)",
          }}
        >
          {text}
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: height * 0.07 }}>
      <div
        style={{
          ...textStyle,
          maxWidth: "86%",
          fontSize: base * 0.042 * lengthScale(text),
          fontWeight: 600,
          padding: `${base * 0.018}px ${base * 0.03}px`,
          borderRadius: base * 0.014,
          backgroundColor: "rgba(0,0,0,0.55)",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
}
