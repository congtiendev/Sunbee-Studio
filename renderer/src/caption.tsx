import type { CSSProperties } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { ACCENT, EASE, SANS, emphasisIndexes, ramp } from "./motion";

/** Narration-length captions are long: shrink the type rather than cut text off. */
export function lengthScale(text: string): number {
  if (text.length > 160) return 0.75;
  if (text.length > 90) return 0.88;
  return 1;
}

/**
 * Words rising out of a blur — video-shotcraft's blur-slide technique: each
 * word's opacity, lift and blur all ride one eased progress, words staggered.
 * The whole reveal fits in `revealFrames` however many words there are.
 */
export function BlurSlideWords({
  text,
  emphasis,
  start = 0,
  revealFrames,
  wordFrames = 20,
  lift,
  blur,
  style,
  emphasisStyle,
}: {
  text: string;
  emphasis?: string;
  start?: number;
  revealFrames: number;
  wordFrames?: number;
  /** Max rise, in px. */
  lift: number;
  /** Max blur, in px. */
  blur: number;
  style?: CSSProperties;
  emphasisStyle?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const words = text.split(/\s+/).filter(Boolean);
  const accent = emphasisIndexes(words, emphasis);
  const stagger = words.length > 1 ? Math.min(4, Math.max(0.4, (revealFrames - wordFrames) / (words.length - 1))) : 0;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", columnGap: "0.26em", rowGap: "0.08em", ...style }}>
      {words.map((word, i) => {
        const p = ramp(frame, start + i * stagger, wordFrames, EASE.out);
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: p,
              transform: `translateY(${((1 - p) * lift).toFixed(2)}px)`,
              filter: p >= 0.999 ? undefined : `blur(${((1 - p) * blur).toFixed(2)}px)`,
              ...(accent.has(i) ? { color: ACCENT, ...emphasisStyle } : {}),
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
}

/** On-screen text over a picture: a lower-third bar or a centred title, revealed word by word (blur-slide). */
export function Caption({
  text,
  style,
  emphasis,
  durationInFrames,
  reveal = false,
}: {
  text: string;
  style: "lowerThird" | "title";
  emphasis?: string;
  durationInFrames: number;
  /** The bar itself rises in too (the lowerThirdCaption shot). */
  reveal?: boolean;
}) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const base = Math.min(width, height);
  const revealFrames = Math.max(12, Math.min(36, durationInFrames * 0.45));
  const bar = reveal ? ramp(frame, 0, 14, EASE.snappy) : 1;

  if (style === "title") {
    return (
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: base * 0.08 }}>
        <BlurSlideWords
          text={text}
          emphasis={emphasis}
          revealFrames={revealFrames}
          lift={base * 0.05}
          blur={14}
          style={{
            justifyContent: "center",
            textAlign: "center",
            fontFamily: SANS,
            fontWeight: 800,
            fontSize: base * 0.075 * lengthScale(text),
            lineHeight: 1.18,
            color: "#fff",
            textShadow: "0 4px 24px rgba(0,0,0,0.6)",
          }}
        />
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: height * 0.07 }}>
      <div
        style={{
          maxWidth: "86%",
          padding: `${base * 0.018}px ${base * 0.03}px`,
          borderRadius: base * 0.014,
          backgroundColor: `rgba(0,0,0,${(0.55 * bar).toFixed(3)})`,
          transform: `translateY(${((1 - bar) * base * 0.05).toFixed(2)}px)`,
        }}
      >
        <BlurSlideWords
          text={text}
          emphasis={emphasis}
          start={reveal ? 4 : 0}
          revealFrames={revealFrames}
          wordFrames={16}
          lift={base * 0.022}
          blur={8}
          style={{
            justifyContent: "center",
            textAlign: "center",
            fontFamily: SANS,
            fontWeight: 600,
            fontSize: base * 0.042 * lengthScale(text),
            lineHeight: 1.3,
            color: "#fff",
          }}
        />
      </div>
    </AbsoluteFill>
  );
}
